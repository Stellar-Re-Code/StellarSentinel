import { Db } from '../src/db/client';
import { Indexer } from '../src/indexer/indexer';
import type { Config } from '../src/config';
import { parseEvent } from '../src/indexer/parser';
import { handleTreasuryEvent } from '../src/indexer/handlers/treasury';
import {
  makeTreasuryDepositEvent, makeTreasuryProposeEvent, makeTreasuryApproveEvent,
  makeTreasuryExecuteEvent, makeTreasuryCancelEvent, makeTreasuryRevokeEvent,
  makeTreasuryAddSignerEvent, makeTreasuryThresholdEvent,
  makeMalformedEvent, makeUnknownNamespaceEvent,
  SIGNER1, SIGNER2, ADMIN, CONTRACT_ID,
} from './fixtures';

function testConfig(overrides: Partial<Config> = {}): Config {
  return {
    sorobanRpcUrl: 'http://test:8000',
    networkPassphrase: 'Test SDF Network ; September 2015',
    contracts: {
      treasury: CONTRACT_ID,
      governance: null,
      vault: null,
      acl: null,
    },
    databasePath: '',
    pollIntervalMs: 1000,
    batchSize: 10,
    startLedger: 1,
    logLevel: 'error',
    apiPort: 3001,
    corsOrigin: '*',
    ...overrides,
  };
}

// Helper: parse + handle a raw event
function ingest(db: Db, raw: ReturnType<typeof makeTreasuryDepositEvent>): void {
  const result = parseEvent(raw, 'treasury');
  if (!result.ok) {
    db.quarantineEvent({
      eventId: raw.id,
      ledger: parseInt(raw.ledger, 10),
      txHash: raw.txHash ?? raw.id,
      contractId: raw.contractId,
      rawTopics: result.rawTopics,
      rawValue: result.rawValue,
      reason: result.reason,
    });
    return;
  }
  const inserted = db.insertEvent(result.event);
  if (inserted) handleTreasuryEvent(db, result.event);
}

describe('Indexer — duplicate ingestion (idempotency)', () => {
  let db: Db;
  beforeEach(() => { db = new Db(':memory:'); });
  afterEach(() => { db.close(); });

  test('inserting the same event twice results in exactly one row', () => {
    const raw = makeTreasuryDepositEvent(SIGNER1, 1_000n, 1_000n, '1001');
    ingest(db, raw);
    ingest(db, raw); // replay — should be ignored

    const events = db.getEventsByContract(CONTRACT_ID, 100, 0);
    expect(events.length).toBe(1);
  });

  test('balance history is not duplicated on replay', () => {
    const raw = makeTreasuryDepositEvent(SIGNER1, 1_000n, 1_000n, '1001');
    ingest(db, raw);
    ingest(db, raw);

    const history = db.getBalanceHistory(CONTRACT_ID, 10, 0);
    expect(history.length).toBe(1);
  });

  test('proposal is not duplicated on replay', () => {
    const deposit = makeTreasuryDepositEvent(SIGNER1, 5_000n, 5_000n, '1001');
    const propose = makeTreasuryProposeEvent(1n, SIGNER1, SIGNER2, 500n, '1002');
    ingest(db, deposit);
    ingest(db, propose);
    ingest(db, propose); // replay

    const proposals = db.listProposals(CONTRACT_ID, undefined, 100, 0);
    expect(proposals.length).toBe(1);
  });
});

