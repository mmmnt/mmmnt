import type { ImplementationFeedbackRecorded } from './implementation-feedback-journal.js';

export interface ImplementationFeedbackRecord {
  readonly event: ImplementationFeedbackRecorded;
  /**
   * Time at which this record was appended to the underlying log/store.
   * Distinct from `event.metadata.timestamp`, which represents the domain event time.
   */
  readonly appendedAt: string;
  readonly version: number;
}
