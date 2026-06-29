#![no_std]

//! # Access Control
//!
//! Role-based access control for the StellarSentinel system. Other contracts
//! (treasury, governance, token-vault) consume the read-only permission checks
//! (`has_permission`, `is_owner`, `is_admin_or_above`, `is_member_or_above`) to
//! gate privileged operations.
//!
//! ## Role hierarchy (ascending privilege)
//!
//! | Role     | Value | Capability summary                                   |
//! |----------|-------|------------------------------------------------------|
//! | Viewer   | 1     | Read-only participation.                             |
//! | Member   | 2     | Participate (vote, deposit), no management.          |
//! | Admin    | 3     | Manage Member/Viewer roles, moderate operations.     |
//! | Owner    | 4     | Full control. Exactly one Owner exists at all times. |
//!
//! ## Permission matrix
//!
//! Assignment (`assign_role`) and revocation (`revoke_role`):
//!
//! | Actor \ Target role | Viewer | Member | Admin        | Owner          |
//! |---------------------|--------|--------|--------------|----------------|
//! | Owner               | assign | assign | assign       | (transfer only)|
//! | Admin               | assign | assign | denied       | denied         |
//! | Member / Viewer     | denied | denied | denied       | denied         |
//!
//! - Ownership is **never** changed through `assign_role`. It moves only through the
//!   two-step `propose_ownership` -> `accept_ownership` flow (with
//!   `cancel_ownership_transfer`), which keeps the single-Owner invariant intact and
//!   prevents accidental owner lockout.
//! - An Admin cannot modify another Admin's role; only the Owner can.
//! - No actor can change its own role (`assign_role`/`revoke_role` reject self-targeting),
//!   preventing self-escalation and self-demotion.
//! - Re-assigning the exact role an address already holds is rejected
//!   (`RoleAlreadyAssigned`); changing to a different role is allowed and recorded.

use soroban_sdk::{
    contract, contractimpl, contracttype, contracterror, symbol_short,
    Address, Env, Vec,
    log,
};

/// Schema version stamped onto every emitted event so off-chain indexers can
/// decode payloads deterministically across contract upgrades.
pub const EVENT_SCHEMA_VERSION: u32 = 1;

// ============================================================================
// Error Codes
// ============================================================================

/// Contract error codes for the Access Control module.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    /// Contract has not been initialized.
    NotInitialized = 1,
    /// Contract is already initialized.
    AlreadyInitialized = 2,
    /// Caller does not have permission.
    Unauthorized = 3,
    /// Role not found for the given address.
    RoleNotFound = 4,
    /// Address already holds the exact role being assigned.
    RoleAlreadyAssigned = 5,
    /// Invalid role for the requested operation (e.g. assigning Owner directly).
    InvalidRole = 6,
    /// Cannot remove the contract owner.
    CannotRemoveOwner = 7,
    /// Action requires higher privilege level.
    InsufficientPrivilege = 8,
    /// An actor attempted to modify its own role.
    SelfModification = 9,
    /// No pending ownership transfer exists.
    NoPendingOwner = 10,
    /// Caller is not the pending owner of the active transfer.
    NotPendingOwner = 11,
    /// The proposed new owner already holds a role conflicting with the transfer.
    OwnerExists = 12,
}

// ============================================================================
// Storage Types
// ============================================================================

/// Role levels in the access control hierarchy.
/// Higher values = more permissions.
#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Role {
    /// Can only view data, no write operations.
    Viewer = 1,
    /// Can participate (vote, deposit) but cannot manage.
    Member = 2,
    /// Can manage members and moderate operations.
    Admin = 3,
    /// Full control, can change any setting.
    Owner = 4,
}

/// Storage keys for access control.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DataKey {
    /// Whether contract is initialized.
    Initialized,
    /// The contract owner address.
    Owner,
    /// The pending owner of an in-flight ownership transfer.
    PendingOwner,
    /// Role assignment for an address.
    Role(Address),
    /// List of all addresses with roles.
    AllMembers,
    /// Total number of each role type.
    RoleCount(u32),
}

