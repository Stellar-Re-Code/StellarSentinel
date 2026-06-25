# Implementation Notes — Issue #43

**Issue:** [Next Sprint] Productionize token-vault custody, vesting, locks, and emergency unlocks
**Upstream:** https://github.com/Stellar-Re-Code/StellarSentinel/issues/43

## Acceptance Criteria

## Why this matters

The token-vault contract models locks, vesting, and emergency unlocks, but production behavior must use real token custody. Internal counters alone cannot secure locked or vested assets. The vault must transfer, hold, release, and reconcile assets exactly.

## Product traceability

- PRD: token vault, vesting, emergency unlock, custody safety
- Repository context: `smartcontract/contracts/token-vault/src/lib.rs`, `docs/ISSUES-SMARTCONTRACT.md` SC-19 through SC-21
- Depends on: #24 baseline stabilization and asset interface direction from treasury #26/#27

## Scope

- Bind vault operations to a configured asset contract or explicit asset identity model.
- Make `lock_tokens` transfer actual tokens from owner to vault custody.
- Make normal claim transfer exact unlocked value to owner.
- Make vesting creation transfer actual tokens into custody.
- Make vested claims transfer exact claimable value to beneficiary.
- Make emergency unlock require threshold approval and transfer assets exactly once.
- Reconcile internal `total_locked` with actual asset custody.

## Non-scope

- Frontend vault UI.
- Multi-asset vault unless explicitly selected by maintainers.
- Governance-driven emergency approvals.

## Acceptance criteria

- [ ] Locking decreases owner asset balance and increases vault asset balance by exactly amount.
- [ ] Lock or vesting state is not persisted if validation, auth, or transfer fails.
- [ ] Normal claim and emergency unlock transfer assets exact

---
_Delete this file before merging._