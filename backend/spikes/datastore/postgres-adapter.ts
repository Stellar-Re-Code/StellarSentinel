/**
 * SPIKE prototype (throwaway) — see docs/SPIKE-datastore.md.
 *
 * A SKELETON of the Postgres adapter. It deliberately pulls in NO `pg`
 * dependency so the spike carries no runtime cost; every method throws
 * `SpikeNotImplemented`. Its value is documentary: it shows the target shape
 * and — critically — the async BEGIN/COMMIT/ROLLBACK transaction pattern the
 * async seam unlocks, plus the SQL-dialect deltas from SQLite.
 */
import type { DataStore } from './datastore';
import type { CheckpointRow } from '../../src/types/models';
import type { ParsedEvent } from '../../src/types/events';

export class SpikeNotImplemented extends Error {
  constructor(method: string) {
    super(`PostgresDataStore.${method} is a spike skeleton — see docs/SPIKE-datastore.md`);
    this.name = 'SpikeNotImplemented';
  }
}

export class PostgresDataStore implements DataStore {
  // Real implementation would hold a pool:
  //   constructor(private readonly pool: import('pg').Pool) {}

  async close(): Promise<void> {
    // await this.pool.end();
    throw new SpikeNotImplemented('close');
  }

  async getCheckpoint(): Promise<CheckpointRow | null> {
    // const { rows } = await this.pool.query(
    //   'SELECT * FROM checkpoints WHERE id = 1');
    // return rows[0] ?? null;
    throw new SpikeNotImplemented('getCheckpoint');
  }

  async upsertCheckpoint(_lastLedger: number, _lastEventId: string | null): Promise<void> {
    // SQLite `datetime('now')` -> Postgres `now()`; `ON CONFLICT ... DO UPDATE`
    // is portable as-is.
    //   INSERT INTO checkpoints (id, last_ledger, last_event_id, updated_at)
    //   VALUES (1, $1, $2, now())
    //   ON CONFLICT (id) DO UPDATE SET
    //     last_ledger = EXCLUDED.last_ledger,
    //     last_event_id = EXCLUDED.last_event_id,
    //     updated_at = EXCLUDED.updated_at
    throw new SpikeNotImplemented('upsertCheckpoint');
  }

  async insertEvent(_event: ParsedEvent): Promise<boolean> {
    // SQLite `INSERT OR IGNORE` + `result.changes > 0`
    //   -> Postgres `INSERT ... ON CONFLICT (event_id) DO NOTHING RETURNING id`
    //      then `rowCount > 0`.
    throw new SpikeNotImplemented('insertEvent');
  }

  async eventExists(_eventId: string): Promise<boolean> {
    throw new SpikeNotImplemented('eventExists');
  }

  /**
   * The payoff of an async seam: a genuine transaction that spans awaits.
   *
   *   const client = await this.pool.connect();
   *   try {
   *     await client.query('BEGIN');
   *     const result = await fn();          // may await freely
   *     await client.query('COMMIT');
   *     return result;
   *   } catch (err) {
   *     await client.query('ROLLBACK');
   *     throw err;
   *   } finally {
   *     client.release();
   *   }
   *
   * (A real implementation threads `client` into the per-call queries, e.g. via
   * AsyncLocalStorage, so writes inside `fn` run on the transacting connection.)
   */
  async transaction<T>(_fn: () => Promise<T>): Promise<T> {
    throw new SpikeNotImplemented('transaction');
  }
}
