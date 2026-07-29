/**
 * SPIKE prototype (throwaway) — see docs/SPIKE-datastore.md.
 *
 * Wraps the existing synchronous `Db` behind the async `DataStore` seam,
 * proving the current implementation conforms with zero schema changes.
 */
import { Db } from '../../src/db/client';
import type { DataStore } from './datastore';
import type { CheckpointRow } from '../../src/types/models';
import type { ParsedEvent } from '../../src/types/events';

export class SqliteDataStore implements DataStore {
  constructor(private readonly db: Db) {}

  /** Convenience constructor mirroring `new Db(path)`. */
  static open(dbPath: string): SqliteDataStore {
    return new SqliteDataStore(new Db(dbPath));
  }

  async close(): Promise<void> {
    this.db.close();
  }

  async getCheckpoint(): Promise<CheckpointRow | null> {
    return this.db.getCheckpoint();
  }

  async upsertCheckpoint(lastLedger: number, lastEventId: string | null): Promise<void> {
    this.db.upsertCheckpoint(lastLedger, lastEventId);
  }

  async insertEvent(event: ParsedEvent): Promise<boolean> {
    return this.db.insertEvent(event);
  }

  async eventExists(eventId: string): Promise<boolean> {
    return this.db.eventExists(eventId);
  }

  /**
   * HONEST WRINKLE (the crux of the abstraction gap in the spike doc):
   * better-sqlite3's transaction is synchronous and CANNOT stay open across an
   * `await`. So an async `transaction()` seam cannot be backed by a real
   * better-sqlite3 transaction whenever `fn` awaits.
   *
   * For the current indexer this is acceptable because the only async work in a
   * batch (RPC calls) already happens OUTSIDE the DB transaction — the writes
   * inside are synchronous. If `fn` performs only synchronous `db.*` writes,
   * they still succeed; they simply are not wrapped in a single SQLite tx here.
   * A Postgres adapter (see postgres-adapter.ts) restores true async
   * transactionality. This limitation is exactly why the spike recommends
   * Postgres *when topology forces multi-process writes*, not before.
   */
  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    return fn();
  }
}
