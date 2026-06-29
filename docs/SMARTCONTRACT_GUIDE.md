# StellarSentinel — Smart Contract Developer Guide

> A comprehensive guide to understanding, building, and testing the StellarSentinel Soroban smart contracts.

## Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [Contracts](#contracts)
3. [Development Setup](#development-setup)
4. [Building](#building)
5. [Testing](#testing)
6. [Deployment](#deployment)
7. [Event Reference](#event-reference)

---

## Architecture Overview

StellarSentinel consists of **four Soroban smart contracts** working together:

```
┌──────────────────────────────────────────────────────────┐
│                StellarSentinel System                    │
├──────────────┬──────────────┬──────────────┬─────────────┤
│   Treasury   │  Governance  │  Token Vault │   Access    │
│              │              │              │  Control    │
│ - Multi-sig  │ - Proposals  │ - Locking    │ - Roles     │
│ - Deposits   │ - Voting     │ - Vesting    │ - RBAC      │
│ - Withdrawals│ - Quorum     │ - Emergency  │ - Perms     │
└──────────────┴──────────────┴──────────────┴─────────────┘
```

### Inter-Contract Communication
- **Access Control** provides role-based permission checks for other contracts.
- **Treasury** handles fund custody and multi-sig withdrawal approval.
- **Governance** manages DAO decision-making (proposal lifecycle).
- **Token Vault** manages time-locked tokens and vesting schedules.

---

## Contracts

### 1. Treasury (`contracts/treasury`)

**Purpose:** Multi-signature fund management. Deposits into a shared treasury require no approval, but withdrawals require multi-sig approval from designated signers.

**Key Types:**
- `TreasuryConfig` — Admin, threshold, signer count, balance, tx count.
- `Transaction` — Withdrawal proposal with id, to, amount, memo, approvals, executed status.
- `DataKey` — Storage keys: `Admin`, `Threshold`, `Signers`, `Balance`, `Transaction(u64)`, etc.
- `Error` — 12 error variants covering all failure modes.

**Public API:**

| Function | Description |
|----------|-------------|
| `initialize(admin, threshold, signers)` | Set up the treasury with initial configuration |
| `deposit(from, amount)` | Deposit XLM into the treasury |
| `propose_withdrawal(proposer, to, amount, memo)` | Create a withdrawal proposal |
| `approve(signer, tx_id)` | Approve a pending withdrawal |
| `execute(executor, tx_id)` | Execute an approved withdrawal |
| `add_signer(admin, new_signer)` | Add a new signer |
| `remove_signer(admin, signer)` | Remove a signer |
| `set_threshold(admin, new_threshold)` | Change approval threshold |
| `get_balance()` | Query treasury balance |
| `get_config()` | Query treasury configuration |
| `get_transaction(tx_id)` | Query a specific transaction |
| `get_signers()` | Query all signers |

---

### 2. Governance (`contracts/governance`)

**Purpose:** DAO proposal and voting system. Members create proposals, vote during a defined period, and proposals are finalized based on quorum.

**Key Types:**
- `ProposalAction` — `Funding`, `PolicyChange`, `AddMember`, `RemoveMember`, `General`.
- `ProposalStatus` — `Active`, `Passed`, `Rejected`, `Executed`, `Expired`.
- `Proposal` — Full proposal record with votes, status, and metadata.
- `GovConfig` — Admin, member count, quorum %, voting period, proposal count.

**Public API:**

| Function | Description |
|----------|-------------|
| `initialize(admin, members, quorum_percent, voting_period)` | Set up governance |
| `create_proposal(proposer, title, desc, action, amount, target)` | Create new proposal |
| `vote(voter, proposal_id, vote_for)` | Cast a vote |
| `finalize(caller, proposal_id)` | Finalize after voting period |
| `execute_proposal(executor, proposal_id)` | Execute a passed proposal |
| `add_member(admin, new_member)` | Add a DAO member |
| `remove_member(admin, member)` | Remove a DAO member |
| `get_proposal(proposal_id)` | Query single proposal |
| `get_config()` | Query governance config |
| `get_members()` | Query all members |

---

### 3. Token Vault (`contracts/token-vault`)

**Purpose:** Token locking with time-based release, vesting schedules with cliff periods, and multi-sig emergency unlock.

**Key Types:**
- `TokenLock` — Lock entry with id, owner, amount, locked_at, unlock_at, claimed.
- `VestingSchedule` — Vesting with beneficiary, total_amount, claimed_amount, start_time, duration, cliff.
- `VaultStats` — Total locked, lock count, vesting count, admin.

**Public API:**

| Function | Description |
|----------|-------------|
| `initialize(admin, emergency_signers, emergency_threshold)` | Set up vault |
| `lock_tokens(owner, amount, duration, memo)` | Lock tokens |
| `claim(owner, lock_id)` | Claim after lock expires |
| `approve_emergency(signer, lock_id)` | Approve emergency unlock |
| `emergency_unlock(caller, lock_id)` | Execute emergency unlock |
| `create_vesting(admin, beneficiary, total, duration, cliff, memo)` | Create vesting |
| `claim_vested(beneficiary, vesting_id)` | Claim vested tokens |
| `get_lock(lock_id)` | Query a lock |
| `get_vesting(vesting_id)` | Query a vesting schedule |
| `get_stats()` | Query vault statistics |

---

### 4. Access Control (`contracts/access-control`)

**Purpose:** Role-based access control with hierarchical permissions: **Owner > Admin > Member > Viewer**.

**Key Types:**
- `Role` — `Viewer (1)`, `Member (2)`, `Admin (3)`, `Owner (4)`.
- `RoleAssignment` — Role record with address, role, assigned_at, assigned_by.
- `AccessSummary` — Owner, total members, and count per role.

**Public API:**

| Function | Description |
|----------|-------------|
| `initialize(owner)` | Set up access control; owner gets the Owner role |
| `assign_role(assignor, target, role)` | Assign or change a subordinate role |
| `revoke_role(revoker, target)` | Revoke a role |
| `propose_ownership(current_owner, new_owner)` | Stage a two-step ownership transfer |
| `accept_ownership(new_owner)` | New owner accepts; old owner demoted to Admin |
| `cancel_ownership_transfer(current_owner)` | Cancel a pending transfer |
| `has_permission(address, required_role)` | Check `role >= required_role` |
| `is_owner` / `is_admin_or_above` / `is_member_or_above` | Threshold checks |
| `can_assign(actor, role)` | Whether `actor` may assign `role` (matrix-as-code) |
| `has_role(address)` | Membership check |
| `get_role(address)` | Query a role assignment |
| `get_role_count(role)` | Count of addresses holding a role |
| `get_all_members()` / `get_all_assignments()` | List members / typed assignments |
| `get_pending_owner()` | Pending owner of an in-flight transfer, if any |
| `get_summary()` | Query access summary |

**Permission matrix** (assignment and revocation):

| Actor \ Target role | Viewer | Member | Admin | Owner |
|---------------------|--------|--------|-------|-------|
| Owner | assign / revoke | assign / revoke | assign / revoke | transfer flow only |
| Admin | assign / revoke | assign / revoke | denied | denied |
| Member / Viewer | denied | denied | denied | denied |

Rules enforced by the contract:
- The Owner role is never set through `assign_role`; it moves only via
  `propose_ownership` → `accept_ownership` (single-Owner invariant preserved).
- An Admin cannot modify or revoke another Admin; only the Owner can.
- No actor can change its own role (no self-escalation or self-demotion).
- Re-assigning the exact role already held fails with `RoleAlreadyAssigned`.
- The Owner cannot be revoked (`CannotRemoveOwner`).

**Consuming access-control from other contracts:** treasury, governance, and
token-vault gate privileged operations by cross-contract-calling the read-only
checks. For example, before an admin-only action a caller is verified with
`AccessControlClient::new(&env, &acl_id).is_admin_or_above(&caller)`, and
participation gates use `is_member_or_above` / `has_permission(addr, Role::Member)`.
These calls are side-effect-free and safe to invoke during validation. The
`(acl, *)` events (schema v1) let indexers reconstruct the full authorization
history off-chain.

---

## Development Setup

### Prerequisites
- **Rust**: Install via [rustup](https://rustup.rs/)
- **Soroban CLI**: `cargo install soroban-cli`
- **WASM target**: `rustup target add wasm32-unknown-unknown`

### Install
```bash
cd smartcontract
cargo build --all
```

---

## Building

```bash
# Build all contracts
cd smartcontract
cargo build --all

# Build optimized WASM (for deployment)
soroban contract build

# The output WASM files will be in:
# target/wasm32-unknown-unknown/release/
```

---

## Testing

```bash
# Run all tests
cd smartcontract
cargo test --all

# Run tests for a specific contract
  cargo test -p stellar-sentinel-treasury
  cargo test -p stellar-sentinel-governance
  cargo test -p stellar-sentinel-token-vault
  cargo test -p stellar-sentinel-access-control

# Run with output
cargo test --all -- --nocapture

# Cross-contract security invariant suite (issue #44)
cargo test -p stellar-sentinel-integration-tests
```

### Cross-contract invariant suite

`contracts/integration-tests` drives all four contracts together and verifies
custody, authorization, replay resistance, and lifecycle terminality across
deterministic operation sequences. See
`contracts/integration-tests/INVARIANTS.md` for the rule-to-test matrix and
`RESOURCE-REPORT.md` for storage-growth measurements.

---

## Deployment

### Testnet Deployment
```bash
# 1. Generate a deployer keypair (or use existing)
soroban keys generate deployer --network testnet

# 2. Fund the deployer
soroban keys fund deployer --network testnet

# 3. Build optimized WASM
soroban contract build

# 4. Deploy each contract
soroban contract deploy \
  --wasm target/wasm32-unknown-unknown/release/stellar_sentinel_treasury.wasm \
  --source deployer \
  --network testnet

# 5. Save the returned contract ID
```

Repeat for each contract (governance, token-vault, access-control).

---

## Event Reference

### Treasury Events
| Topic | Data | Description |
|-------|------|-------------|
| `(treasury, init)` | `(admin, threshold, signer_count)` | Contract initialized |
| `(treasury, deposit)` | `(from, amount, new_balance)` | Deposit received |
| `(treasury, propose)` | `(tx_id, proposer, to, amount)` | Withdrawal proposed |
| `(treasury, approve)` | `(tx_id, signer, approval_count)` | Approval added |
| `(treasury, execute)` | `(tx_id, to, amount, new_balance)` | Withdrawal executed |

### Governance Events
| Topic | Data | Description |
|-------|------|-------------|
| `(gov, init)` | `(admin, member_count, quorum)` | Contract initialized |
| `(gov, propose)` | `(proposal_id, proposer, action)` | Proposal created |
| `(gov, vote)` | `(proposal_id, voter, vote_for, total)` | Vote cast |
| `(gov, final)` | `(proposal_id, status)` | Proposal finalized |
| `(gov, exec)` | `(proposal_id, executor)` | Proposal executed |

### Token Vault Events
| Topic | Data | Description |
|-------|------|-------------|
| `(vault, lock)` | `(lock_id, owner, amount, duration)` | Tokens locked |
| `(vault, claim)` | `(lock_id, owner, amount)` | Lock claimed |
| `(vault, vest)` | `(vesting_id, beneficiary, amount, duration)` | Vesting created |
| `(vault, v_claim)` | `(vesting_id, beneficiary, amount)` | Vested tokens claimed |
| `(vault, emrg_ap)` | `(lock_id, signer, approval_count)` | Emergency approval |
| `(vault, emrg_ex)` | `(lock_id, caller, amount)` | Emergency unlock executed |

### Access Control Events (schema v1)

Every payload ends with a `version` field (`EVENT_SCHEMA_VERSION`). Role values are
`u32` (`Viewer=1, Member=2, Admin=3, Owner=4`); `old_role = 0` means "no prior role".

| Topic | Data | Description |
|-------|------|-------------|
| `(acl, init)` | `(owner, version)` | Contract initialized |
| `(acl, assign)` | `(assignor, target, old_role, new_role, version)` | Role assigned/changed |
| `(acl, revoke)` | `(revoker, target, old_role, version)` | Role revoked |
| `(acl, own_prop)` | `(current_owner, pending_owner, version)` | Ownership transfer proposed |
| `(acl, owner)` | `(old_owner, new_owner, version)` | Ownership transfer accepted |
| `(acl, own_cxl)` | `(current_owner, canceled_pending, version)` | Ownership transfer canceled |
