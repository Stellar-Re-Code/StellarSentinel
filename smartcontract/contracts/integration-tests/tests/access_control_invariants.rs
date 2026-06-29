//! Access-control security invariants (INV-A1 .. INV-A3).

mod common;

use common::*;

fn role_of(rng_val: u64) -> Role {
    match rng_val % 3 {
        0 => Role::Admin,
        1 => Role::Member,
        _ => Role::Viewer,
    }
}

/// INV-A3: a non-privileged account can never escalate roles.
#[test]
fn unauthorized_escalation_rejected() {
    let env = new_env();
    let owner = soroban_sdk::testutils::Address::generate(&env);
    let c = deploy_acl(&env, &owner);

    let member = soroban_sdk::testutils::Address::generate(&env);
    let target = soroban_sdk::testutils::Address::generate(&env);
    c.assign_role(&owner, &member, &Role::Member);

    assert_eq!(c.can_assign(&member, &Role::Admin), false);
    assert_eq!(
        c.try_assign_role(&member, &target, &Role::Admin),
        Err(Ok(acl::Error::InsufficientPrivilege))
    );
    assert_acl_consistent(&c);
}

/// INV-A1: exactly one owner is preserved across a chain of ownership transfers.
#[test]
fn single_owner_through_transfers() {
    let env = new_env();
    let owner = soroban_sdk::testutils::Address::generate(&env);
    let c = deploy_acl(&env, &owner);
    let chain = addrs(&env, 4);

    let mut current = owner;
    for next in &chain {
        c.propose_ownership(&current, next);
        c.accept_ownership(next);
        assert_acl_consistent(&c);
        assert_eq!(c.is_owner(next), true);
        assert_eq!(c.is_owner(&current), false);
        current = next.clone();
    }
}

/// Deterministic sequences: across assigns, revocations, and ownership transfers,
/// the single-owner invariant (INV-A1) and count consistency (INV-A2) always hold.
#[test]
fn seeded_operation_sequences() {
    for seed in [5u64, 55, 555, 9090] {
        let env = new_env();
        let owner = soroban_sdk::testutils::Address::generate(&env);
        let c = deploy_acl(&env, &owner);
        let pool = addrs(&env, 5);
        let mut current = owner.clone();
        let mut rng = Rng::new(seed);

        for _ in 0..50 {
            match rng.below(3) {
                0 => {
                    let t = &pool[rng.below(pool.len() as u64) as usize];
                    let role = role_of(rng.next_u64());
                    let _ = c.try_assign_role(&current, t, &role);
                }
                1 => {
                    let t = &pool[rng.below(pool.len() as u64) as usize];
                    let _ = c.try_revoke_role(&current, t);
                }
                _ => {
                    let t = &pool[rng.below(pool.len() as u64) as usize];
                    if *t != current {
                        if c.try_propose_ownership(&current, t).is_ok()
                            && c.try_accept_ownership(t).is_ok()
                        {
                            current = t.clone();
                        }
                    }
                }
            }
            assert_acl_consistent(&c);
        }
    }
}
