# Harden access control and add cross-contract invariant suite

Closes #41
Closes #44

## Summary

Hardens the access-control contract for production and adds a cross-contract
security invariant suite covering treasury, governance, access control, and vault.

## #41 Access control

- Two-step ownership transfer (propose, accept by new owner, cancel) that keeps the
  single-owner invariant and prevents accidental owner lockout.
- Fixes the dual-owner bug: the Owner role can no longer be set through assign_role.
- Adds guards for duplicate assignment, self-modification, and admin-on-admin changes.
- Fixes role-count bookkeeping on ownership change.
- Versioned (schema v1) events with actor, subject, and role transition.
- New queries: get_role_count, has_role, get_all_assignments, get_pending_owner, can_assign.
- Documented permission matrix and integration guidance.
- Rewritten tests using selective auth mocks and typed error assertions.

## #44 Invariant suite

- New integration-tests crate driving all four contracts together.
- Deterministic, seeded operation sequences with reusable invariant assertions.
- Covers custody, replay resistance, terminal-operation safety, authorization
  consistency, membership lifecycle, and event reconstruction.
- INVARIANTS.md maps each product rule to its test; RESOURCE-REPORT.md records
  storage growth.

## CI;

- Adds a GitHub Actions workflow that builds, runs the full test suite (including
  the invariant suite), and builds the WASM artifacts.

## Verification

```bash
cd smartcontract
cargo build --all
cargo test --all
```
