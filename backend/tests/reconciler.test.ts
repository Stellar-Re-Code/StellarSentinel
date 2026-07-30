import { Db } from '../src/db/client';
import { Reconciler } from '../src/indexer/reconciler';
import { parseEvent } from '../src/indexer/parser';
import { handleTreasuryEvent } from '../src/indexer/handlers/treasury';
import {
  makeTreasuryDepositEvent, makeTreasuryProposeEvent,
  makeTreasuryApproveEvent, makeTreasuryExecuteEvent,
  SIGNER1, SIGNER2, CONTRACT_ID,
} from './fixtures';

function ingest(db: Db, raw: ReturnType<typeof makeTreasuryDepositEvent>): void {
  const result = parseEvent(raw, 'treasury');
  if (!result.ok) return;
  const inserted = db.insertEvent(result.event);
  if (inserted) handleTreasuryEvent(db, result.event);
}

function makeReconciler(db: Db, onChainBalance: bigint): Reconciler {
  return new Reconciler({
    rpcUrl: 'http://localhost:8000',
    networkPassphrase: 'Test SDF Network ; September 2015',
    treasuryContractId: CONTRACT_ID,
    onChainBalanceGetter: async () => ({ balance: String(onChainBalance), ledger: 9999 }),
  });
}

describe('Reconciler', () => {
  let db: Db;
  beforeEach(() => { db = new Db(':memory:'); });
  afterEach(() => { db.close(); });

  test('reports OK when indexed balance matches on-chain', async () => {
    ingest(db, makeTreasuryDepositEvent(SIGNER1, 5_000n, 5_000n, '1001'));

    const reconciler = makeReconciler(db, 5_000n);
    await reconciler.reconcile(db);

    const rec = db.getLatestReconciliation(CONTRACT_ID);
    expect(rec?.status).toBe('ok');
    expect(rec?.discrepancy).toBe('0');
    expect(db.isHalted()).toBe(false);
  });

  test('reports mismatch and halts when indexed balance differs from on-chain', async () => {
    ingest(db, makeTreasuryDepositEvent(SIGNER1, 5_000n, 5_000n, '1001'));

    const reconciler = makeReconciler(db, 6_000n);
    await reconciler.reconcile(db);

    const rec = db.getLatestReconciliation(CONTRACT_ID);
    expect(rec?.status).toBe('mismatch');
    expect(rec?.discrepancy).toBe('1000');

    // Production code path: reconciler halts indexer on mismatch
    expect(db.isHalted()).toBe(true);
    const status = db.getIndexerStatus();
    expect(status.halt_reason).toContain('Balance divergence');
    expect(status.halt_reason).toContain('delta=1000');
  });

  test('halts when indexed balance exceeds on-chain', async () => {
    ingest(db, makeTreasuryDepositEvent(SIGNER1, 10_000n, 10_000n, '1001'));
    const deposit2 = makeTreasuryDepositEvent(SIGNER1, 3_000n, 13_000n, '1002');
    deposit2.id = 'deposit2_001';
    deposit2.txHash = 'tx_deposit2_001';
    db.insertEvent((parseEvent(deposit2, 'treasury') as any).event);
    handleTreasuryEvent(db, (parseEvent(deposit2, 'treasury') as any).event);

    const reconciler = makeReconciler(db, 6_000n);
    await reconciler.reconcile(db);

    const rec = db.getLatestReconciliation(CONTRACT_ID);
    expect(rec?.status).toBe('mismatch');
    expect(db.isHalted()).toBe(true);
  });

  test('skips reconciliation when no events have been indexed', async () => {
    const balance = db.getLatestBalance(CONTRACT_ID);
    expect(balance).toBeNull();

    const reconciler = makeReconciler(db, 1_000n);
    await reconciler.reconcile(db);

    const rec = db.getLatestReconciliation(CONTRACT_ID);
    expect(rec).toBeNull();
  });

  test('stores multiple reconciliation snapshots over time', async () => {
    ingest(db, makeTreasuryDepositEvent(SIGNER1, 5_000n, 5_000n, '1001'));

    const reconciler1 = makeReconciler(db, 5_000n);
    await reconciler1.reconcile(db);
    const reconciler2 = makeReconciler(db, 5_000n);
    await reconciler2.reconcile(db);

    const rec = db.getLatestReconciliation(CONTRACT_ID);
    expect(rec?.status).toBe('ok');
    expect(rec).not.toBeNull();
  });

  test('reconciliation after full lifecycle: deposit + execute = correct balance', async () => {
    ingest(db, makeTreasuryDepositEvent(SIGNER1, 10_000n, 10_000n, '1001'));
    ingest(db, makeTreasuryProposeEvent(1n, SIGNER1, SIGNER2, 3_000n, '1002'));
    ingest(db, makeTreasuryApproveEvent(1n, SIGNER2, 2, '1003'));
    ingest(db, makeTreasuryExecuteEvent(1n, SIGNER2, 3_000n, 7_000n, '1004'));

    const indexed = db.getLatestBalance(CONTRACT_ID);
    expect(indexed).toBe('7000');

    const reconciler = makeReconciler(db, 7_000n);
    await reconciler.reconcile(db);

    const rec = db.getLatestReconciliation(CONTRACT_ID);
    expect(rec?.status).toBe('ok');
    expect(rec?.indexed_balance).toBe('7000');
    expect(rec?.on_chain_balance).toBe('7000');
    expect(db.isHalted()).toBe(false);
  });
});

describe('Reconciler — halt on divergence', () => {
  let db: Db;
  beforeEach(() => { db = new Db(':memory:'); });
  afterEach(() => { db.close(); });

  test('indexer is halted after reconciler detects mismatch', async () => {
    ingest(db, makeTreasuryDepositEvent(SIGNER1, 5_000n, 5_000n, '1001'));

    const reconciler = makeReconciler(db, 6_000n);
    await reconciler.reconcile(db);

    expect(db.isHalted()).toBe(true);
    const status = db.getIndexerStatus();
    expect(status.last_healthy_ledger).toBe(9999);
  });

  test('clearHalt resets indexer so it can be restarted', () => {
    db.haltIndexer('Test', 1001);
    expect(db.isHalted()).toBe(true);

    db.clearHalt();
    expect(db.isHalted()).toBe(false);
  });

  test('all halt-related DB methods work correctly in isolation', () => {
    expect(db.isHalted()).toBe(false);

    db.haltIndexer('Forced halt for test', 1001);
    expect(db.isHalted()).toBe(true);

    const status = db.getIndexerStatus();
    expect(status.halt_reason).toContain('Forced halt');

    db.clearHalt();
    expect(db.isHalted()).toBe(false);
  });
});
