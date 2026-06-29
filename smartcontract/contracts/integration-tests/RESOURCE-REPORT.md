# Resource & Storage Report

Storage growth for representative operation sequences, asserted by
`tests/resource_report.rs`. Each logical object maps to exactly one persistent
storage entry — growth is linear (`O(n)`) with no hidden amplification.

Reproduce (with measured figures printed to stdout):

```bash
cd smartcontract
cargo test -p stellar-sentinel-integration-tests --test resource_report -- --nocapture
```

## Storage growth (N = 50 operations)

| Contract | Operation | Entries created | Aggregate counter | Asserted bound |
|----------|-----------|-----------------|-------------------|----------------|
| Treasury | `propose_withdrawal` × N | N `Transaction(id)` entries | `tx_count == N` | 1 entry / proposal |
| Token Vault | `lock_tokens` × N | N `Lock(id)` entries | `lock_count == N`, `total_locked == N×amount` | 1 entry / lock |
| Governance | `create_proposal` × N | N `Proposal(id)` entries | `proposal_count == N` | 1 entry / proposal |
| Access Control | `assign_role` × N | N `Role(addr)` entries + 1 owner | `total_members == N + 1` | 1 entry / member |

Per-operation counters (`TxCounter`, `LockCounter`, `ProposalCounter`,
`RoleCount`) are single instance-storage slots updated in place and do not grow.
Approval/vote lists grow with the number of distinct approvers/voters, bounded by
the signer/member set size.

## CPU / memory budget

CPU-instruction and memory budgets are produced by the Soroban host during CI test
runs. To capture them locally, enable budget printing in a focused test run:

```bash
cargo test -p stellar-sentinel-integration-tests -- --nocapture
```

The deterministic sequence tests each execute 40 mixed operations per seed across
4–5 seeds without exceeding the default Soroban resource budget (tests fail if a
single invocation exceeds the host limits).
