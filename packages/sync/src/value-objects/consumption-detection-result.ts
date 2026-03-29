import type { DetectedConsumption } from './detected-consumption.js';

export interface ConsumptionDetectionResult {
  readonly detectedConsumptions: readonly DetectedConsumption[];
  readonly unresolvableReferences: readonly string[];
}
