//! StellarSentinel cross-contract security invariant suite.
//!
//! This crate intentionally has no library code. The suite lives in `tests/`,
//! where each test binary drives the treasury, governance, access-control, and
//! token-vault contracts together and asserts the security invariants documented
//! in `INVARIANTS.md`. Shared harness helpers are in `tests/common/mod.rs`.
