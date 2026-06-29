import BetterSqlite3 from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { runMigrations } from './migrations';
import type {
  IndexedEventRow, CheckpointRow, QuarantinedEventRow,
  TreasuryProposalRow, TreasuryApprovalRow, BalanceHistoryRow,
  ReconciliationResultRow, ProposalStatus,
} from '../types/models';
import type { ParsedEvent } from '../types/events';

export class Db {
  private db: BetterSqlite3.Database;

  constructor(dbPath: string) {
    if (dbPath !== ':memory:') {
      const dir = path.dirname(dbPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    }
    this.db = new BetterSqlite3(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    runMigrations(this.db);
  }

  close(): void {
    this.db.close();
  }

  // ─── Checkpoint ──────────────────────────────────────────────────────────

  getCheckpoint(): CheckpointRow | null {
    return (this.db.prepare('SELECT * FROM checkpoints WHERE id = 1').get() as CheckpointRow) ?? null;
  }

  upsertCheckpoint(lastLedger: number, lastEventId: string | null): void {
    this.db.prepare(`
      INSERT INTO checkpoints (id, last_ledger, last_event_id, updated_at)
      VALUES (1, ?, ?, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        last_ledger   = excluded.last_ledger,
        last_event_id = excluded.last_event_id,
        updated_at    = excluded.updated_at
    `).run(lastLedger, lastEventId);
  }

  // ─── Indexed events ───────────────────────────────────────────────────────

  insertEvent(event: ParsedEvent): boolean {
    const result = this.db.prepare(`
      INSERT OR IGNORE INTO indexed_events
        (event_id, ledger_sequence, ledger_timestamp, tx_hash, contract_id,
         contract_type, event_type, schema_version, actor, asset, amount,
         proposal_id, lifecycle_status, policy_version, raw_value)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      event.rawId, event.ledger, event.ledgerTimestamp, event.txHash,
      event.contractId, event.contractType, event.eventType,
      event.schemaVersion, event.actor, event.asset,
      event.amount, event.proposalId, event.lifecycleStatus,
      event.policyVersion, JSON.stringify(event.rawValue, (_k, v) => typeof v === 'bigint' ? v.toString() : v),
    );
    return result.changes > 0;
  }

  eventExists(eventId: string): boolean {
    const row = this.db.prepare('SELECT id FROM indexed_events WHERE event_id = ?').get(eventId);
    return row != null;
  }

  getEventsByProposal(contractId: string, proposalId: string): IndexedEventRow[] {
    return this.db.prepare(`
      SELECT * FROM indexed_events
      WHERE contract_id = ? AND proposal_id = ?
      ORDER BY ledger_sequence ASC
    `).all(contractId, proposalId) as IndexedEventRow[];
  }

  getEventsByActor(actor: string, limit = 100, offset = 0): IndexedEventRow[] {
    return this.db.prepare(`
      SELECT * FROM indexed_events
      WHERE actor = ?
      ORDER BY ledger_sequence DESC
      LIMIT ? OFFSET ?
    `).all(actor, limit, offset) as IndexedEventRow[];
  }

  getEventsByContract(contractId: string, limit = 100, offset = 0): IndexedEventRow[] {
    return this.db.prepare(`
      SELECT * FROM indexed_events
      WHERE contract_id = ?
      ORDER BY ledger_sequence DESC
      LIMIT ? OFFSET ?
    `).all(contractId, limit, offset) as IndexedEventRow[];
  }

  // ─── Quarantine ───────────────────────────────────────────────────────────

  quarantineEvent(params: {
    eventId: string;
    ledger: number;
    txHash: string;
    contractId: string;
    rawTopics: string[];
    rawValue: string;
    reason: string;
  }): void {
    this.db.prepare(`
      INSERT INTO quarantined_events
        (event_id, ledger_sequence, tx_hash, contract_id, raw_topic, raw_value, reason)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      params.eventId, params.ledger, params.txHash, params.contractId,
      JSON.stringify(params.rawTopics), params.rawValue, params.reason,
    );
  }

  getQuarantinedEvents(limit = 50, offset = 0): QuarantinedEventRow[] {
    return this.db.prepare(`
      SELECT * FROM quarantined_events ORDER BY id DESC LIMIT ? OFFSET ?
    `).all(limit, offset) as QuarantinedEventRow[];
  }

  // ─── Treasury proposals ───────────────────────────────────────────────────

  upsertProposal(row: Omit<TreasuryProposalRow, 'ledger_closed'> & { ledger_closed?: number | null }): void {
    this.db.prepare(`
      INSERT INTO treasury_proposals
        (proposal_id, contract_id, proposer, to_address, amount, policy_version,
         status, ledger_proposed, ledger_closed, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(proposal_id, contract_id) DO UPDATE SET
        status       = excluded.status,
        ledger_closed = COALESCE(excluded.ledger_closed, treasury_proposals.ledger_closed)
    `).run(
      row.proposal_id, row.contract_id, row.proposer, row.to_address,
      row.amount, row.policy_version ?? null, row.status,
      row.ledger_proposed, row.ledger_closed ?? null, row.created_at,
    );
  }

  updateProposalStatus(contractId: string, proposalId: string, status: ProposalStatus, ledgerClosed?: number): void {
    this.db.prepare(`
      UPDATE treasury_proposals
      SET status = ?, ledger_closed = COALESCE(?, ledger_closed)
      WHERE contract_id = ? AND proposal_id = ?
    `).run(status, ledgerClosed ?? null, contractId, proposalId);
  }

  getProposal(contractId: string, proposalId: string): TreasuryProposalRow | null {
    return (this.db.prepare(`
      SELECT * FROM treasury_proposals WHERE contract_id = ? AND proposal_id = ?
    `).get(contractId, proposalId) as TreasuryProposalRow) ?? null;
  }

  listProposals(contractId: string, status?: ProposalStatus, limit = 50, offset = 0): TreasuryProposalRow[] {
    if (status) {
      return this.db.prepare(`
        SELECT * FROM treasury_proposals
        WHERE contract_id = ? AND status = ?
        ORDER BY ledger_proposed DESC LIMIT ? OFFSET ?
      `).all(contractId, status, limit, offset) as TreasuryProposalRow[];
    }
    return this.db.prepare(`
      SELECT * FROM treasury_proposals
      WHERE contract_id = ?
      ORDER BY ledger_proposed DESC LIMIT ? OFFSET ?
    `).all(contractId, limit, offset) as TreasuryProposalRow[];
  }

  // ─── Approvals ────────────────────────────────────────────────────────────

  upsertApproval(row: Omit<TreasuryApprovalRow, 'id'>): void {
    this.db.prepare(`
      INSERT INTO treasury_approvals
        (proposal_id, contract_id, signer, approval_count, ledger_sequence, revoked)
      VALUES (?, ?, ?, ?, ?, 0)
      ON CONFLICT(proposal_id, contract_id, signer) DO UPDATE SET
        approval_count = excluded.approval_count,
        ledger_sequence = excluded.ledger_sequence,
        revoked = 0
    `).run(row.proposal_id, row.contract_id, row.signer, row.approval_count ?? null, row.ledger_sequence);
  }

  revokeApproval(contractId: string, proposalId: string, signer: string, ledger: number): void {
    this.db.prepare(`
      UPDATE treasury_approvals
      SET revoked = 1, ledger_sequence = ?
      WHERE contract_id = ? AND proposal_id = ? AND signer = ?
    `).run(ledger, contractId, proposalId, signer);
  }

  getApprovals(contractId: string, proposalId: string): TreasuryApprovalRow[] {
    return this.db.prepare(`
      SELECT * FROM treasury_approvals
      WHERE contract_id = ? AND proposal_id = ?
      ORDER BY ledger_sequence ASC
    `).all(contractId, proposalId) as TreasuryApprovalRow[];
  }

  // ─── Balance history ──────────────────────────────────────────────────────

  insertBalanceHistory(row: Omit<BalanceHistoryRow, 'id'>): void {
    this.db.prepare(`
      INSERT INTO treasury_balance_history
        (contract_id, ledger_sequence, event_type, actor, amount, new_balance, proposal_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(row.contract_id, row.ledger_sequence, row.event_type, row.actor ?? null,
      row.amount, row.new_balance, row.proposal_id ?? null);
  }

  getLatestBalance(contractId: string): string | null {
    const row = this.db.prepare(`
      SELECT new_balance FROM treasury_balance_history
      WHERE contract_id = ?
      ORDER BY ledger_sequence DESC LIMIT 1
    `).get(contractId) as { new_balance: string } | undefined;
    return row?.new_balance ?? null;
  }

  getBalanceHistory(contractId: string, limit = 100, offset = 0): BalanceHistoryRow[] {
    return this.db.prepare(`
      SELECT * FROM treasury_balance_history
      WHERE contract_id = ?
      ORDER BY ledger_sequence DESC LIMIT ? OFFSET ?
    `).all(contractId, limit, offset) as BalanceHistoryRow[];
  }

  // ─── Reconciliation ───────────────────────────────────────────────────────

  insertReconciliation(row: Omit<ReconciliationResultRow, 'id' | 'checked_at'>): void {
    this.db.prepare(`
      INSERT INTO reconciliation_results
        (contract_id, ledger_sequence, indexed_balance, on_chain_balance,
         discrepancy, status, detail)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      row.contract_id, row.ledger_sequence, row.indexed_balance,
      row.on_chain_balance, row.discrepancy, row.status, row.detail ?? null,
    );
  }

  getLatestReconciliation(contractId: string): ReconciliationResultRow | null {
    return (this.db.prepare(`
      SELECT * FROM reconciliation_results
      WHERE contract_id = ? ORDER BY id DESC LIMIT 1
    `).get(contractId) as ReconciliationResultRow) ?? null;
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }
}
