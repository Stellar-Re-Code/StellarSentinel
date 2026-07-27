/**
 * SPIKE prototype (throwaway) — see docs/SPIKE-datastore.md.
 *
 * An *async* seam that both the current SQLite implementation and a future
 * Postgres implementation can satisfy. This is a representative SUBSET of the
 * real `Db` surface — enough to demonstrate the shape, not the whole API.
 *
 * The key design decision: every method returns a Promise from day one, even
 * though the SQLite backing is synchronous. That is what lets a `pg`-backed
 * adapter drop in later without a second, codebase-wide sync -> async refactor.
 */
import type { CheckpointRow } from '../../src/types/models';
import type { ParsedEvent } from '../../src/types/events';

export interface DataStore {
  /** Release any underlying handles/pools. */
  close(): Promise<void>;

  // ─── Durable cursor ───────────────────────────────────────────────────────
  getCheckpoint(): Promise<CheckpointRow | null>;
  upsertCheckpoint(lastLedger: number, lastEventId: string | null): Promise<void>;

  // ─── Indexed events ───────────────────────────────────────────────────────
  /** Returns true if a new row was inserted, false if it already existed (idempotent). */
  insertEvent(event: ParsedEvent): Promise<boolean>;
  eventExists(eventId: string): Promise<boolean>;

  /**
   * Run `fn` as a single unit of work. Must accept an async callback — this is
   * the contract that better-sqlite3's synchronous transaction cannot honour
   * across an `await`, and the reason the SQLite adapter degrades (see
   * sqlite-adapter.ts). A Postgres adapter implements this with a pooled client
   * running BEGIN / COMMIT / ROLLBACK.
   */
  transaction<T>(fn: () => Promise<T>): Promise<T>;
}
