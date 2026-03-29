import type { DriftDirection } from './drift-direction.js';

export interface DriftPoint {
  readonly filePath: string;
  readonly aggregateName: string;
  readonly contextName: string;
  readonly driftType: DriftDirection;
  readonly description: string;
  readonly suggestedEvent?: string;
}
