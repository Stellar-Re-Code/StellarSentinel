# Cross-Contract Security Invariant Matrix

This suite (issue #44) verifies the security invariants of the StellarSentinel
treasury, governance, access-control, and token-vault contracts across realistic,
deterministic operation sequences. Every invariant below maps to one or more
automated tests. Sequences are driven by a seeded LCG (`tests/common/mod.rs`), so
any failure is replayable from its seed and the failing assertion names the
violated invariant.

Run the whole suite:

```bash
cd smartcontract
cargo test -p stellar-sentinel-integration-tests
```

## Treasury

| ID | Product rule | Invariant | Test(s) |
|----|--------------|-----------|---------|
| INV-T1 | Custody | Balance is never negative | `treasury_invariants::seeded_operation_sequences`, `assert_treasury_invariants` |
| INV-T2 | Custody | Balance equals deposits minus executed withdrawals | `treasury_invariants::seeded_operation_sequences` |
| INV-T3 | Settlement | An executed proposal never transfers twice | `treasury_invariants::no_double_execution`, `cross_contract_invariants::terminal_operations_cannot_replay_across_contracts` |
| INV-T4 | Replay/stale | Expired or policy-invalidated proposals cannot execute | `treasury_invariants::expired_cannot_execute`, `treasury_invariants::policy_change_invalidates_stale_proposal` |
| INV-T5 | Config safety | Threshold stays within `[1, signer_count]` | `treasury_invariants::threshold_bounds_enforced`, `assert_treasury_invariants` |
| INV-T6 | Atomicity | A failed call preserves pre-call state | `treasury_invariants::insufficient_funds_preserves_state` |

## Governance

| ID | Product rule | Invariant | Test(s) |
|----|--------------|-----------|---------|
| INV-G2 | Vote integrity | `votes_for + votes_against == total_votes <= member_count` | `governance_invariants::seeded_operation_sequences`, `passed_proposal_executes_once` |
| INV-G3 | Replay | A member cannot vote twice | `governance_invariants::no_double_vote` |
| INV-G4 | State machine | Quorum miss expires; voting closes on finalize | `governance_invariants::quorum_not_met_expires`, `cannot_vote_after_finalize` |
| INV-G5 | Settlement | Only a Passed proposal executes, and exactly once | `governance_invariants::passed_proposal_executes_once` |

## Access Control

| ID | Product rule | Invariant | Test(s) |
|----|--------------|-----------|---------|
| INV-A1 | Ownership | Exactly one Owner exists at all times | `access_control_invariants::single_owner_through_transfers`, `seeded_operation_sequences`, `assert_acl_consistent` |
| INV-A2 | Bookkeeping | Role counts equal the addresses actually holding each role | `access_control_invariants::seeded_operation_sequences`, `assert_acl_consistent` |
| INV-A3 | Authorization | No unprivileged account can escalate roles | `access_control_invariants::unauthorized_escalation_rejected` (plus access-control unit tests) |

## Token Vault

| ID | Product rule | Invariant | Test(s) |
|----|--------------|-----------|---------|
| INV-V1 | Custody | Locked liabilities are non-negative and backed: aggregate `total_locked` equals the sum of outstanding lock + vesting entries | `vault_invariants::seeded_operation_sequences`, `assert_vault_locked` |
| INV-V2 | Settlement | A matured lock is claimable exactly once | `vault_invariants::no_double_claim` |
| INV-V3 | Time lock | A lock cannot be claimed before maturity | `vault_invariants::lock_still_active_cannot_claim` |
| INV-V4 | Vesting | Cliff is respected; `claimed_amount` is monotonic and bounded by the total | `vault_invariants::vesting_cliff_and_monotonic_claims` |
| INV-V5 | Multi-sig | Emergency unlock requires the approval threshold | `vault_invariants::emergency_unlock_requires_threshold_and_no_replay` |
| INV-V6 | Replay | Emergency unlock cannot be replayed | `vault_invariants::emergency_unlock_requires_threshold_and_no_replay`, `cross_contract_invariants::terminal_operations_cannot_replay_across_contracts` |

## Cross-Contract

| ID | Product rule | Invariant | Test(s) |
|----|--------------|-----------|---------|
| INV-X1 | Authorization consistency | Role privilege in access-control lines up with what each contract permits | `cross_contract_invariants::role_decisions_gate_privileged_treasury_actions` |
| INV-X2 | Membership lifecycle | Added members gain rights; removed members immediately lose them (no stale authorization) | `cross_contract_invariants::governance_membership_lifecycle_updates_authorization` |
| INV-X3 | Terminality | Terminal operations across all contracts cannot be replayed | `cross_contract_invariants::terminal_operations_cannot_replay_across_contracts` |
| INV-EVT | Auditability | Events reconstruct the complete financial and authorization lifecycle and carry a schema version | `event_lifecycle::acl_event_stream_is_complete_and_versioned`, `treasury_lifecycle_emits_every_step` |

See `RESOURCE-REPORT.md` for storage-growth measurements.
