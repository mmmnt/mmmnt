import type { DriftPoint } from './drift-point.js';

export interface DriftReport {
  readonly scope: string;
  readonly driftPoints: readonly DriftPoint[];
  readonly totalDrifted: number;
  readonly totalAligned: number;
  readonly timestamp: string;
}
