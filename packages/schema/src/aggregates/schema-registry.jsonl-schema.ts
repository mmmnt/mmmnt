import type { SchemaRegistryEvent } from '../events/schema-registry-events.js';

export interface SchemaRegistryRecord {
  readonly event: SchemaRegistryEvent;
  readonly appendedAt: string;
  readonly version: number;
}
