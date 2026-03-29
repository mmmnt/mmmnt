/**
 * ReconciliationState Aggregate
 *
 * Persisted to: .domain/reconciliation-state.jsonl
 * Event signals: .complai/events/moment/
 */

import type { CascadeCategory, CascadeClassification } from '../value-objects/index.js';
import type { ReconciliationResult } from '../value-objects/index.js';
import type {
  ReconciliationStateEvent,
  UpstreamFingerprint,
  UpstreamDriftDetected,
  ReconciliationStarted,
  ReconciliationCompleted,
} from '../events/reconciliation-state-events.js';

/**
 * Classify cascade category per PADR-009 rules.
 *
 * Category 1: Deterministic re-projection (added element, no references exist)
 * Category 2: Structural drift (modified element, references may be stale)
 * Category 3: Breaking change (removed element, dangling references)
 */
function classifyCascade(category: CascadeCategory): CascadeClassification {
  switch (category) {
    case 1:
      return {
        category: 1,
        description: 'Deterministic re-projection',
        requiredActions: ['Re-run projection against existing source files'],
      };
    case 2:
      return {
        category: 2,
        description: 'Structural drift detected',
        requiredActions: ['Review affected temporal flows', 'Update stale references'],
      };
    case 3:
      return {
        category: 3,
        description: 'Breaking change',
        requiredActions: ['Resolve dangling references', 'Update or remove affected flows'],
      };
  }
}

export interface DetectUpstreamDriftInput {
  readonly currentFingerprint: UpstreamFingerprint;
  readonly previousFingerprint: UpstreamFingerprint;
  readonly cascadeCategory: CascadeCategory;
}

export interface StartReconciliationInput {
  readonly reconciliationId: string;
  readonly mode: 'local' | 'event';
  readonly driftSummary: string;
}

export interface CompleteReconciliationInput {
  readonly reconciliationId: string;
  readonly result: ReconciliationResult;
}

export class ReconciliationState {
  private lastFingerprint: UpstreamFingerprint | null = null;
  private activeReconciliationId: string | null = null;
  private driftDetected = false;

  /**
   * Compare current vs previous fingerprints. No-diff = no event.
   */
  detectUpstreamDrift(input: DetectUpstreamDriftInput): UpstreamDriftDetected | null {
    if (input.currentFingerprint.contentHash === input.previousFingerprint.contentHash) {
      return null;
    }

    const event: UpstreamDriftDetected = {
      type: 'UpstreamDriftDetected',
      previousFingerprint: input.previousFingerprint,
      currentFingerprint: input.currentFingerprint,
      cascadeClassification: classifyCascade(input.cascadeCategory),
      timestamp: new Date().toISOString(),
    };

    this.apply(event);
    return event;
  }

  /**
   * RS-01: Start a reconciliation. Only one active at a time.
   */
  startReconciliation(input: StartReconciliationInput): ReconciliationStarted {
    if (this.activeReconciliationId !== null) {
      throw new Error(
        `RS-01: Cannot start reconciliation '${input.reconciliationId}' — ` +
          `reconciliation '${this.activeReconciliationId}' is already active`,
      );
    }

    if (!this.driftDetected) {
      throw new Error(
        `Cannot start reconciliation '${input.reconciliationId}' — no upstream drift detected`,
      );
    }

    const event: ReconciliationStarted = {
      type: 'ReconciliationStarted',
      reconciliationId: input.reconciliationId,
      mode: input.mode,
      driftSummary: input.driftSummary,
      timestamp: new Date().toISOString(),
    };

    this.apply(event);
    return event;
  }

  /**
   * Complete a reconciliation. Requires active reconciliation with matching id.
   */
  completeReconciliation(input: CompleteReconciliationInput): ReconciliationCompleted {
    if (this.activeReconciliationId === null) {
      throw new Error(
        `Cannot complete reconciliation '${input.reconciliationId}' — no active reconciliation`,
      );
    }

    if (this.activeReconciliationId !== input.reconciliationId) {
      throw new Error(
        `Cannot complete reconciliation '${input.reconciliationId}' — ` +
          `active reconciliation is '${this.activeReconciliationId}'`,
      );
    }

    const event: ReconciliationCompleted = {
      type: 'ReconciliationCompleted',
      reconciliationId: input.reconciliationId,
      result: input.result,
      timestamp: new Date().toISOString(),
    };

    this.apply(event);
    return event;
  }

  /**
   * Apply a domain event to update internal state (event sourcing replay).
   * Enforces all invariants during replay to detect corrupted streams.
   */
  apply(event: ReconciliationStateEvent): void {
    switch (event.type) {
      case 'UpstreamDriftDetected':
        this.lastFingerprint = event.currentFingerprint;
        this.driftDetected = true;
        break;

      case 'ReconciliationStarted':
        if (this.activeReconciliationId !== null) {
          throw new Error(
            `RS-01: Duplicate active reconciliation '${event.reconciliationId}' in event stream`,
          );
        }
        this.activeReconciliationId = event.reconciliationId;
        break;

      case 'ReconciliationCompleted':
        if (this.activeReconciliationId !== event.reconciliationId) {
          throw new Error(
            `Cannot complete reconciliation '${event.reconciliationId}' — ` +
              `active reconciliation is '${this.activeReconciliationId}'`,
          );
        }
        this.activeReconciliationId = null;
        this.driftDetected = false;
        break;

      default: {
        const exhaustive: never = event;
        throw new Error(`Unknown event type '${(exhaustive as { type: string }).type}'`);
      }
    }
  }

  getLastFingerprint(): UpstreamFingerprint | null {
    return this.lastFingerprint;
  }

  getActiveReconciliationId(): string | null {
    return this.activeReconciliationId;
  }

  isDriftDetected(): boolean {
    return this.driftDetected;
  }
}
