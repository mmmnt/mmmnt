import type { FeedbackEventType } from './feedback-event-type.js';
import type { SourceAttribution } from './source-attribution.js';

export interface EventMetadata {
  readonly eventId: string;
  readonly eventType: FeedbackEventType;
  readonly timestamp: string;
  readonly actor: string;
  readonly source: SourceAttribution;
  readonly causationId: string;
  readonly correlationId: string;
  readonly version: number;
  readonly commitRef: string;
}
