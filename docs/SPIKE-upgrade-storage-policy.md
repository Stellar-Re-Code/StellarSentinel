# SPIKE: Upgrade authorization and storage-compatibility policy for deployed Sentinel contracts

> Status: **Spike / decision record** — time-boxed investigation, not an implementation.
> Resolves the questions in issue #83. Performing an upgrade or deploying to mainnet is
> **explicitly out of scope**.

## 1. Context

All four Sentinel contracts (`treasury`, `governance`, `token-vault`, `access-control`) already
ship a live `upgrade()` entrypoint that calls Soroban's
[`env.deployer().update_current_contract_wasm(new_wasm_hash)`](https://developers.stellar.org/docs/build/guides/conversions/contract-upgrades):

| Contract | Entrypoint | Gate |
|---|---|---|
| `treasury` | [`upgrade(env, admin, new_wasm_hash)`](../smartcontract/contracts/treasury/src/lib.rs) | `require_admin` — stored `DataKey::Admin` **and** ACL role `>= Admin` |
| `governance` | [`upgrade(env, admin, new_wasm_hash)`](../smartcontract/contracts/governance/src/lib.rs) | `require_admin` — stored `DataKey::Admin` **and** ACL role `>= Admin` |
| `token-vault` | [`upgrade(env, admin, new_wasm_hash)`](../smartcontract/contracts/token-vault/src/lib.rs) | `require_admin` — stored `DataKey::Admin` **and** ACL role `>= Admin` |
| `access-control` | [`upgrade(env, owner, new_wasm_hash)`](../smartcontract/contracts/access-control/src/lib.rs) | stored `DataKey::Owner` (self-referential — ACL *is* the RBAC source of truth) |

Every one of these is gated by a **single Address's `require_auth()`** — the same shape as an
EOA-controlled admin key, not the signer-threshold multisig that already protects treasury
withdrawals ([`approve`/`execute`](../smartcontract/contracts/treasury/src/lib.rs)) or the
threshold-gated emergency pause added in
[`TREASURY_EMERGENCY_PAUSE.md`](TREASURY_EMERGENCY_PAUSE.md). None of the four `upgrade()`
functions emits an event, so today an upgrade leaves **no on-chain audit trail** an indexer can
pick up — contrast with every other mutating call in these contracts, which publishes a
`(contract, topic)` event (see the Event Reference tables in
[`SMARTCONTRACT_GUIDE.md`](SMARTCONTRACT_GUIDE.md)).

This spike answers: who should be able to authorize an upgrade, how is that authority audited,
how do we detect an incompatible storage change before it reaches testnet/mainnet, and what is
the honest rollback story if an upgrade goes wrong.

## 2. Soroban upgrade mechanics (what `update_current_contract_wasm` actually does)

- It swaps the WASM code hash the contract's on-chain **instance** points to, in the same
  transaction/invocation that calls it. The contract address, and every existing `Instance`,
  `Persistent`, and `Temporary` storage entry under that address, is untouched by the call itself
  — only the code that will interpret those bytes on the *next* invocation changes, effective as
  soon as the transaction succeeds. No canary, no dual-run, no automatic drain/pause.
- The **old WASM is not deleted.** Soroban keeps uploaded contract code keyed by its hash
  (`ContractCodeEntry`) independently of which contract instance references it. As long as the
  old hash is still known and still resolvable on the target network (subject to that network's
  code-entry TTL/archival rules), calling `upgrade()` again with the old hash **is** a valid
  rollback of the code. See §5 for what a code-only rollback does and does not undo.
- There is no built-in versioning, changelog, or compatibility check. Soroban does not compare
  the old and new WASM's storage schema for you — that responsibility is entirely on the
  contract author and the upgrade process.

## 3. Storage-layout risk: what actually breaks Soroban storage keys

> Corrected after maintainer review of the first draft, which incorrectly claimed `DataKey`
> storage keys are declaration-order discriminants. Verified directly against
> `soroban-sdk-macros` v21.7.7's `#[contracttype]` derive (`derive_enum.rs`, `derive_struct.rs`,
> vendored at `~/.cargo/registry/src/.../soroban-sdk-macros-21.7.7/src/`).

