import { parseEvent } from '../src/indexer/parser';
import {
  makeTreasuryDepositEvent, makeTreasuryProposeEvent, makeTreasuryApproveEvent,
  makeTreasuryExecuteEvent, makeTreasuryCancelEvent, makeTreasuryRevokeEvent,
  makeTreasuryThresholdEvent, makeMalformedEvent, makeUnknownNamespaceEvent,
  makeTreasuryInitEvent, makeTreasuryAddSignerEvent,
  ADMIN, SIGNER1, SIGNER2, ASSET, CONTRACT_ID,
} from './fixtures';

describe('parseEvent — treasury events', () => {
  test('parses init event', () => {
    const raw = makeTreasuryInitEvent();
    const result = parseEvent(raw, 'treasury');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.event.eventType).toBe('init');
    expect(result.event.lifecycleStatus).toBe('initialized');
    expect(result.event.contractType).toBe('treasury');
    expect(result.event.schemaVersion).toBe(1);
  });

  test('parses deposit event', () => {
    const raw = makeTreasuryDepositEvent(SIGNER1, 1_000_000n, 1_000_000n);
    const result = parseEvent(raw, 'treasury');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.event.eventType).toBe('deposit');
    expect(result.event.lifecycleStatus).toBe('deposited');
    expect(result.event.amount).toBe('1000000');
    expect(result.event.actor).toBeTruthy();
  });

  test('parses propose event — extracts proposalId, actor, amount', () => {
    const raw = makeTreasuryProposeEvent(1n, SIGNER1, SIGNER2, 500_000n);
    const result = parseEvent(raw, 'treasury');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.event.eventType).toBe('propose');
    expect(result.event.lifecycleStatus).toBe('proposed');
    expect(result.event.proposalId).toBe('1');
    expect(result.event.amount).toBe('500000');
  });

  test('parses approve event', () => {
    const raw = makeTreasuryApproveEvent(1n, SIGNER2, 2);
    const result = parseEvent(raw, 'treasury');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.event.eventType).toBe('approve');
    expect(result.event.lifecycleStatus).toBe('approved');
    expect(result.event.proposalId).toBe('1');
  });

  test('parses execute event', () => {
    const raw = makeTreasuryExecuteEvent(1n, SIGNER2, 500_000n, 500_000n);
    const result = parseEvent(raw, 'treasury');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.event.eventType).toBe('execute');
    expect(result.event.lifecycleStatus).toBe('executed');
    expect(result.event.amount).toBe('500000');
  });

  test('parses cancel event', () => {
    const raw = makeTreasuryCancelEvent(1n, ADMIN);
    const result = parseEvent(raw, 'treasury');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.event.eventType).toBe('cancel');
    expect(result.event.lifecycleStatus).toBe('canceled');
  });

  test('parses revoke event', () => {
    const raw = makeTreasuryRevokeEvent(1n, SIGNER2, 1);
    const result = parseEvent(raw, 'treasury');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.event.eventType).toBe('revoke');
    expect(result.event.lifecycleStatus).toBe('revoked');
  });

  test('parses thresh event (bare ScU32, not tuple)', () => {
    const raw = makeTreasuryThresholdEvent(2);
    const result = parseEvent(raw, 'treasury');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.event.eventType).toBe('thresh');
    expect(result.event.lifecycleStatus).toBe('threshold_changed');
  });

  test('parses add_sig event', () => {
    const raw = makeTreasuryAddSignerEvent(SIGNER2, 3);
    const result = parseEvent(raw, 'treasury');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.event.eventType).toBe('add_sig');
    expect(result.event.lifecycleStatus).toBe('signer_added');
  });
});

describe('parseEvent — quarantine cases', () => {
  test('quarantines unknown event type within known namespace', () => {
    const raw = makeMalformedEvent();
    const result = parseEvent(raw, 'treasury');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain('unknown event type');
  });

  test('quarantines unknown namespace', () => {
    const raw = makeUnknownNamespaceEvent();
    const result = parseEvent(raw, 'treasury');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain('unknown namespace');
  });

  test('quarantines event with too few topics', () => {
    const raw = makeTreasuryDepositEvent(SIGNER1, 100n, 100n);
    raw.topic = raw.topic.slice(0, 1); // only one topic
    const result = parseEvent(raw, 'treasury');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain('insufficient topics');
  });

  test('quarantines event with invalid XDR in value', () => {
    const raw = makeTreasuryDepositEvent(SIGNER1, 100n, 100n);
    raw.value = 'not-valid-base64-xdr!!';
    const result = parseEvent(raw, 'treasury');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain('parse error');
  });
});
