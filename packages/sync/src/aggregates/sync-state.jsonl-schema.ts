import type { SyncStateEvent } from '../events/sync-state-events.js';

export interface SyncStateRecord {
  readonly event: SyncStateEvent;
  readonly timestamp: string;
  readonly version: number;
}