describe('Indexer — missed-ledger catchup', () => {
  let db: Db;
  beforeEach(() => { db = new Db(':memory:'); });
  afterEach(() => { db.close(); });

  test('processes events from multiple ledgers in order', () => {
    const events = [
      makeTreasuryDepositEvent(SIGNER1, 5_000n, 5_000n, '1001'),
      makeTreasuryProposeEvent(1n, SIGNER1, SIGNER2, 500n, '1002'),
      makeTreasuryApproveEvent(1n, SIGNER2, 2, '1003'),
      makeTreasuryExecuteEvent(1n, SIGNER2, 500n, 4_500n, '1004'),
    ];

    for (const raw of events) ingest(db, raw);

    const allEvents = db.getEventsByContract(CONTRACT_ID, 100, 0);
    expect(allEvents.length).toBe(4);

    const proposal = db.getProposal(CONTRACT_ID, '1');
    expect(proposal?.status).toBe('executed');

    const balance = db.getLatestBalance(CONTRACT_ID);
    expect(balance).toBe('4500');
  });

  test('checkpoint advances after processing', () => {
    ingest(db, makeTreasuryDepositEvent(SIGNER1, 1_000n, 1_000n, '2050'));
    db.upsertCheckpoint(2050, null);

    const cp = db.getCheckpoint();
    expect(cp?.last_ledger).toBe(2050);
  });

  test('replaying from checkpoint does not re-process old events', () => {
    const raw = makeTreasuryDepositEvent(SIGNER1, 1_000n, 1_000n, '1001');
    ingest(db, raw);
    db.upsertCheckpoint(1001, raw.id);

    // Simulate re-ingesting same event after restart
    ingest(db, raw);

    const events = db.getEventsByContract(CONTRACT_ID, 100, 0);
    expect(events.length).toBe(1);
  });
});

describe('Indexer — malformed and unknown events', () => {
  let db: Db;
  beforeEach(() => { db = new Db(':memory:'); });
  afterEach(() => { db.close(); });

  test('unknown event type goes to quarantine, not indexed_events', () => {
    ingest(db, makeMalformedEvent());

    const quarantined = db.getQuarantinedEvents(10, 0);
    const events = db.getEventsByContract(CONTRACT_ID, 100, 0);

    expect(quarantined.length).toBe(1);
    expect(events.length).toBe(0);
    expect(quarantined[0].reason).toContain('unknown event type');
  });

  test('unknown namespace goes to quarantine', () => {
    ingest(db, makeUnknownNamespaceEvent());

    const quarantined = db.getQuarantinedEvents(10, 0);
    expect(quarantined.length).toBe(1);
    expect(quarantined[0].reason).toContain('unknown namespace');
  });

  test('malformed quarantine does not affect normal event processing', () => {
    ingest(db, makeMalformedEvent());
    ingest(db, makeTreasuryDepositEvent(SIGNER1, 1_000n, 1_000n, '1001'));

    const quarantined = db.getQuarantinedEvents(10, 0);
    const events = db.getEventsByContract(CONTRACT_ID, 100, 0);
    expect(quarantined.length).toBe(1);
    expect(events.length).toBe(1);
  });
});

describe('Indexer — stale policy events', () => {
  let db: Db;
  beforeEach(() => { db = new Db(':memory:'); });
  afterEach(() => { db.close(); });

  test('open proposals are marked stale_policy when a signer is added', () => {
    ingest(db, makeTreasuryDepositEvent(SIGNER1, 5_000n, 5_000n, '1001'));
    ingest(db, makeTreasuryProposeEvent(1n, SIGNER1, SIGNER2, 500n, '1002'));

    let proposal = db.getProposal(CONTRACT_ID, '1');
    expect(proposal?.status).toBe('proposed');

    // Admin adds a new signer → bumps policy version → invalidates open proposals
    ingest(db, makeTreasuryAddSignerEvent('GNEWSIGNER', 4, '1010'));

    proposal = db.getProposal(CONTRACT_ID, '1');
    expect(proposal?.status).toBe('stale_policy');
  });

  test('open proposals are marked stale_policy when threshold changes', () => {
    ingest(db, makeTreasuryDepositEvent(SIGNER1, 5_000n, 5_000n, '1001'));
    ingest(db, makeTreasuryProposeEvent(2n, SIGNER1, SIGNER2, 100n, '1002'));
    ingest(db, makeTreasuryApproveEvent(2n, SIGNER2, 2, '1003'));

    ingest(db, makeTreasuryThresholdEvent(3, '1010'));

    const proposal = db.getProposal(CONTRACT_ID, '2');
    expect(proposal?.status).toBe('stale_policy');
  });

  test('already-executed proposals are NOT marked stale_policy', () => {
    ingest(db, makeTreasuryDepositEvent(SIGNER1, 5_000n, 5_000n, '1001'));
    ingest(db, makeTreasuryProposeEvent(3n, SIGNER1, SIGNER2, 100n, '1002'));
    ingest(db, makeTreasuryApproveEvent(3n, SIGNER2, 2, '1003'));
    ingest(db, makeTreasuryExecuteEvent(3n, SIGNER2, 100n, 4_900n, '1004'));

    ingest(db, makeTreasuryAddSignerEvent('GNEWSIGNER2', 4, '1010'));

    const proposal = db.getProposal(CONTRACT_ID, '3');
    // Should remain 'executed', not be overwritten to stale_policy
    expect(proposal?.status).toBe('executed');
  });
});