/// Role assignment record.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RoleAssignment {
    /// The address holding the role.
    pub address: Address,
    /// The assigned role.
    pub role: Role,
    /// When the role was assigned.
    pub assigned_at: u64,
    /// Who assigned this role.
    pub assigned_by: Address,
}

/// Access control summary.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AccessSummary {
    pub owner: Address,
    pub total_members: u32,
    pub owner_count: u32,
    pub admin_count: u32,
    pub member_count: u32,
    pub viewer_count: u32,
}

// ============================================================================
// Contract Implementation
// ============================================================================

#[contract]
pub struct AccessControlContract;

#[contractimpl]
impl AccessControlContract {
    // ========================================================================
    // Initialization
    // ========================================================================

    /// Initialize the access control contract.
    ///
    /// # Arguments
    /// * `owner` - The address that will have Owner role.
    pub fn initialize(env: Env, owner: Address) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::Initialized) {
            return Err(Error::AlreadyInitialized);
        }

        owner.require_auth();

        env.storage().instance().set(&DataKey::Initialized, &true);
        env.storage().instance().set(&DataKey::Owner, &owner);

        // Assign Owner role
        let assignment = RoleAssignment {
            address: owner.clone(),
            role: Role::Owner,
            assigned_at: env.ledger().timestamp(),
            assigned_by: owner.clone(),
        };
        env.storage()
            .persistent()
            .set(&DataKey::Role(owner.clone()), &assignment);

        // Initialize member list with owner
        let mut members = Vec::new(&env);
        members.push_back(owner.clone());
        env.storage()
            .instance()
            .set(&DataKey::AllMembers, &members);

        // Initialize role counts
        env.storage()
            .instance()
            .set(&DataKey::RoleCount(Role::Owner as u32), &1_u32);
        env.storage()
            .instance()
            .set(&DataKey::RoleCount(Role::Admin as u32), &0_u32);
        env.storage()
            .instance()
            .set(&DataKey::RoleCount(Role::Member as u32), &0_u32);
        env.storage()
            .instance()
            .set(&DataKey::RoleCount(Role::Viewer as u32), &0_u32);

        env.events().publish(
            (symbol_short!("acl"), symbol_short!("init")),
            (owner.clone(), EVENT_SCHEMA_VERSION),
        );

        log!(&env, "Access control initialized with owner {:?}", owner);
        Ok(())
    }

    // ========================================================================
    // Role Assignment
    // ========================================================================

    /// Assign a role to an address.
    ///
    /// Authorization rules (see the permission matrix in the module docs):
    /// - Only the Owner may assign the Admin role.
    /// - Owner or Admin may assign Member and Viewer roles.
    /// - The Owner role is never assigned here; use the ownership transfer flow.
    /// - An Admin cannot modify another Admin's role.
    /// - An actor cannot change its own role.
    /// - Re-assigning the exact role already held fails with `RoleAlreadyAssigned`.
    ///
    /// # Arguments
    /// * `assignor` - The address assigning the role (must be Admin or Owner).
    /// * `target` - The address receiving the role.
    /// * `role` - The role to assign.
    pub fn assign_role(
        env: Env,
        assignor: Address,
        target: Address,
        role: Role,
    ) -> Result<(), Error> {
        Self::require_initialized(&env)?;

        assignor.require_auth();

        // An actor may never change its own role (blocks self-escalation/demotion).
        if assignor == target {
            return Err(Error::SelfModification);
        }

        // Ownership only moves through the dedicated two-step transfer flow.
        if role == Role::Owner {
            return Err(Error::InvalidRole);
        }

        let assignor_role = Self::internal_get_role(&env, &assignor)?;

        // Hierarchy: only Owner assigns Admin; Owner/Admin assign Member/Viewer.
        match role {
            Role::Admin => {
                if assignor_role != Role::Owner {
                    return Err(Error::InsufficientPrivilege);
                }
            }
            Role::Member | Role::Viewer => {
                if assignor_role != Role::Owner && assignor_role != Role::Admin {
                    return Err(Error::InsufficientPrivilege);
                }
            }
            // Already rejected above; kept exhaustive without panicking.
            Role::Owner => return Err(Error::InvalidRole),
        }

        let role_val = role as u32;
        let mut count: u32 = env
            .storage()
            .instance()
            .get(&DataKey::RoleCount(role_val))
            .unwrap_or(0);

        // Determine the previous role (0 = none) and maintain counts / membership.
        let mut old_role_val: u32 = 0;
        if env
            .storage()
            .persistent()
            .has(&DataKey::Role(target.clone()))
        {
            let old_assignment: RoleAssignment = env
                .storage()
                .persistent()
                .get(&DataKey::Role(target.clone()))
                .unwrap();

            // Subordinate rule: only the Owner can modify an existing Admin.
            if old_assignment.role == Role::Admin && assignor_role != Role::Owner {
                return Err(Error::InsufficientPrivilege);
            }

            // Reject a no-op duplicate assignment of the identical role.
            if old_assignment.role == role {
                return Err(Error::RoleAlreadyAssigned);
            }

            old_role_val = old_assignment.role as u32;
            let mut old_count: u32 = env
                .storage()
                .instance()
                .get(&DataKey::RoleCount(old_role_val))
                .unwrap_or(1);
            if old_count > 0 {
                old_count -= 1;
            }
            env.storage()
                .instance()
                .set(&DataKey::RoleCount(old_role_val), &old_count);
        } else {
            // New member — add to the list.
            let mut members: Vec<Address> = env
                .storage()
                .instance()
                .get(&DataKey::AllMembers)
                .unwrap_or(Vec::new(&env));
            members.push_back(target.clone());
            env.storage()
                .instance()
                .set(&DataKey::AllMembers, &members);
        }

        let assignment = RoleAssignment {
            address: target.clone(),
            role,
            assigned_at: env.ledger().timestamp(),
            assigned_by: assignor.clone(),
        };

        env.storage()
            .persistent()
            .set(&DataKey::Role(target.clone()), &assignment);

        count += 1;
        env.storage()
            .instance()
            .set(&DataKey::RoleCount(role_val), &count);

        env.events().publish(
            (symbol_short!("acl"), symbol_short!("assign")),
            (assignor, target, old_role_val, role_val, EVENT_SCHEMA_VERSION),
        );

        Ok(())
    }

    /// Revoke a role from an address.
    /// Owners cannot be removed. Only owners can revoke admin roles.
    /// An actor cannot revoke its own role.
    pub fn revoke_role(
        env: Env,
        revoker: Address,
        target: Address,
    ) -> Result<(), Error> {
        Self::require_initialized(&env)?;

        revoker.require_auth();

        if revoker == target {
            return Err(Error::SelfModification);
        }

        let revoker_role = Self::internal_get_role(&env, &revoker)?;

        // Must be admin or owner to revoke.
        if revoker_role != Role::Owner && revoker_role != Role::Admin {
            return Err(Error::InsufficientPrivilege);
        }

        let target_assignment: RoleAssignment = env
            .storage()
            .persistent()
            .get(&DataKey::Role(target.clone()))
            .ok_or(Error::RoleNotFound)?;

        // Cannot remove owners.
        if target_assignment.role == Role::Owner {
            return Err(Error::CannotRemoveOwner);
        }

        // Only owners can revoke admin roles.
        if target_assignment.role == Role::Admin && revoker_role != Role::Owner {
            return Err(Error::InsufficientPrivilege);
        }

        // Decrement role count.
        let old_role_val = target_assignment.role as u32;
        let mut count: u32 = env
            .storage()
            .instance()
            .get(&DataKey::RoleCount(old_role_val))
            .unwrap_or(1);
        if count > 0 {
            count -= 1;
        }
        env.storage()
            .instance()
            .set(&DataKey::RoleCount(old_role_val), &count);

        // Remove role assignment.
        env.storage()
            .persistent()
            .remove(&DataKey::Role(target.clone()));

        // Remove from members list.
        let members: Vec<Address> = env
            .storage()
            .instance()
            .get(&DataKey::AllMembers)
            .unwrap_or(Vec::new(&env));
        let mut new_members = Vec::new(&env);
        for i in 0..members.len() {
            let m = members.get(i).unwrap();
            if m != target {
                new_members.push_back(m);
            }
        }
        env.storage()
            .instance()
            .set(&DataKey::AllMembers, &new_members);

        env.events().publish(
            (symbol_short!("acl"), symbol_short!("revoke")),
            (revoker, target, old_role_val, EVENT_SCHEMA_VERSION),
        );

        Ok(())
    }

    // ========================================================================
    // Permission Checks (for cross-contract use)
    // ========================================================================

    /// Check if an address has at least the specified role level.
    /// Returns true if the address's role >= required role.
    pub fn has_permission(env: Env, address: Address, required_role: Role) -> bool {
        let role_result = Self::internal_get_role(&env, &address);
        match role_result {
            Ok(role) => role >= required_role,
            Err(_) => false,
        }
    }

    /// Check if an address is the contract owner.
    pub fn is_owner(env: Env, address: Address) -> bool {
        let role_result = Self::internal_get_role(&env, &address);
        match role_result {
            Ok(role) => role == Role::Owner,
            Err(_) => false,
        }
    }

    /// Check if an address is an admin or owner.
    pub fn is_admin_or_above(env: Env, address: Address) -> bool {
        let role_result = Self::internal_get_role(&env, &address);
        match role_result {
            Ok(role) => role >= Role::Admin,
            Err(_) => false,
        }
    }

    /// Check if an address is a member or above.
    pub fn is_member_or_above(env: Env, address: Address) -> bool {
        let role_result = Self::internal_get_role(&env, &address);
        match role_result {
            Ok(role) => role >= Role::Member,
            Err(_) => false,
        }
    }

    /// Permission-matrix-as-code: whether `actor` may assign `role` via `assign_role`.
    /// Mirrors the authorization rules enforced in `assign_role`.
    pub fn can_assign(env: Env, actor: Address, role: Role) -> bool {
        // Owner is never assignable through `assign_role`.
        if role == Role::Owner {
            return false;
        }
        let actor_role = match Self::internal_get_role(&env, &actor) {
            Ok(r) => r,
            Err(_) => return false,
        };
        match role {
            Role::Admin => actor_role == Role::Owner,
            Role::Member | Role::Viewer => actor_role >= Role::Admin,
            Role::Owner => false,
        }
    }

    // ========================================================================
    // Query Functions
    // ========================================================================

    /// Get the role assignment record of an address.
    pub fn get_role(env: Env, address: Address) -> Result<RoleAssignment, Error> {
        env.storage()
            .persistent()
            .get(&DataKey::Role(address))
            .ok_or(Error::RoleNotFound)
    }

    /// Whether an address currently holds any role (membership check).
    pub fn has_role(env: Env, address: Address) -> bool {
        env.storage().persistent().has(&DataKey::Role(address))
    }

    /// Get the number of addresses holding a specific role.
    pub fn get_role_count(env: Env, role: Role) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::RoleCount(role as u32))
            .unwrap_or(0)
    }

    /// Get all members with roles.
    pub fn get_all_members(env: Env) -> Vec<Address> {
        env.storage()
            .instance()
            .get(&DataKey::AllMembers)
            .unwrap_or(Vec::new(&env))
    }

    /// Get every role assignment as a typed list.
    pub fn get_all_assignments(env: Env) -> Vec<RoleAssignment> {
        let members: Vec<Address> = env
            .storage()
            .instance()
            .get(&DataKey::AllMembers)
            .unwrap_or(Vec::new(&env));
        let mut out = Vec::new(&env);
        for i in 0..members.len() {
            let m = members.get(i).unwrap();
            if let Some(a) = env
                .storage()
                .persistent()
                .get::<DataKey, RoleAssignment>(&DataKey::Role(m))
            {
                out.push_back(a);
            }
        }
        out
    }

    /// Get the pending owner of an in-flight ownership transfer, if any.
    pub fn get_pending_owner(env: Env) -> Option<Address> {
        env.storage().instance().get(&DataKey::PendingOwner)
    }

    /// Get the access control summary.
    pub fn get_summary(env: Env) -> Result<AccessSummary, Error> {
        Self::require_initialized(&env)?;

        let owner: Address = env
            .storage()
            .instance()
            .get(&DataKey::Owner)
            .ok_or(Error::NotInitialized)?;
        let members: Vec<Address> = env
            .storage()
            .instance()
            .get(&DataKey::AllMembers)
            .unwrap_or(Vec::new(&env));
        let owner_count: u32 = env
            .storage()
            .instance()
            .get(&DataKey::RoleCount(Role::Owner as u32))
            .unwrap_or(0);
        let admin_count: u32 = env
            .storage()
            .instance()
            .get(&DataKey::RoleCount(Role::Admin as u32))
            .unwrap_or(0);
        let member_count: u32 = env
            .storage()
            .instance()
            .get(&DataKey::RoleCount(Role::Member as u32))
            .unwrap_or(0);
        let viewer_count: u32 = env
            .storage()
            .instance()
            .get(&DataKey::RoleCount(Role::Viewer as u32))
            .unwrap_or(0);

        Ok(AccessSummary {
            owner,
            total_members: members.len(),
            owner_count,
            admin_count,
            member_count,
            viewer_count,
        })
    }

    // ========================================================================
    // Ownership Lifecycle (two-step transfer)
    // ========================================================================

    /// Propose transferring ownership to `new_owner`.
    ///
    /// Stages a pending transfer; the new owner must call `accept_ownership` to
    /// complete it. Only the current owner may propose. This two-step flow prevents
    /// accidental owner lockout (e.g. a typo'd address can never silently take over).
    pub fn propose_ownership(
        env: Env,
        current_owner: Address,
        new_owner: Address,
    ) -> Result<(), Error> {
        Self::require_initialized(&env)?;

        current_owner.require_auth();

        let stored_owner: Address = env
            .storage()
            .instance()
            .get(&DataKey::Owner)
            .ok_or(Error::NotInitialized)?;
        if current_owner != stored_owner {
            return Err(Error::Unauthorized);
        }

        if new_owner == current_owner {
            return Err(Error::SelfModification);
        }

        // The proposed owner must not already be an Owner (single-owner invariant).
        if Self::internal_get_role(&env, &new_owner) == Ok(Role::Owner) {
            return Err(Error::OwnerExists);
        }

        env.storage()
            .instance()
            .set(&DataKey::PendingOwner, &new_owner);

        env.events().publish(
            (symbol_short!("acl"), symbol_short!("own_prop")),
            (current_owner, new_owner, EVENT_SCHEMA_VERSION),
        );

        Ok(())
    }

    /// Accept a pending ownership transfer. Must be called by the pending owner.
    ///
    /// The previous owner is demoted to Admin and the caller becomes the sole Owner.
    /// Role counts are kept consistent and exactly one Owner remains.
    pub fn accept_ownership(env: Env, new_owner: Address) -> Result<(), Error> {
        Self::require_initialized(&env)?;

        new_owner.require_auth();

        let pending: Address = env
            .storage()
            .instance()
            .get(&DataKey::PendingOwner)
            .ok_or(Error::NoPendingOwner)?;
        if pending != new_owner {
            return Err(Error::NotPendingOwner);
        }

        let old_owner: Address = env
            .storage()
            .instance()
            .get(&DataKey::Owner)
            .ok_or(Error::NotInitialized)?;

        let now = env.ledger().timestamp();

        // Old owner: Owner -> Admin.
        let mut owner_count: u32 = env
            .storage()
            .instance()
            .get(&DataKey::RoleCount(Role::Owner as u32))
            .unwrap_or(1);
        if owner_count > 0 {
            owner_count -= 1;
        }
        let mut admin_count: u32 = env
            .storage()
            .instance()
            .get(&DataKey::RoleCount(Role::Admin as u32))
            .unwrap_or(0);
        admin_count += 1;

        let old_owner_assignment = RoleAssignment {
            address: old_owner.clone(),
            role: Role::Admin,
            assigned_at: now,
            assigned_by: old_owner.clone(),
        };
        env.storage()
            .persistent()
            .set(&DataKey::Role(old_owner.clone()), &old_owner_assignment);

        // New owner: decrement its prior role count (if any) or add to members.
        if let Some(prev) = env
            .storage()
            .persistent()
            .get::<DataKey, RoleAssignment>(&DataKey::Role(new_owner.clone()))
        {
            let prev_val = prev.role as u32;
            if prev_val == Role::Admin as u32 {
                if admin_count > 0 {
                    admin_count -= 1;
                }
            } else {
                let mut c: u32 = env
                    .storage()
                    .instance()
                    .get(&DataKey::RoleCount(prev_val))
                    .unwrap_or(1);
                if c > 0 {
                    c -= 1;
                }
                env.storage()
                    .instance()
                    .set(&DataKey::RoleCount(prev_val), &c);
            }
        } else {
            let mut members: Vec<Address> = env
                .storage()
                .instance()
                .get(&DataKey::AllMembers)
                .unwrap_or(Vec::new(&env));
            members.push_back(new_owner.clone());
            env.storage()
                .instance()
                .set(&DataKey::AllMembers, &members);
        }

        owner_count += 1;

        let new_owner_assignment = RoleAssignment {
            address: new_owner.clone(),
            role: Role::Owner,
            assigned_at: now,
            assigned_by: old_owner.clone(),
        };
        env.storage()
            .persistent()
            .set(&DataKey::Role(new_owner.clone()), &new_owner_assignment);

        // Persist counts and the new owner pointer; clear the pending transfer.
        env.storage()
            .instance()
            .set(&DataKey::RoleCount(Role::Owner as u32), &owner_count);
        env.storage()
            .instance()
            .set(&DataKey::RoleCount(Role::Admin as u32), &admin_count);
        env.storage()
            .instance()
            .set(&DataKey::Owner, &new_owner);
        env.storage().instance().remove(&DataKey::PendingOwner);

        env.events().publish(
            (symbol_short!("acl"), symbol_short!("owner")),
            (old_owner, new_owner, EVENT_SCHEMA_VERSION),
        );

        Ok(())
    }

    /// Cancel an in-flight ownership transfer. Only the current owner may cancel.
    pub fn cancel_ownership_transfer(
        env: Env,
        current_owner: Address,
    ) -> Result<(), Error> {
        Self::require_initialized(&env)?;

        current_owner.require_auth();

        let stored_owner: Address = env
            .storage()
            .instance()
            .get(&DataKey::Owner)
            .ok_or(Error::NotInitialized)?;
        if current_owner != stored_owner {
            return Err(Error::Unauthorized);
        }

        let pending: Address = env
            .storage()
            .instance()
            .get(&DataKey::PendingOwner)
            .ok_or(Error::NoPendingOwner)?;

        env.storage().instance().remove(&DataKey::PendingOwner);

        env.events().publish(
            (symbol_short!("acl"), symbol_short!("own_cxl")),
            (current_owner, pending, EVENT_SCHEMA_VERSION),
        );

        Ok(())
    }

    // ========================================================================
    // Admin Functions
    // ========================================================================

    /// Upgrade contract WASM. Owner only.
    pub fn upgrade(
        env: Env,
        owner: Address,
        new_wasm_hash: soroban_sdk::BytesN<32>,
    ) -> Result<(), Error> {
        Self::require_initialized(&env)?;

        owner.require_auth();

        let stored_owner: Address = env
            .storage()
            .instance()
            .get(&DataKey::Owner)
            .ok_or(Error::NotInitialized)?;
        if owner != stored_owner {
            return Err(Error::Unauthorized);
        }

        env.deployer().update_current_contract_wasm(new_wasm_hash);
        Ok(())
    }

    // ========================================================================
    // Internal Helpers
    // ========================================================================

    fn require_initialized(env: &Env) -> Result<(), Error> {
        if !env.storage().instance().has(&DataKey::Initialized) {
            return Err(Error::NotInitialized);
        }
        Ok(())
    }

    fn internal_get_role(env: &Env, address: &Address) -> Result<Role, Error> {
        let assignment: RoleAssignment = env
            .storage()
            .persistent()
            .get(&DataKey::Role(address.clone()))
            .ok_or(Error::RoleNotFound)?;
        Ok(assignment.role)
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod test;
