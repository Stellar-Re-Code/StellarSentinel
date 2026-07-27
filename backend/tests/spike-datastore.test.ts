/**
 * SPIKE prototype test (throwaway) — see docs/SPIKE-datastore.md.
 *
 * Proves the recommended path: the existing synchronous `Db` satisfies the
 * async `DataStore` seam via `SqliteDataStore`, with no schema changes.
 */
import { Db } from '../src/db/client';
import { SqliteDataStore } from '../spikes/datastore/sqlite-adapter';
import { PostgresDataStore, SpikeNotImplemented } from '../spikes/datastore/postgres-adapter';
import type { DataStore } from '../spikes/datastore/datastore';
import type { ParsedEvent } from '../src/types/events';

function makeEvent(id: string, ledger = 1000): ParsedEvent {
  return {
    rawId: id,
    ledger,
    ledgerTimestamp: '2026-01-01T00:00:00Z',
    txHash: `tx_${id}`,
    contractId: 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA',
    contractType: 'treasury',
    eventType: 'deposit',
    schemaVersion: 1,
    actor: 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN',
    asset: null,
    amount: '1000',
    proposalId: null,
    lifecycleStatus: 'deposited',
    policyVersion: null,
    rawValue: { from: 'GAAZ', amount: '1000' },
  };
}

describe('SPIKE: DataStore seam (SqliteDataStore over in-memory Db)', () => {
  it('the existing Db satisfies the async DataStore interface', async () => {
    const store: DataStore = new SqliteDataStore(new Db(':memory:'));

    expect(await store.getCheckpoint()).toBeNull();

    await store.upsertCheckpoint(42, 'evt-1');
    const cp = await store.getCheckpoint();
    expect(cp?.last_ledger).toBe(42);
    expect(cp?.last_event_id).toBe('evt-1');

    await store.close();
  });

  it('insertEvent is idempotent through the async seam', async () => {
    const store = SqliteDataStore.open(':memory:');
    const ev = makeEvent('e1');

    expect(await store.eventExists('e1')).toBe(false);
    expect(await store.insertEvent(ev)).toBe(true);   // first insert
    expect(await store.insertEvent(ev)).toBe(false);  // duplicate ignored
    expect(await store.eventExists('e1')).toBe(true);

    await store.close();
  });

  it('transaction() runs the unit of work and returns its value', async () => {
    const store = SqliteDataStore.open(':memory:');

    const inserted = await store.transaction(async () => {
      await store.insertEvent(makeEvent('t1', 2000));
      await store.upsertCheckpoint(2000, 't1');
      return true;
    });

    expect(inserted).toBe(true);
    expect(await store.eventExists('t1')).toBe(true);
    expect((await store.getCheckpoint())?.last_ledger).toBe(2000);

    await store.close();
  });

  it('PostgresDataStore is a declared-but-unimplemented skeleton', async () => {
    const pg: DataStore = new PostgresDataStore();
    await expect(pg.getCheckpoint()).rejects.toBeInstanceOf(SpikeNotImplemented);
  });
});