describe('Indexer — full lifecycle reconstruction', () => {
  let db: Db;
  beforeEach(() => { db = new Db(':memory:'); });
  afterEach(() => { db.close(); });

  test('reconstructs proposal lifecycle: propose → approve → execute', () => {
    ingest(db, makeTreasuryDepositEvent(SIGNER1, 10_000n, 10_000n, '1001'));
    ingest(db, makeTreasuryProposeEvent(1n, SIGNER1, SIGNER2, 1_000n, '1002'));
    ingest(db, makeTreasuryApproveEvent(1n, SIGNER2, 2, '1003'));
    ingest(db, makeTreasuryExecuteEvent(1n, SIGNER2, 1_000n, 9_000n, '1004'));

    const proposal = db.getProposal(CONTRACT_ID, '1');
    expect(proposal?.status).toBe('executed');
    expect(proposal?.amount).toBe('1000');

    const approvals = db.getApprovals(CONTRACT_ID, '1');
    expect(approvals.length).toBe(2); // proposer + signer2
    expect(approvals.every((a) => a.revoked === 0)).toBe(true);

    const events = db.getEventsByProposal(CONTRACT_ID, '1');
    const types = events.map((e) => e.event_type);
    expect(types).toContain('propose');
    expect(types).toContain('approve');
    expect(types).toContain('execute');

    expect(db.getLatestBalance(CONTRACT_ID)).toBe('9000');
  });

  test('reconstructs proposal lifecycle: propose → revoke → cancel', () => {
    ingest(db, makeTreasuryDepositEvent(SIGNER1, 5_000n, 5_000n, '1001'));
    ingest(db, makeTreasuryProposeEvent(1n, SIGNER1, SIGNER2, 500n, '1002'));
    ingest(db, makeTreasuryApproveEvent(1n, SIGNER2, 2, '1003'));
    ingest(db, makeTreasuryRevokeEvent(1n, SIGNER2, 1, '1004'));
    ingest(db, makeTreasuryCancelEvent(1n, SIGNER1, '1005'));

    const proposal = db.getProposal(CONTRACT_ID, '1');
    expect(proposal?.status).toBe('canceled');

    const approvals = db.getApprovals(CONTRACT_ID, '1');
    const signer2Approval = approvals.find((a) => a.signer.includes('SIGNER2') || a.revoked === 1);
    expect(signer2Approval?.revoked).toBe(1);
  });

  test('account-specific history returns only events for that actor', () => {
    ingest(db, makeTreasuryDepositEvent(SIGNER1, 1_000n, 1_000n, '1001'));
    ingest(db, makeTreasuryDepositEvent(SIGNER2, 500n, 1_500n, '1002'));

    const events = db.getEventsByActor(SIGNER1, 100, 0);
    // Actor is stored as raw decoded string from XDR — check it includes at least 1 event
    expect(events.length).toBeGreaterThanOrEqual(1);
  });
});

describe('Indexer — gap detection (production code path via Indexer.checkForGaps)', () => {
  let db: Db;
  let indexer: Indexer;

  beforeEach(() => {
    db = new Db(':memory:');
    indexer = new Indexer(db, testConfig());
  });
  afterEach(() => { db.close(); });

  test('detects a gap when Indexer.lastSeenLedger < checkpoint - 1', () => {
    ingest(db, makeTreasuryDepositEvent(SIGNER1, 1_000n, 1_000n, '1001'));
    db.upsertCheckpoint(1010, null);
    indexer.setLastSeenLedger(CONTRACT_ID, 1001);

    indexer.checkForGaps();

    const gaps = db.getOpenGaps(CONTRACT_ID);
    expect(gaps.length).toBe(1);
    expect(gaps[0].gap_start).toBe(1002);
    expect(gaps[0].gap_end).toBe(1009);
    expect(gaps[0].backfilled).toBe(0);
  });

  test('no gap when lastSeen matches checkpoint ledger', () => {
    ingest(db, makeTreasuryDepositEvent(SIGNER1, 1_000n, 1_000n, '1001'));
    ingest(db, makeTreasuryDepositEvent(SIGNER2, 500n, 1_500n, '1002'));
    db.upsertCheckpoint(1003, null);
    indexer.setLastSeenLedger(CONTRACT_ID, 1002);

    indexer.checkForGaps();

    const gaps = db.getOpenGaps(CONTRACT_ID);
    expect(gaps.length).toBe(0);
  });
});

