// Raw event from Soroban RPC getEvents
export interface RawSorobanEvent {
  type: string;
  ledger: string;
  ledgerClosedAt: string;
  contractId: string;
  id: string;
  pagingToken: string;
  topic: string[];   // base64 XDR ScVal[]
  value: string;     // base64 XDR ScVal
  inSuccessfulContractCall: boolean;
  txHash?: string;
}

export type ContractNamespace = 'treasury' | 'gov' | 'vault' | 'acl';
export type ContractType = 'treasury' | 'governance' | 'vault' | 'acl';

// Treasury events
export type TreasuryEventType =
  | 'init' | 'deposit' | 'propose' | 'approve' | 'execute'
  | 'revoke' | 'cancel' | 'add_sig' | 'rem_sig' | 'thresh' | 'admin';

// Governance events
export type GovernanceEventType =
  | 'init' | 'propose' | 'vote' | 'finalize' | 'exec' | 'admin' | 'quorum';

// Vault events
export type VaultEventType =
  | 'init' | 'lock' | 'claim' | 'vest' | 'v_claim' | 'emrg_ap' | 'emrg_ex' | 'admin';

// ACL events
export type AclEventType = 'init' | 'assign' | 'revoke';

export type AnyEventType = TreasuryEventType | GovernanceEventType | VaultEventType | AclEventType;

// Lifecycle status values
export type LifecycleStatus =
  | 'proposed' | 'approved' | 'executed' | 'canceled'
  | 'expired' | 'revoked' | 'stale_policy'
  | 'locked' | 'claimed' | 'vesting' | 'vested'
  | 'initialized' | 'deposited'
  | 'signer_added' | 'signer_removed' | 'threshold_changed' | 'admin_transferred'
  | 'role_assigned' | 'role_revoked'
  | 'vote_cast' | 'finalized' | 'governance_executed' | 'quorum_updated';

// Parsed treasury event payloads
export interface TreasuryInitPayload {
  admin: string;
  asset: string;
  threshold: number;
  signerCount: number;
}

export interface TreasuryDepositPayload {
  from: string;
  amount: bigint;
  newBalance: bigint;
}

export interface TreasuryProposePayload {
  txId: bigint;
  proposer: string;
  to: string;
  amount: bigint;
}

export interface TreasuryApprovePayload {
  txId: bigint;
  signer: string;
  approvalCount: number;
}

export interface TreasuryExecutePayload {
  txId: bigint;
  to: string;
  amount: bigint;
  newBalance: bigint;
}

export interface TreasuryRevokePayload {
  txId: bigint;
  signer: string;
  approvalCount: number;
}

export interface TreasuryCancelPayload {
  txId: bigint;
  caller: string;
}

export interface TreasurySignerPayload {
  signer: string;
  signerCount: number;
}

export interface TreasuryThresholdPayload {
  newThreshold: number;
}

export interface TreasuryAdminPayload {
  oldAdmin: string;
  newAdmin: string;
}

// Parsed governance event payloads
export interface GovProposePayload {
  proposalId: bigint;
  proposer: string;
  title: string;
  action: string;
}

export interface GovVotePayload {
  proposalId: bigint;
  voter: string;
  voteFor: boolean;
}

export interface GovFinalizePayload {
  proposalId: bigint;
  status: string;
}

export interface GovExecPayload {
  proposalId: bigint;
  executor: string;
}

export interface GovAdminPayload {
  oldAdmin: string;
  newAdmin: string;
}

export interface GovQuorumPayload {
  newQuorum: number;
}

// Parsed vault event payloads
export interface VaultLockPayload {
  lockId: bigint;
  owner: string;
  amount: bigint;
  duration: bigint;
}

export interface VaultClaimPayload {
  lockId: bigint;
  owner: string;
  amount: bigint;
}

export interface VaultVestPayload {
  vestingId: bigint;
  beneficiary: string;
  amount: bigint;
  duration: bigint;
}

export interface VaultVestClaimPayload {
  vestingId: bigint;
  beneficiary: string;
  amount: bigint;
}

export interface VaultEmergencyApprovePayload {
  lockId: bigint;
  signer: string;
  approvalCount: number;
}

export interface VaultEmergencyExecPayload {
  lockId: bigint;
  caller: string;
  amount: bigint;
}

// Parsed ACL payloads
export interface AclAssignPayload {
  target: string;
  role: string;
  assignor: string;
}

export interface AclRevokePayload {
  target: string;
  revoker: string;
}

// Decoded and normalized event (after parsing)
export interface ParsedEvent {
  rawId: string;
  ledger: number;
  ledgerTimestamp: string;
  txHash: string;
  contractId: string;
  contractType: ContractType;
  eventType: AnyEventType;
  schemaVersion: number;
  actor: string | null;
  asset: string | null;
  amount: string | null;
  proposalId: string | null;
  lifecycleStatus: LifecycleStatus;
  policyVersion: number | null;
  rawValue: unknown;
}

// Parse result — either a parsed event or a quarantine record
export type ParseResult =
  | { ok: true; event: ParsedEvent }
  | { ok: false; reason: string; rawTopics: string[]; rawValue: string };
