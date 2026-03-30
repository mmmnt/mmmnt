import type { ConsumptionManifestEvent } from '../events/consumption-manifest-events.js';

export interface ConsumptionManifestRecord {
  readonly event: ConsumptionManifestEvent;
  readonly appendedAt: string;
  readonly version: number;
}
