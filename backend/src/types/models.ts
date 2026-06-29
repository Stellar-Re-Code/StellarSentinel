// Database row types (mirror the SQL schema)

export interface IndexedEventRow {
  id: number;
  event_id: string;
  ledger_sequence: number;
  ledger_timestamp: string;
  tx_hash: string;
  contract_id: string;
  contract_type: string;
  event_type: string;
  schema_version: number;
  actor: string | null;
  asset: string | null;
  amount: string | null;
  proposal_id: string | null;
  lifecycle_status: string;
  policy_version: number | null;
  raw_value: string;
  created_at: string;
}

export interface CheckpointRow {
  id: number;
  last_ledger: number;
  last_event_id: string | null;
  updated_at: string;
}

export interface QuarantinedEventRow {
  id: number;
  event_id: string;
  ledger_sequence: number;
  tx_hash: string;
  contract_id: string;
  raw_topic: string;
  raw_value: string;
  reason: string;
  created_at: string;
}

export interface TreasuryProposalRow {
  proposal_id: string;
  contract_id: string;
  proposer: string;
  to_address: string;
  amount: string;
  policy_version: number | null;
  status: ProposalStatus;
  ledger_proposed: number;
  ledger_closed: number | null;
  created_at: string;
}

export interface TreasuryApprovalRow {
  id: number;
  proposal_id: string;
  contract_id: string;
  signer: string;
  approval_count: number | null;
  ledger_sequence: number;
  revoked: number;
}

export interface BalanceHistoryRow {
  id: number;
  contract_id: string;
  ledger_sequence: number;
  event_type: string;
  actor: string | null;
  amount: string;
  new_balance: string;
  proposal_id: string | null;
}

export interface ReconciliationResultRow {
  id: number;
  contract_id: string;
  ledger_sequence: number;
  indexed_balance: string;
  on_chain_balance: string;
  discrepancy: string;
  status: 'ok' | 'mismatch' | 'error';
  detail: string | null;
  checked_at: string;
}

export type ProposalStatus =
  | 'proposed' | 'approved' | 'executed' | 'canceled'
  | 'expired' | 'stale_policy' | 'revoked';

// API response shapes
export interface ProposalHistoryEntry {
  proposalId: string;
  contractId: string;
  proposer: string;
  toAddress: string;
  amount: string;
  status: ProposalStatus;
  policyVersion: number | null;
  ledgerProposed: number;
  ledgerClosed: number | null;
  createdAt: string;
  approvals: ApprovalEntry[];
  events: AuditEvent[];
}

export interface ApprovalEntry {
  signer: string;
  approvalCount: number | null;
  ledgerSequence: number;
  revoked: boolean;
}

export interface AuditEvent {
  eventId: string;
  ledger: number;
  ledgerTimestamp: string;
  txHash: string;
  eventType: string;
  actor: string | null;
  amount: string | null;
  lifecycleStatus: string;
  rawValue: unknown;
}

export interface BalanceHistoryEntry {
  ledgerSequence: number;
  eventType: string;
  actor: string | null;
  amount: string;
  newBalance: string;
  proposalId: string | null;
}

export interface TreasuryAuditView {
  contractId: string;
  currentIndexedBalance: string;
  lastReconciliation: ReconciliationResultRow | null;
  balanceHistory: BalanceHistoryEntry[];
  openProposals: TreasuryProposalRow[];
}
