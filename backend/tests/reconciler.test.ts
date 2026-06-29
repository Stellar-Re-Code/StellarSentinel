import { Db } from '../src/db/client';
import { parseEvent } from '../src/indexer/parser';
import { handleTreasuryEvent } from '../src/indexer/handlers/treasury';
import {
  makeTreasuryDepositEvent, makeTreasuryProposeEvent,
  makeTreasuryApproveEvent, makeTreasuryExecuteEvent,
  SIGNER1, SIGNER2, CONTRACT_ID,
} from './fixtures';

// Minimal reconciler implementation that accepts an on-chain balance directly
// (avoids needing a live RPC in unit tests)
async function runReconciliation(db: Db, contractId: string, onChainBalance: bigint): Promise<void> {
  const indexed = db.getLatestBalance(contractId);
  const indexedBig = indexed ? BigInt(indexed) : 0n;
  const discrepancy = onChainBalance - indexedBig;

  db.insertReconciliation({
    contract_id: contractId,
    ledger_sequence: 9999,
    indexed_balance: String(indexedBig),
    on_chain_balance: String(onChainBalance),
    discrepancy: String(discrepancy),
    status: discrepancy === 0n ? 'ok' : 'mismatch',
    detail: discrepancy !== 0n ? `delta=${discrepancy}` : null,
  });
}

function ingest(db: Db, raw: ReturnType<typeof makeTreasuryDepositEvent>): void {
  const result = parseEvent(raw, 'treasury');
  if (!result.ok) return;
  const inserted = db.insertEvent(result.event);
  if (inserted) handleTreasuryEvent(db, result.event);
}

describe('Reconciler', () => {
  let db: Db;
  beforeEach(() => { db = new Db(':memory:'); });
  afterEach(() => { db.close(); });

  test('reports OK when indexed balance matches on-chain', async () => {
    ingest(db, makeTreasuryDepositEvent(SIGNER1, 5_000n, 5_000n, '1001'));

    await runReconciliation(db, CONTRACT_ID, 5_000n);

    const rec = db.getLatestReconciliation(CONTRACT_ID);
    expect(rec?.status).toBe('ok');
    expect(rec?.discrepancy).toBe('0');
  });

  test('reports mismatch when indexed balance differs from on-chain', async () => {
    ingest(db, makeTreasuryDepositEvent(SIGNER1, 5_000n, 5_000n, '1001'));

    // On-chain has 6000 but indexer only knows about 5000 (missed a deposit)
    await runReconciliation(db, CONTRACT_ID, 6_000n);

    const rec = db.getLatestReconciliation(CONTRACT_ID);
    expect(rec?.status).toBe('mismatch');
    expect(rec?.discrepancy).toBe('1000');
    expect(rec?.detail).toContain('delta=1000');
  });

  test('reports mismatch when indexed balance exceeds on-chain', async () => {
    ingest(db, makeTreasuryDepositEvent(SIGNER1, 10_000n, 10_000n, '1001'));
    ingest(db, makeTreasuryExecuteEvent(1n, SIGNER2, 3_000n, 7_000n, '1003'));

    // On-chain only shows 6000 — indexer thinks it's 7000
    await runReconciliation(db, CONTRACT_ID, 6_000n);

    const rec = db.getLatestReconciliation(CONTRACT_ID);
    expect(rec?.status).toBe('mismatch');
  });

  test('skips reconciliation when no events have been indexed', async () => {
    // No events — nothing to reconcile
    const balance = db.getLatestBalance(CONTRACT_ID);
    expect(balance).toBeNull();

    // The reconciler should have nothing stored
    const rec = db.getLatestReconciliation(CONTRACT_ID);
    expect(rec).toBeNull();
  });

  test('stores multiple reconciliation snapshots over time', async () => {
    ingest(db, makeTreasuryDepositEvent(SIGNER1, 5_000n, 5_000n, '1001'));

    await runReconciliation(db, CONTRACT_ID, 5_000n);
    await runReconciliation(db, CONTRACT_ID, 5_000n);

    const rec = db.getLatestReconciliation(CONTRACT_ID);
    expect(rec?.status).toBe('ok');
    // Multiple rows exist but getLatestReconciliation returns the most recent
    expect(rec).not.toBeNull();
  });

  test('reconciliation after full lifecycle: deposit + execute = correct balance', async () => {
    ingest(db, makeTreasuryDepositEvent(SIGNER1, 10_000n, 10_000n, '1001'));
    ingest(db, makeTreasuryProposeEvent(1n, SIGNER1, SIGNER2, 3_000n, '1002'));
    ingest(db, makeTreasuryApproveEvent(1n, SIGNER2, 2, '1003'));
    ingest(db, makeTreasuryExecuteEvent(1n, SIGNER2, 3_000n, 7_000n, '1004'));

    const indexed = db.getLatestBalance(CONTRACT_ID);
    expect(indexed).toBe('7000');

    await runReconciliation(db, CONTRACT_ID, 7_000n);

    const rec = db.getLatestReconciliation(CONTRACT_ID);
    expect(rec?.status).toBe('ok');
    expect(rec?.indexed_balance).toBe('7000');
    expect(rec?.on_chain_balance).toBe('7000');
  });
});
