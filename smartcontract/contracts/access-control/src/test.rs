use super::*;
use soroban_sdk::testutils::{Address as _, Events, MockAuth, MockAuthInvoke};
use soroban_sdk::{Env, IntoVal};

fn setup() -> (Env, Address, AccessControlContractClient<'static>) {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register_contract(None, AccessControlContract);
    let client = AccessControlContractClient::new(&env, &contract_id);
    let owner = Address::generate(&env);
    client.initialize(&owner);
    (env, owner, client)
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

#[test]
fn test_initialize() {
    let (_, owner, client) = setup();
    let summary = client.get_summary();
    assert_eq!(summary.owner, owner);
    assert_eq!(summary.total_members, 1);
    assert_eq!(summary.owner_count, 1);
    assert_eq!(summary.admin_count, 0);
    assert_eq!(client.is_owner(&owner), true);
}

#[test]
fn test_initialize_twice_fails() {
    let (_, owner, client) = setup();
    assert_eq!(client.try_initialize(&owner), Err(Ok(Error::AlreadyInitialized)));
}

// ---------------------------------------------------------------------------
// Assignment
// ---------------------------------------------------------------------------

#[test]
fn test_assign_roles_by_owner_and_admin() {
    let (env, owner, client) = setup();
    let admin = Address::generate(&env);
    let member = Address::generate(&env);
    let viewer = Address::generate(&env);

    client.assign_role(&owner, &admin, &Role::Admin);
    client.assign_role(&owner, &member, &Role::Member);
    client.assign_role(&admin, &viewer, &Role::Viewer); // Admin assigns Viewer

    let summary = client.get_summary();
    assert_eq!(summary.total_members, 4);
    assert_eq!(summary.admin_count, 1);
    assert_eq!(summary.member_count, 1);
    assert_eq!(summary.viewer_count, 1);
}

#[test]
fn test_admin_cannot_assign_admin() {
    let (env, owner, client) = setup();
    let admin = Address::generate(&env);
    let target = Address::generate(&env);
    client.assign_role(&owner, &admin, &Role::Admin);

    assert_eq!(
        client.try_assign_role(&admin, &target, &Role::Admin),
        Err(Ok(Error::InsufficientPrivilege))
    );
}

#[test]
fn test_member_cannot_assign() {
    let (env, owner, client) = setup();
    let member = Address::generate(&env);
    let target = Address::generate(&env);
    client.assign_role(&owner, &member, &Role::Member);

    assert_eq!(
        client.try_assign_role(&member, &target, &Role::Viewer),
        Err(Ok(Error::InsufficientPrivilege))
    );
}

#[test]
fn test_assign_owner_role_rejected() {
    let (env, owner, client) = setup();
    let target = Address::generate(&env);
    // Even the owner cannot mint a second Owner via assign_role.
    assert_eq!(
        client.try_assign_role(&owner, &target, &Role::Owner),
        Err(Ok(Error::InvalidRole))
    );
    assert_eq!(client.get_summary().owner_count, 1);
}

#[test]
fn test_duplicate_same_role_rejected() {
    let (env, owner, client) = setup();
    let member = Address::generate(&env);
    client.assign_role(&owner, &member, &Role::Member);
    assert_eq!(
        client.try_assign_role(&owner, &member, &Role::Member),
        Err(Ok(Error::RoleAlreadyAssigned))
    );
}

#[test]
fn test_role_change_allowed_and_counts() {
    let (env, owner, client) = setup();
    let user = Address::generate(&env);
    client.assign_role(&owner, &user, &Role::Member);
    // Change Member -> Viewer.
    client.assign_role(&owner, &user, &Role::Viewer);

    assert_eq!(client.get_role(&user).role, Role::Viewer);
    let summary = client.get_summary();
    assert_eq!(summary.member_count, 0);
    assert_eq!(summary.viewer_count, 1);
    assert_eq!(summary.total_members, 2); // owner + user, no duplicate slot
}

#[test]
fn test_admin_cannot_modify_other_admin() {
    let (env, owner, client) = setup();
    let admin1 = Address::generate(&env);
    let admin2 = Address::generate(&env);
    client.assign_role(&owner, &admin1, &Role::Admin);
    client.assign_role(&owner, &admin2, &Role::Admin);

    // admin1 tries to demote admin2 -> only Owner may modify an existing Admin.
    assert_eq!(
        client.try_assign_role(&admin1, &admin2, &Role::Member),
        Err(Ok(Error::InsufficientPrivilege))
    );
}

#[test]
fn test_self_assign_rejected() {
    let (env, owner, client) = setup();
    let admin = Address::generate(&env);
    client.assign_role(&owner, &admin, &Role::Admin);
    assert_eq!(
        client.try_assign_role(&admin, &admin, &Role::Member),
        Err(Ok(Error::SelfModification))
    );
}

#[test]
fn test_privilege_escalation_attempt() {
    let (env, owner, client) = setup();
    let member = Address::generate(&env);
    let other = Address::generate(&env);
    client.assign_role(&owner, &member, &Role::Member);
    // A member trying to grant Admin to someone else is rejected by hierarchy.
    assert_eq!(
        client.try_assign_role(&member, &other, &Role::Admin),
        Err(Ok(Error::InsufficientPrivilege))
    );
}

// ---------------------------------------------------------------------------
// Revocation
// ---------------------------------------------------------------------------

#[test]
fn test_revoke_member_ok() {
    let (env, owner, client) = setup();
    let member = Address::generate(&env);
    client.assign_role(&owner, &member, &Role::Member);
    assert_eq!(client.is_member_or_above(&member), true);

    client.revoke_role(&owner, &member);
    assert_eq!(client.is_member_or_above(&member), false);
    assert_eq!(client.has_role(&member), false);
    assert_eq!(client.get_summary().member_count, 0);
}

#[test]
fn test_cannot_revoke_owner() {
    let (env, owner, client) = setup();
    let admin = Address::generate(&env);
    client.assign_role(&owner, &admin, &Role::Admin);
    assert_eq!(
        client.try_revoke_role(&admin, &owner),
        Err(Ok(Error::CannotRemoveOwner))
    );
}

#[test]
fn test_admin_cannot_revoke_admin() {
    let (env, owner, client) = setup();
    let admin1 = Address::generate(&env);
    let admin2 = Address::generate(&env);
    client.assign_role(&owner, &admin1, &Role::Admin);
    client.assign_role(&owner, &admin2, &Role::Admin);
    assert_eq!(
        client.try_revoke_role(&admin1, &admin2),
        Err(Ok(Error::InsufficientPrivilege))
    );
}

#[test]
fn test_revoke_unknown_fails() {
    let (env, owner, client) = setup();
    let ghost = Address::generate(&env);
    assert_eq!(
        client.try_revoke_role(&owner, &ghost),
        Err(Ok(Error::RoleNotFound))
    );
}

#[test]
fn test_self_revoke_rejected() {
    let (env, owner, client) = setup();
    let admin = Address::generate(&env);
    client.assign_role(&owner, &admin, &Role::Admin);
    assert_eq!(
        client.try_revoke_role(&admin, &admin),
        Err(Ok(Error::SelfModification))
    );
}

#[test]
fn test_stale_role_after_revoke() {
    let (env, owner, client) = setup();
    let admin = Address::generate(&env);
    client.assign_role(&owner, &admin, &Role::Admin);
    assert_eq!(client.has_permission(&admin, &Role::Admin), true);
    client.revoke_role(&owner, &admin);
    // A revoked role grants no permission afterward.
    assert_eq!(client.has_permission(&admin, &Role::Viewer), false);
    assert_eq!(client.is_admin_or_above(&admin), false);
}

// ---------------------------------------------------------------------------
// Permission matrix
// ---------------------------------------------------------------------------

#[test]
fn test_permission_matrix() {
    let (env, owner, client) = setup();
    let admin = Address::generate(&env);
    let member = Address::generate(&env);
    let viewer = Address::generate(&env);
    client.assign_role(&owner, &admin, &Role::Admin);
    client.assign_role(&owner, &member, &Role::Member);
    client.assign_role(&owner, &viewer, &Role::Viewer);

    // is_owner
    assert_eq!(client.is_owner(&owner), true);
    assert_eq!(client.is_owner(&admin), false);

    // is_admin_or_above
    assert_eq!(client.is_admin_or_above(&owner), true);
    assert_eq!(client.is_admin_or_above(&admin), true);
    assert_eq!(client.is_admin_or_above(&member), false);

    // is_member_or_above
    assert_eq!(client.is_member_or_above(&member), true);
    assert_eq!(client.is_member_or_above(&viewer), false);

    // has_permission thresholds
    assert_eq!(client.has_permission(&viewer, &Role::Viewer), true);
    assert_eq!(client.has_permission(&viewer, &Role::Member), false);
    assert_eq!(client.has_permission(&admin, &Role::Member), true);

    // Unknown address has no permission.
    let stranger = Address::generate(&env);
    assert_eq!(client.has_permission(&stranger, &Role::Viewer), false);
}

#[test]
fn test_can_assign_matrix() {
    let (env, owner, client) = setup();
    let admin = Address::generate(&env);
    let member = Address::generate(&env);
    client.assign_role(&owner, &admin, &Role::Admin);
    client.assign_role(&owner, &member, &Role::Member);

    // Owner can assign Admin/Member/Viewer but never Owner.
    assert_eq!(client.can_assign(&owner, &Role::Admin), true);
    assert_eq!(client.can_assign(&owner, &Role::Member), true);
    assert_eq!(client.can_assign(&owner, &Role::Owner), false);
    // Admin can assign Member/Viewer, not Admin.
    assert_eq!(client.can_assign(&admin, &Role::Member), true);
    assert_eq!(client.can_assign(&admin, &Role::Admin), false);
    // Member can assign nothing.
    assert_eq!(client.can_assign(&member, &Role::Viewer), false);
}

// ---------------------------------------------------------------------------
// Two-step ownership transfer
// ---------------------------------------------------------------------------

#[test]
fn test_two_step_ownership_full_flow() {
    let (env, owner, client) = setup();
    let new_owner = Address::generate(&env);

    client.propose_ownership(&owner, &new_owner);
    assert_eq!(client.get_pending_owner(), Some(new_owner.clone()));
    // Ownership has not moved yet.
    assert_eq!(client.is_owner(&owner), true);
    assert_eq!(client.is_owner(&new_owner), false);

    client.accept_ownership(&new_owner);

    // New owner is the sole Owner; old owner demoted to Admin.
    assert_eq!(client.is_owner(&new_owner), true);
    assert_eq!(client.is_owner(&owner), false);
    assert_eq!(client.get_role(&owner).role, Role::Admin);
    assert_eq!(client.get_pending_owner(), None);

    let summary = client.get_summary();
    assert_eq!(summary.owner, new_owner);
    assert_eq!(summary.owner_count, 1); // single-owner invariant holds
    assert_eq!(summary.admin_count, 1); // old owner
    assert_eq!(summary.total_members, 2);
}

#[test]
fn test_ownership_to_existing_admin_keeps_counts_consistent() {
    let (env, owner, client) = setup();
    let admin = Address::generate(&env);
    client.assign_role(&owner, &admin, &Role::Admin);
    assert_eq!(client.get_summary().admin_count, 1);

    client.propose_ownership(&owner, &admin);
    client.accept_ownership(&admin);

    let summary = client.get_summary();
    assert_eq!(summary.owner, admin);
    assert_eq!(summary.owner_count, 1);
    // New owner left Admin (-1), old owner joined Admin (+1) -> net 1.
    assert_eq!(summary.admin_count, 1);
    assert_eq!(summary.total_members, 2);
}

#[test]
fn test_accept_by_wrong_address_fails() {
    let (env, owner, client) = setup();
    let new_owner = Address::generate(&env);
    let intruder = Address::generate(&env);
    client.propose_ownership(&owner, &new_owner);
    assert_eq!(
        client.try_accept_ownership(&intruder),
        Err(Ok(Error::NotPendingOwner))
    );
}

#[test]
fn test_accept_without_pending_fails() {
    let (env, _owner, client) = setup();
    let someone = Address::generate(&env);
    assert_eq!(
        client.try_accept_ownership(&someone),
        Err(Ok(Error::NoPendingOwner))
    );
}

#[test]
fn test_cancel_ownership_transfer() {
    let (env, owner, client) = setup();
    let new_owner = Address::generate(&env);
    client.propose_ownership(&owner, &new_owner);
    client.cancel_ownership_transfer(&owner);

    assert_eq!(client.get_pending_owner(), None);
    // Acceptance after cancellation is impossible.
    assert_eq!(
        client.try_accept_ownership(&new_owner),
        Err(Ok(Error::NoPendingOwner))
    );
    assert_eq!(client.is_owner(&owner), true);
}

#[test]
fn test_propose_to_self_fails() {
    let (_, owner, client) = setup();
    assert_eq!(
        client.try_propose_ownership(&owner, &owner),
        Err(Ok(Error::SelfModification))
    );
}

#[test]
fn test_non_owner_cannot_propose() {
    let (env, owner, client) = setup();
    let admin = Address::generate(&env);
    let target = Address::generate(&env);
    client.assign_role(&owner, &admin, &Role::Admin);
    assert_eq!(
        client.try_propose_ownership(&admin, &target),
        Err(Ok(Error::Unauthorized))
    );
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

#[test]
fn test_query_functions() {
    let (env, owner, client) = setup();
    let admin = Address::generate(&env);
    let member = Address::generate(&env);
    client.assign_role(&owner, &admin, &Role::Admin);
    client.assign_role(&owner, &member, &Role::Member);

    assert_eq!(client.has_role(&owner), true);
    assert_eq!(client.has_role(&Address::generate(&env)), false);
    assert_eq!(client.get_role_count(&Role::Owner), 1);
    assert_eq!(client.get_role_count(&Role::Admin), 1);
    assert_eq!(client.get_role_count(&Role::Member), 1);
    assert_eq!(client.get_role_count(&Role::Viewer), 0);

    let assignments = client.get_all_assignments();
    assert_eq!(assignments.len(), 3);

    assert_eq!(client.get_all_members().len(), 3);
    assert_eq!(client.get_pending_owner(), None);
}

// ---------------------------------------------------------------------------
// Event schema (v1)
// ---------------------------------------------------------------------------

#[test]
fn test_assign_event_payload_includes_version_and_transition() {
    let (env, owner, client) = setup();
    let member = Address::generate(&env);
    client.assign_role(&owner, &member, &Role::Member);

    let all = env.events().all();
    assert_eq!(
        all.last(),
        Some((
            client.address.clone(),
            (symbol_short!("acl"), symbol_short!("assign")).into_val(&env),
            (
                owner.clone(),
                member.clone(),
                0_u32,                 // old role: none
                Role::Member as u32,   // new role
                EVENT_SCHEMA_VERSION,
            )
                .into_val(&env),
        ))
    );
}

#[test]
fn test_revoke_event_payload() {
    let (env, owner, client) = setup();
    let member = Address::generate(&env);
    client.assign_role(&owner, &member, &Role::Member);
    client.revoke_role(&owner, &member);

    let all = env.events().all();
    assert_eq!(
        all.last(),
        Some((
            client.address.clone(),
            (symbol_short!("acl"), symbol_short!("revoke")).into_val(&env),
            (owner.clone(), member.clone(), Role::Member as u32, EVENT_SCHEMA_VERSION)
                .into_val(&env),
        ))
    );
}

#[test]
fn test_ownership_event_payload() {
    let (env, owner, client) = setup();
    let new_owner = Address::generate(&env);
    client.propose_ownership(&owner, &new_owner);
    client.accept_ownership(&new_owner);

    let all = env.events().all();
    assert_eq!(
        all.last(),
        Some((
            client.address.clone(),
            (symbol_short!("acl"), symbol_short!("owner")).into_val(&env),
            (owner.clone(), new_owner.clone(), EVENT_SCHEMA_VERSION).into_val(&env),
        ))
    );
}

// ---------------------------------------------------------------------------
// Authorization evidence (selective, non-blanket auth)
// ---------------------------------------------------------------------------

fn fresh() -> (Env, Address, soroban_sdk::Address, AccessControlContractClient<'static>) {
    let env = Env::default();
    let contract_id = env.register_contract(None, AccessControlContract);
    let client = AccessControlContractClient::new(&env, &contract_id);
    let owner = Address::generate(&env);
    (env, owner, contract_id, client)
}

#[test]
fn test_assign_succeeds_with_exact_authorization() {
    let (env, owner, contract_id, client) = fresh();

    env.mock_auths(&[MockAuth {
        address: &owner,
        invoke: &MockAuthInvoke {
            contract: &contract_id,
            fn_name: "initialize",
            args: (owner.clone(),).into_val(&env),
            sub_invokes: &[],
        },
    }]);
    client.initialize(&owner);

    let member = Address::generate(&env);
    // Authorize ONLY the owner for exactly this assign_role invocation.
    env.mock_auths(&[MockAuth {
        address: &owner,
        invoke: &MockAuthInvoke {
            contract: &contract_id,
            fn_name: "assign_role",
            args: (owner.clone(), member.clone(), Role::Member).into_val(&env),
            sub_invokes: &[],
        },
    }]);
    client.assign_role(&owner, &member, &Role::Member);

    assert_eq!(client.get_role(&member).role, Role::Member);
}

#[test]
#[should_panic]
fn test_assign_requires_assignor_auth() {
    let (env, owner, contract_id, client) = fresh();
    env.mock_all_auths();
    client.initialize(&owner);

    let member = Address::generate(&env);
    // Provide auth for the WRONG address; the assignor's require_auth is unmet.
    let intruder = Address::generate(&env);
    env.mock_auths(&[MockAuth {
        address: &intruder,
        invoke: &MockAuthInvoke {
            contract: &contract_id,
            fn_name: "assign_role",
            args: (owner.clone(), member.clone(), Role::Member).into_val(&env),
            sub_invokes: &[],
        },
    }]);
    client.assign_role(&owner, &member, &Role::Member);
}

#[test]
#[should_panic]
fn test_accept_requires_new_owner_auth() {
    let (env, owner, contract_id, client) = fresh();
    env.mock_all_auths();
    client.initialize(&owner);
    let new_owner = Address::generate(&env);
    client.propose_ownership(&owner, &new_owner);

    // Only the old owner authorizes; the new owner's require_auth is unmet.
    env.mock_auths(&[MockAuth {
        address: &owner,
        invoke: &MockAuthInvoke {
            contract: &contract_id,
            fn_name: "accept_ownership",
            args: (new_owner.clone(),).into_val(&env),
            sub_invokes: &[],
        },
    }]);
    client.accept_ownership(&new_owner);
}