- **Enum variants** (`DataKey`, `ProposalAction`, `ProposalStatus`, …): a unit variant encodes as
  `ScVal::Symbol(<variant name>)`; a tuple variant (e.g. `DataKey::Transaction(u64)`) encodes as a
  vec whose first element is that same `Symbol` followed by its fields
  (`(Symbol("Transaction"), u64)`). The storage key is the variant's **name string**, not its
  position in the source. **Reordering variants, or inserting a new one anywhere in the
  declaration, is safe** — no existing key changes. **Renaming a variant, or removing one that
  still has live storage under it, is the real breaking change**: the old symbol's data becomes
  unreachable, and if the name is reused for a different variant, misinterpreted.
- **Struct fields** (`TreasuryConfig`, `Transaction`, `Proposal`, `TokenLock`, `VestingSchedule`,
  `RoleAssignment`, …): `#[contracttype] struct` values encode as an `ScMap` **sorted by field
  name** and keyed by `ScSymbol(<field name>)`. Declaration order is irrelevant for the same
  reason as enums. **Renaming a field** breaks decoding of existing entries (the old key is gone).
  **Removing a field** silently orphans the value already on ledger. **Adding a field** is
  additive at the Rust-type level, but soroban-sdk's derived `TryFromVal` for `#[contracttype]`
  structs requires every declared field to be present in the map — so in practice **adding a
  required field still breaks decoding of previously-stored entries** unless paired with a
  migration that backfills the new key, not just an additive Rust change.
- Within one tuple variant/tuple struct, the field **types and count are still positional** —
  changing a tuple field's type or inserting one in the middle of an existing tuple variant
  changes what that variant decodes to, same as any binary format.

So the real compatibility contract is **name- and shape-stability of every variant and field that
already has live data** — not declaration order. None of the four contracts currently has an
automated check for this: `cargo build`/`cargo test` will happily compile a WASM that renames or
drops a `DataKey` variant or a stored struct's field; Rust's type system has no notion that a
variant/field *name* is load-bearing on-chain state.

## 4. Version/storage compatibility matrix