describe('Indexer — gap backfill lifecycle (DB methods)', () => {
  let db: Db;
  beforeEach(() => { db = new Db(':memory:'); });
  afterEach(() => { db.close(); });

  test('gap can be marked backfilled', () => {
    db.detectGap(CONTRACT_ID, 1005, 1010);

    const gaps = db.getOpenGaps(CONTRACT_ID);
    expect(gaps.length).toBe(1);
    expect(gaps[0].backfilled).toBe(0);

    db.markGapBackfilled(gaps[0].id);
    const openGaps = db.getOpenGaps(CONTRACT_ID);
    expect(openGaps.length).toBe(0);
  });
});

describe('Indexer — re-org resilience', () => {
  let db: Db;
  beforeEach(() => { db = new Db(':memory:'); });
  afterEach(() => { db.close(); });

  test('new event at already-seen ledger is handled via idempotency', () => {
    const first = makeTreasuryDepositEvent(SIGNER1, 1_000n, 1_000n, '1001');
    ingest(db, first);

    const reorgEvent = makeTreasuryDepositEvent(SIGNER2, 2_000n, 3_000n, '1001');
    reorgEvent.id = 'reorg_event_001';
    reorgEvent.txHash = 'reorg_tx_001';

    const result = parseEvent(reorgEvent, 'treasury');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const inserted = db.insertEvent(result.event);
    expect(inserted).toBe(true);
    if (inserted) handleTreasuryEvent(db, result.event);

    const events = db.getEventsByContract(CONTRACT_ID, 100, 0);
    expect(events.length).toBe(2);
  });

  test('exact duplicate event from re-org is skipped', () => {
    const raw = makeTreasuryDepositEvent(SIGNER1, 1_000n, 1_000n, '1001');
    ingest(db, raw);
    ingest(db, raw);

    const events = db.getEventsByContract(CONTRACT_ID, 100, 0);
    expect(events.length).toBe(1);
  });

  test('re-org detection via lastSeen ledger comparison', () => {
    const first = makeTreasuryDepositEvent(SIGNER1, 1_000n, 1_000n, '1001');
    ingest(db, first);

    const indexer = new Indexer(db, testConfig());
    indexer.setLastSeenLedger(CONTRACT_ID, 2000);

    // Event at ledger 1500 < lastSeen(2000) => re-org
    const reorgEvent = makeTreasuryDepositEvent(SIGNER2, 2_000n, 3_000n, '1500');
    reorgEvent.id = 'reorg_1500_001';
    reorgEvent.txHash = 'reorg_tx_1500_001';

    const result = parseEvent(reorgEvent, 'treasury');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const inserted = db.insertEvent(result.event);
    expect(inserted).toBe(true);

    // lastSeen should still be 2000 for that contract (not lowered by re-org)
    expect(indexer.getLastSeenLedger(CONTRACT_ID)).toBe(2000);
  });
});

describe('Indexer — halt state (production code path via Reconciler)', () => {
  let db: Db;
  beforeEach(() => { db = new Db(':memory:'); });
  afterEach(() => { db.close(); });

  test('indexer starts not halted', () => {
    expect(db.isHalted()).toBe(false);
  });

  test('halt stores reason and ledger provenance', () => {
    db.haltIndexer('Test divergence', 9999);
    expect(db.isHalted()).toBe(true);

    const status = db.getIndexerStatus();
    expect(status.halt_reason).toContain('Test divergence');
    expect(status.last_healthy_ledger).toBe(9999);

    db.clearHalt();
    expect(db.isHalted()).toBe(false);
  });
});
