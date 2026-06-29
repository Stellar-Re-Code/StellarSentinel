import type { Db } from '../../db/client';
import type { ParsedEvent } from '../../types/events';

export function handleAclEvent(_db: Db, _event: ParsedEvent): void {
  // ACL audit data is available via indexed_events queries.
}
