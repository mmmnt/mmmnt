import type { PushFlowEvent } from './push-flow-saga.js';

export interface PushFlowRecord {
  readonly event: PushFlowEvent;
  /**
   * Time at which this record was appended to the underlying log/store.
   * Distinct from `event.timestamp`, which represents the domain event time.
   */
  readonly appendedAt: string;
  readonly version: number;
}
