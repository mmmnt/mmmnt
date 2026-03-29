export interface EventMetadata {
  readonly eventId: string;
  readonly eventType: string;
  readonly timestamp: string;
  readonly actor: string;
  readonly source: string;
  readonly causationId: string;
  readonly correlationId: string;
  readonly version: number;
  readonly commitRef: string;
}
