import type { ReconciliationStateEvent } from '../events/reconciliation-state-events.js';

export interface ReconciliationStateRecord {
  readonly event: ReconciliationStateEvent;
  /**
   * Time at which this record was appended to the underlying log/store.
   * Distinct from `event.timestamp`, which represents the domain event time.
   */
  readonly appendedAt: string;
  readonly version: number;
}
