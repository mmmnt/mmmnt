import type { SyncStateEvent } from '../events/sync-state-events.js';

export interface SyncStateRecord {
  readonly event: SyncStateEvent;
  /**
   * Time at which this record was appended to the underlying log/store.
   * Distinct from `event.timestamp`, which represents the domain event time.
   */
  readonly appendedAt: string;
  readonly version: number;
}