| Contract | Storage keys (`DataKey`) | Versioned fields today | On-chain code-version discovery | Cross-contract coupling that an upgrade must not break |
|---|---|---|---|---|
| `treasury` | `Admin`, `Asset`, `Threshold`, `Signers`, `Balance`, `Transaction(u64)`, `TxCounter`, `Initialized`, `PolicyVersion`, `AclAddress`, `GovernanceAddress`, `GovExecuted(Address, u64)`, `PauseState`, `PauseCounter`, `PauseRequest(u64)` | `PolicyVersion` (u32, invalidates stale multisig proposals); `PauseState.version` (u64, monotonic) | **None** — no `version()`/`contractmeta!` query | Called by `governance` via `execute_governance_withdrawal`; reads `access-control` roles via `AclAddress` |
| `governance` | `Admin`, `Initialized`, `Members`, `QuorumPercent`, `VotingPeriod`, `ProposalCounter`, `Proposal(u64)`, `Vote(u64, Address)`, `AclAddress`, `TreasuryAddress` | `Proposal.policy_version` (snapshots treasury's `PolicyVersion` at proposal-pass time); `Proposal.exec_deadline` | **None** | Calls `treasury.execute_governance_withdrawal`; reads `access-control` roles |
| `token-vault` | `Admin`, `Asset`, `Initialized`, `EmergencySigners`, `EmergencyThreshold`, `LockCounter`, `Lock(u64)`, `EmergencyApprovals(u64)`, `VestingCounter`, `Vesting(u64)`, `TotalLocked`, `AclAddress` | none | **None** | Reads `access-control` roles |
| `access-control` | `Initialized`, `Owner`, `PendingOwner`, `Role(Address)`, `AllMembers`, `RoleCount(u32)` | `EVENT_SCHEMA_VERSION` (u32 constant, event payloads only — **not** a storage or code version) | **None** | Read by all three other contracts for every privileged call; a storage-incompatible ACL upgrade breaks every other contract's authorization checks in the same block |

**Reading the matrix:** every contract already has at least one integer counter it bumps on a
meaningful state transition (`PolicyVersion`, `PauseState.version`, `EVENT_SCHEMA_VERSION`) —
the codebase clearly understands the pattern. What's missing is the same treatment applied to
*code* identity: none of the four exposes what WASM version is currently live, so there is no
way to answer "what is deployed right now" without independently tracking deploy transactions
off-chain. `access-control` is the highest-blast-radius target: every other contract's
privileged path depends on it staying storage-compatible, and it upgrades on the single-signature
`Owner` gate like the rest.

## 5. Rollback and irreversibility — the honest statement

- **Code rollback is possible, storage rollback is not, in general.** Calling `upgrade()` again
  with the previous WASM hash reverts *behavior* if that hash is still resolvable. It does
  **not** revert any storage writes the bad version made while it was live — deposits, approvals,
  executed withdrawals, role changes, and any storage-key/struct-shape change it introduced stay
  exactly as written. If the bad version wrote under a renamed or reshaped `DataKey` variant or
  struct field (§3), the old code may not even be able to read what the bad version wrote.
- **A storage-incompatible upgrade is not recoverable by rollback alone.** If new code renames or
  drops a `DataKey` variant or a stored struct's field (§3) and processes even one write before
  the problem is caught, rolling the code back does not un-corrupt that entry — a migration or
  manual remediation is required, and for funds-custody state (treasury balance, executed
  transactions, vesting `claimed_amount`) there may be no way to reconstruct the correct value
  from on-chain data alone.
- **There is no dry-run or simulation gate today.** Nothing prevents `upgrade()` from being
  called directly against a live contract with real custody. The only thing standing between
  "deploy WASM" and "funds move under it" is whatever discipline the deployer applies manually.
- **Conclusion:** treat every upgrade as irreversible with respect to storage from the moment the
  first post-upgrade write happens. Rollback is a code-only safety net for "the new logic has a
  bug and hasn't touched storage incompatibly yet," not a general undo.

## 6. Admin/key risk

- `treasury`, `governance`, `token-vault` upgrades require the caller to equal the contract's
  own `DataKey::Admin` **and** hold `Admin`-or-above in `access-control` — two checks, but both
  resolve to whatever single `Address` currently holds those roles. There is no requirement that
  this be a multisig account; Soroban's `Address` abstraction allows it to be one, but nothing in
  these contracts enforces it.
- `access-control`'s own upgrade bypasses even that: it checks the caller against
  `DataKey::Owner` directly, with no ACL cross-check (correct, since ACL *is* the authority), but
  that means the single Owner key is a full upgrade key for the contract every other contract
  trusts for authorization.
- Compare this to the multisig threshold already required for treasury **withdrawals** and the
  emergency pause (`TREASURY_EMERGENCY_PAUSE.md`): the codebase already treats "move funds" and
  "pause the treasury" as too sensitive for one key, but "replace the code that decides all of
  the above" is currently *less* protected than either.
- No timelock exists anywhere in the upgrade path — an upgrade transaction is authorized and
  effective in the same ledger close.

## 7. Options considered

| Option | Mechanism | Pros | Cons |
|---|---|---|---|
| **A. Status quo** (single admin/owner key, no delay) | `require_auth()` on one `Address` | Simple, cheap, already shipped | Single key compromise = instant, silent code replacement of custody logic; no audit trail (no event); no time to react |
| **B. Timelock only** | Same single-key authorization, but `upgrade()` becomes propose-now/execute-after-delay, mirroring `Proposal.exec_deadline` | Gives operators/watchers a reaction window; small code delta (reuse the counter+timestamp pattern already used for pause requests and governance execution deadlines) | Still one key decides *what* gets queued; a compromised key can still eventually push anything if nobody is watching |
| **C. Multisig threshold, no timelock** | Reuse the treasury/vault signer-threshold pattern: N of M approvals required before `update_current_contract_wasm` fires | No single point of compromise; consistent with how the codebase already gates withdrawals and pause | No cooling-off window; a colluding/compromised threshold acts as fast as option A |
| **D. Governed upgrade (multisig + timelock)** | Extend `governance`'s `ProposalAction` with a new upgrade action (or add an equivalent propose/approve/timelock/execute flow directly on each contract, mirroring `PauseState`); requires quorum vote **and** a mandatory delay before the wasm hash can be applied; upgrade emits an event | Highest assurance; matches the exact shape the codebase already validated for emergency pause (`TREASURY_EMERGENCY_PAUSE.md`) and governance-triggered treasury execution (`execute_governance_withdrawal`); auditable event trail; reaction window before code goes live | Most implementation and test surface; slower to ship an urgent security patch (mitigate with a separate, more tightly scoped emergency path — see Recommendation) |

## 8. Recommendation (the decision)

**Adopt Option D — governed upgrade — for `treasury`, `governance`, and `token-vault`, and a
scoped variant of it for `access-control`, with a narrow, separately-authorized emergency path
for security patches.** Concretely:

1. **Two-step, threshold-gated, time-delayed upgrade**, modeled directly on the pattern already
   proven in `PauseState`/`PauseRequest`: `propose_upgrade(proposer, new_wasm_hash)` records a
   request with the current `PolicyVersion`/role snapshot and a `ready_at` ledger timestamp;
   independent signers `approve_upgrade`; once threshold is met **and** `ready_at` has passed,
   any signer calls `execute_upgrade` to actually invoke `update_current_contract_wasm`. Reuse
   the existing invalidate-on-policy-change discipline (`PolicyInvalidated`-style check) so a
   signer-set or threshold change invalidates a stale pending upgrade instead of letting it
   execute under authority nobody currently agrees to.
2. **`access-control` gets the same shape, gated by Owner + a fixed minimum delay** (it has no
   signer set to thresholdize against without redesigning its role model, which is out of
   scope) — the delay alone is the meaningful improvement over instant, single-key code
   replacement for the contract everything else trusts.
3. **Every upgrade step emits an event** — `(contract, up_prop)`, `(contract, up_ap)`,
   `(contract, up_exec)` — following the exact `EVENT_SCHEMA_VERSION`-tagged shape ACL already
   uses, so indexers and the ISSUES-devops dashboards can reconstruct upgrade history the same
   way they do pause history.
4. **A narrow emergency path stays available but is not weakened**: for a live exploit, the
   *existing* signer threshold may vote to execute an upgrade with `ready_at` waived only if a
   supermajority (stricter than the normal threshold) approves — this is a policy detail for the
   implementation issue, not resolved here; the non-negotiable constraint is that "emergency"
   must still require more than one key, never fewer.
5. **Storage-compatibility is a process control, not a runtime one.** Soroban cannot check this
   for us (§3), so it must be enforced before code ever reaches `propose_upgrade`:
   - `DataKey`-style enums and stored structs alike: variant/field **names are the storage key**,
     so reordering or inserting is safe, but PR review must reject any diff that renames or
     removes a variant/field with live on-chain data, and must require a migration whenever a
     struct gains a field that existing stored entries won't have (the derived decode requires
     every field present, so a new required field breaks old entries without one).
   - A regression test that snapshots each contract's `DataKey` variant **names** and each stored
     struct's field **names and types** (failing the build on a rename/removal, not on
     reordering) turns this from a review nit into an enforced CI check — tracked in #88.
