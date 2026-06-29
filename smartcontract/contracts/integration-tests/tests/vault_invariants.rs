//! Token-vault security invariants (INV-V1 .. INV-V6).

mod common;

use common::*;
use soroban_sdk::symbol_short;

fn setup() -> (
    soroban_sdk::Env,
    soroban_sdk::Address,                 // admin
    std::vec::Vec<soroban_sdk::Address>,  // emergency signers
    TokenVaultContractClient<'static>,
) {
    let env = new_env();
    let admin = soroban_sdk::testutils::Address::generate(&env);
    let signers = addrs(&env, 3);
    let c = deploy_vault(&env, &admin, &svec(&env, &signers), 2);
    (env, admin, signers, c)
}

/// Recompute outstanding liabilities from individual entries; must equal the
/// aggregate `total_locked` counter (INV-V1).
fn outstanding(c: &TokenVaultContractClient) -> i128 {
    let stats = c.get_stats();
    let mut sum = 0i128;
    for id in 1..=stats.lock_count {
        if let Ok(Ok(l)) = c.try_get_lock(&id) {
            if !l.claimed {
                sum += l.amount;
            }
        }
    }
    for id in 1..=stats.vesting_count {
        if let Ok(Ok(v)) = c.try_get_vesting(&id) {
            sum += v.total_amount - v.claimed_amount;
        }
    }
    sum
}

/// INV-V2: a matured lock can be claimed exactly once.
#[test]
fn no_double_claim() {
    let (env, _admin, _sig, c) = setup();
    let owner = soroban_sdk::testutils::Address::generate(&env);
    let id = c.lock_tokens(&owner, &5_000, &100, &symbol_short!("l"));
    assert_vault_locked(&c, 5_000);

    advance_time(&env, 200);
    assert_eq!(c.claim(&owner, &id), 5_000);
    assert_vault_locked(&c, 0);

    assert_eq!(
        c.try_claim(&owner, &id),
        Err(Ok(vault::Error::AlreadyClaimed))
    );
    assert_vault_locked(&c, 0);
}

/// INV-V3: a lock cannot be claimed before it matures.
#[test]
fn lock_still_active_cannot_claim() {
    let (_env, _admin, _sig, c) = setup();
    let owner = soroban_sdk::testutils::Address::generate(&_env);
    let id = c.lock_tokens(&owner, &5_000, &10_000, &symbol_short!("l"));
    assert_eq!(
        c.try_claim(&owner, &id),
        Err(Ok(vault::Error::LockStillActive))
    );
    assert_vault_locked(&c, 5_000);
}

/// INV-V5/V6: emergency unlock needs the approval threshold and cannot be replayed.
#[test]
fn emergency_unlock_requires_threshold_and_no_replay() {
    let (env, _admin, signers, c) = setup();
    let owner = soroban_sdk::testutils::Address::generate(&env);
    let id = c.lock_tokens(&owner, &8_000, &100_000, &symbol_short!("l")); // long lock

    // One approval is below the threshold of 2.
    c.approve_emergency(&signers[0], &id);
    assert_eq!(
        c.try_emergency_unlock(&signers[0], &id),
        Err(Ok(vault::Error::EmergencyNotApproved))
    );
    assert_vault_locked(&c, 8_000);

    // Second approval reaches the threshold; unlock releases the liability.
    c.approve_emergency(&signers[1], &id);
    assert_eq!(c.emergency_unlock(&signers[0], &id), 8_000);
    assert_vault_locked(&c, 0);

    // Replay is rejected.
    assert_eq!(
        c.try_emergency_unlock(&signers[0], &id),
        Err(Ok(vault::Error::AlreadyClaimed))
    );

    // A duplicate emergency approval from the same signer is rejected.
    let id2 = c.lock_tokens(&owner, &1_000, &100_000, &symbol_short!("l"));
    c.approve_emergency(&signers[0], &id2);
    assert_eq!(
        c.try_approve_emergency(&signers[0], &id2),
        Err(Ok(vault::Error::AlreadyApprovedEmergency))
    );
}

/// INV-V4: vesting respects the cliff, and `claimed_amount` is monotonic and bounded.
#[test]
fn vesting_cliff_and_monotonic_claims() {
    let (env, admin, _sig, c) = setup();
    let beneficiary = soroban_sdk::testutils::Address::generate(&env);
    // total 10_000 over 1_000s, cliff 200s.
    let id = c.create_vesting(&admin, &beneficiary, &10_000, &1_000, &200, &symbol_short!("v"));
    assert_vault_locked(&c, 10_000);

    // Before the cliff: nothing claimable.
    assert_eq!(
        c.try_claim_vested(&beneficiary, &id),
        Err(Ok(vault::Error::NothingToClaim))
    );

    // Halfway: ~50% vested.
    advance_time(&env, 500);
    let first = c.claim_vested(&beneficiary, &id);
    assert!(first > 0 && first <= 10_000);
    let v = c.get_vesting(&id);
    assert!(v.claimed_amount <= v.total_amount, "INV-V4 claimed <= total");

    // After full duration: remainder claimable, never exceeding the total.
    advance_time(&env, 1_000);
    let second = c.claim_vested(&beneficiary, &id);
    assert_eq!(first + second, 10_000);
    assert_vault_locked(&c, 0);
}

/// Deterministic sequences: the aggregate `total_locked` counter must always equal
/// the sum of outstanding per-entry liabilities and stay non-negative (INV-V1).
#[test]
fn seeded_operation_sequences() {
    for seed in [2u64, 22, 222, 4040] {
        let (env, admin, signers, c) = setup();
        let owners = addrs(&env, 3);
        let mut rng = Rng::new(seed);

        for _ in 0..40 {
            match rng.below(5) {
                0 => {
                    let owner = &owners[rng.below(owners.len() as u64) as usize];
                    let amt = (rng.below(9) + 1) as i128 * 1_000;
                    let dur = (rng.below(5) + 1) * 100;
                    let _ = c.try_lock_tokens(owner, &amt, &dur, &symbol_short!("l"));
                }
                1 => {
                    let count = c.get_stats().lock_count;
                    if count > 0 {
                        let id = rng.below(count) + 1;
                        if let Ok(Ok(l)) = c.try_get_lock(&id) {
                            let _ = c.try_claim(&l.owner, &id);
                        }
                    }
                }
                2 => {
                    advance_time(&env, 150);
                }
                3 => {
                    let amt = (rng.below(9) + 1) as i128 * 1_000;
                    let _ = c.try_create_vesting(
                        &admin,
                        &owners[0],
                        &amt,
                        &1_000,
                        &100,
                        &symbol_short!("v"),
                    );
                }
                _ => {
                    let count = c.get_stats().lock_count;
                    if count > 0 {
                        let id = rng.below(count) + 1;
                        let s = &signers[rng.below(signers.len() as u64) as usize];
                        let _ = c.try_approve_emergency(s, &id);
                        let _ = c.try_emergency_unlock(s, &id);
                    }
                }
            }

            let stats = c.get_stats();
            assert!(stats.total_locked >= 0, "INV-V1 non-negative");
            assert_eq!(
                stats.total_locked,
                outstanding(&c),
                "INV-V1 aggregate counter must equal sum of outstanding entries"
            );
        }
    }
}
