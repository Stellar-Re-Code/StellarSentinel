import type { Db } from '../../db/client';
import type { ParsedEvent } from '../../types/events';

export function handleVaultEvent(_db: Db, _event: ParsedEvent): void {
  // All vault audit data is available via indexed_events queries.
  // Extend here to maintain derived vault_locks / vault_vestings tables if needed.
}
