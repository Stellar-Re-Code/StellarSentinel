import type { Db } from '../../db/client';
import type { ParsedEvent } from '../../types/events';

// Governance events are fully captured by the raw indexed_events table.
// This handler is a hook for any future derived-state tables (e.g. gov_proposals).
export function handleGovernanceEvent(_db: Db, _event: ParsedEvent): void {
  // All governance audit data is available via indexed_events queries.
  // Extend here to maintain a gov_proposals derived table if needed.
}
