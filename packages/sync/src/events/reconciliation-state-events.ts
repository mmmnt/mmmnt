import type { CascadeClassification } from '../value-objects/index.js';
import type { ReconciliationResult } from '../value-objects/index.js';

export interface UpstreamFingerprint {
  readonly specificationId: string;
  readonly contentHash: string;
  readonly recordedAt: string;
}

export interface UpstreamDriftDetected {
  readonly type: 'UpstreamDriftDetected';
  readonly previousFingerprint: UpstreamFingerprint;
  readonly currentFingerprint: UpstreamFingerprint;
  readonly cascadeClassification: CascadeClassification;
  readonly timestamp: string;
}

export interface ReconciliationStarted {
  readonly type: 'ReconciliationStarted';
  readonly reconciliationId: string;
  readonly mode: 'local' | 'event';
  readonly driftSummary: string;
  readonly timestamp: string;
}

export interface ReconciliationCompleted {
  readonly type: 'ReconciliationCompleted';
  readonly reconciliationId: string;
  readonly result: ReconciliationResult;
  readonly timestamp: string;
}

export type ReconciliationStateEvent =
  | UpstreamDriftDetected
  | ReconciliationStarted
  | ReconciliationCompleted;
