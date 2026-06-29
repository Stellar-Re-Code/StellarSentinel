//! Cross-contract security invariants: authorization consistency, membership
//! lifecycle, and terminal-operation replay resistance across all four contracts.

mod common;

use common::*;
use soroban_sdk::symbol_short;

/// Privileged actions are gated consistently: the role an account holds in
/// access-control lines up with what the treasury lets it do. A plain member can
/// neither administer nor propose withdrawals (INV-X1).
#[test]
fn role_decisions_gate_privileged_treasury_actions() {
    let env = new_env();
    let owner = soroban_sdk::testutils::Address::generate(&env);
    let admin = soroban_sdk::testutils::Address::generate(&env);
    let member = soroban_sdk::testutils::Address::generate(&env);

    let acl = deploy_acl(&env, &owner);
    acl.assign_role(&owner, &admin, &Role::Admin);
    acl.assign_role(&owner, &member, &Role::Member);

    // Access-control's view of privilege.
    assert_eq!(acl.is_admin_or_above(&owner), true);
    assert_eq!(acl.is_admin_or_above(&admin), true);
    assert_eq!(acl.is_admin_or_above(&member), false);
    assert_eq!(acl.is_owner(&member), false);

    // A treasury administered by `owner`, with its own signer set.
    let signers = addrs(&env, 2);
    let asset = soroban_sdk::testutils::Address::generate(&env);
    let treasury = deploy_treasury(&env, &owner, &asset, 1, &svec(&env, &signers));
    treasury.deposit(&signers[0], &10_000);

    // The plain member (not admin, not signer) is blocked from privileged ops,
    // mirroring its lack of role privilege in access-control.
    assert_eq!(
        treasury.try_set_threshold(&member, &1),
        Err(Ok(treasury::Error::Unauthorized))
    );
    let exp = env.ledger().timestamp() + 10_000;
    assert_eq!(
        treasury.try_propose_withdrawal(&member, &member, &1_000, &symbol_short!("x"), &exp),
        Err(Ok(treasury::Error::NotASigner))
    );
    assert_acl_consistent(&acl);
    assert_treasury_invariants(&treasury, 10_000, 0);
}

/// Governance membership churn updates authorization with no stale rights: an added
/// member can act, and a removed member immediately cannot (INV-X2).
#[test]
fn governance_membership_lifecycle_updates_authorization() {
    let env = new_env();
    let admin = soroban_sdk::testutils::Address::generate(&env);
    let members = addrs(&env, 3);
    let gov = deploy_governance(&env, &admin, &svec(&env, &members), 34, 50); // threshold 1

    let newbie = soroban_sdk::testutils::Address::generate(&env);
    // Non-members cannot propose.
    assert_eq!(
        gov.try_create_proposal(
            &newbie,
            &symbol_short!("t"),
            &symbol_short!("d"),
            &ProposalAction::General,
            &0,
            &newbie,
        ),
        Err(Ok(governance::Error::NotAMember))
    );

    // Add the newbie via a passed AddMember proposal.
    let add = gov.create_proposal(
        &members[0],
        &symbol_short!("add"),
        &symbol_short!("d"),
        &ProposalAction::AddMember,
        &0,
        &newbie,
    );
    gov.vote(&members[0], &add, &true);
    advance_seq(&env, 100);
    assert_eq!(gov.finalize(&admin, &add), ProposalStatus::Passed);
    gov.execute_proposal(&admin, &add);
    assert_eq!(gov.get_config().member_count, 4);

    // Newbie now has voting/proposal rights.
    let p = gov.create_proposal(
        &newbie,
        &symbol_short!("p"),
        &symbol_short!("d"),
        &ProposalAction::General,
        &0,
        &newbie,
    );
    gov.vote(&newbie, &p, &true); // no panic => authorized

    // Remove members[1] via a passed RemoveMember proposal.
    let rem = gov.create_proposal(
        &members[0],
        &symbol_short!("rem"),
        &symbol_short!("d"),
        &ProposalAction::RemoveMember,
        &0,
        &members[1],
    );
    gov.vote(&members[0], &rem, &true);
    advance_seq(&env, 100);
    assert_eq!(gov.finalize(&admin, &rem), ProposalStatus::Passed);
    gov.execute_proposal(&admin, &rem);
    assert_eq!(gov.get_config().member_count, 3);

    // The removed member can no longer act — no stale membership.
    assert_eq!(
        gov.try_create_proposal(
            &members[1],
            &symbol_short!("t"),
            &symbol_short!("d"),
            &ProposalAction::General,
            &0,
            &members[1],
        ),
        Err(Ok(governance::Error::NotAMember))
    );
}

/// Terminal operations in every contract are one-shot: once settled they cannot be
/// replayed (INV-X3, reinforcing INV-T3 / INV-G5 / INV-V6).
#[test]
fn terminal_operations_cannot_replay_across_contracts() {
    let env = new_env();

    // Treasury: execute once, replay rejected.
    let admin = soroban_sdk::testutils::Address::generate(&env);
    let signers = addrs(&env, 2);
    let asset = soroban_sdk::testutils::Address::generate(&env);
    let recipient = soroban_sdk::testutils::Address::generate(&env);
    let treasury = deploy_treasury(&env, &admin, &asset, 2, &svec(&env, &signers));
    treasury.deposit(&signers[0], &10_000);
    let exp = env.ledger().timestamp() + 10_000;
    let tx = treasury.propose_withdrawal(&signers[0], &recipient, &4_000, &symbol_short!("r"), &exp);
    treasury.approve(&signers[1], &tx);
    treasury.execute(&signers[0], &tx);
    assert_eq!(
        treasury.try_execute(&signers[0], &tx),
        Err(Ok(treasury::Error::AlreadyExecuted))
    );

    // Governance: execute a passed proposal once, replay rejected.
    let gmembers = addrs(&env, 3);
    let gov = deploy_governance(&env, &admin, &svec(&env, &gmembers), 34, 50);
    let pid = gov.create_proposal(
        &gmembers[0],
        &symbol_short!("t"),
        &symbol_short!("d"),
        &ProposalAction::General,
        &0,
        &gmembers[0],
    );
    gov.vote(&gmembers[0], &pid, &true);
    advance_seq(&env, 100);
    gov.finalize(&admin, &pid);
    gov.execute_proposal(&admin, &pid);
    assert_eq!(
        gov.try_execute_proposal(&admin, &pid),
        Err(Ok(governance::Error::ProposalRejected))
    );

    // Vault: emergency unlock once, replay rejected.
    let esigners = addrs(&env, 2);
    let vault = deploy_vault(&env, &admin, &svec(&env, &esigners), 2);
    let owner = soroban_sdk::testutils::Address::generate(&env);
    let lock = vault.lock_tokens(&owner, &5_000, &100_000, &symbol_short!("l"));
    vault.approve_emergency(&esigners[0], &lock);
    vault.approve_emergency(&esigners[1], &lock);
    vault.emergency_unlock(&esigners[0], &lock);
    assert_eq!(
        vault.try_emergency_unlock(&esigners[0], &lock),
        Err(Ok(vault::Error::AlreadyClaimed))
    );
}