6. **Testnet dry-run is a release gate, not optional.** See the checklist below.

### Non-negotiable release checks (must all pass before any upgrade is authorized)

- [ ] Every `DataKey` variant name, and every stored struct's field name and type, that has live
      on-chain data in the currently-deployed WASM is still present and unrenamed in the new WASM
      (reordering variants/fields is fine; renaming or removing one that has live data is not).
- [ ] Any struct gaining a field ships with a migration function and a test that exercises it
      against a pre-upgrade-shaped fixture, since existing entries won't decode with the new
      field simply declared additively.
- [ ] `cargo test --all` and the cross-contract invariant suite
      (`cargo test -p stellar-sentinel-integration-tests`) pass against the new WASM.
- [ ] The upgrade has been deployed and exercised on testnet: propose → approve × threshold →
      wait past `ready_at` → execute, followed by at least one read (`get_config`/equivalent) and
      one write path per contract to confirm existing storage still decodes and new logic
      behaves as intended. Record the testnet contract ID, transaction hashes for propose/
      approve/execute, and the before/after storage read.
- [ ] The rollback wasm hash (current, pre-upgrade code) is recorded and confirmed still
      resolvable on the target network before `execute_upgrade` is called.
- [ ] Signer/threshold/role state used to authorize the upgrade matches the *current* production
      configuration at execute time (the propose-time snapshot is re-validated, not assumed
      stable across the delay window).

## 9. Sequenced implementation issues

Filed as tracked GitHub issues, in dependency order — later items build on the propose/approve/
execute plumbing the earlier ones introduce. Exact authorization shape (threshold values, delay
lengths) is left as an open decision on each issue for maintainers to pick before implementation
starts.

1. [**#88 — Add a storage-compatibility regression test per contract**](https://github.com/Stellar-Re-Code/StellarSentinel/issues/88)
   (CI gate): snapshots each contract's `DataKey` variant **names** and each stored struct's
   field **names and types**, failing the build on a rename/removal (not on reordering — see
   §3). Ships independently of everything else below and closes the real silent-corruption gap.
2. [**#89 — Governed, threshold-gated, time-delayed upgrade for `treasury`**](https://github.com/Stellar-Re-Code/StellarSentinel/issues/89) —
   `propose_upgrade`/`approve_upgrade`/`execute_upgrade`, reusing the signer/threshold storage
   already in `DataKey::Signers`/`DataKey::Threshold`, modeled on `PauseState`/`PauseRequest`.
   Includes `(treasury, up_prop|up_ap|up_exec)` events and policy-version invalidation of stale
   pending upgrades. Depends on #88.
3. [**#90 — Same for `governance` and `token-vault`**](https://github.com/Stellar-Re-Code/StellarSentinel/issues/90),
   reusing their existing member/emergency-signer sets. Depends on #88, follows #89's shape.
4. [**#91 — Owner + fixed-delay upgrade for `access-control`**](https://github.com/Stellar-Re-Code/StellarSentinel/issues/91).
   Given it has no signer threshold, this is a smaller propose/wait/execute flow gated on `Owner`
   alone, plus the same event trail. Depends on #88.
5. [**#92 — Emergency (expedited) upgrade path**](https://github.com/Stellar-Re-Code/StellarSentinel/issues/92) —
   a dedicated issue to decide and implement the supermajority-waives-delay mechanism referenced
   in §8.4, kept deliberately separate so the normal path isn't compromised by rushing the
   emergency one. Depends on #89, #90, #91.
6. [**#93 — Testnet dry-run tooling and runbook**](https://github.com/Stellar-Re-Code/StellarSentinel/issues/93):
   builds on the existing #78 (reproducible testnet deployment manifest and smoke suite) by
   driving the full propose/approve/wait/execute sequence against testnet and capturing the
   evidence listed in the release checklist, plus a runbook doc analogous to
   `TREASURY_EMERGENCY_PAUSE.md`'s recovery procedure. Depends on #78, #89, #90, #91.
7. [**#94 — Document the upgrade event schema**](https://github.com/Stellar-Re-Code/StellarSentinel/issues/94)
   in `SMARTCONTRACT_GUIDE.md`'s Event Reference, matching the existing per-contract table
   format, once #89/#90/#91 land.

## 10. Out of scope (per issue #83)

Performing an upgrade or deploying to mainnet. This document delivers the policy decision, the
storage-compatibility matrix, an honest rollback/irreversibility statement, and the sequenced
follow-up issue list — not the propose/approve/execute implementation itself.
