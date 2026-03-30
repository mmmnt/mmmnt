import { describe, it, expect } from 'vitest';
import { ReconciliationState } from '../../aggregates/reconciliation-state.js';
import type {
  UpstreamFingerprint,
  ReconciliationStateEvent,
} from '../../events/reconciliation-state-events.js';

const FIXED_RECORDED_AT = '2026-01-01T00:00:00.000Z';

function makeFingerprint(overrides?: Partial<UpstreamFingerprint>): UpstreamFingerprint {
  return {
    specificationId: 'moment-spec',
    contentHash: 'abc123',
    recordedAt: FIXED_RECORDED_AT,
    ...overrides,
  };
}

describe('Upstream Drift Reconciliation E2E', () => {
  it('full cycle: detect drift, start reconciliation, complete with cascade classification', () => {
    const state = new ReconciliationState();

    const previous = makeFingerprint({ contentHash: 'old-hash' });
    const current = makeFingerprint({ contentHash: 'new-hash' });

    // Step 1: Detect upstream drift (fingerprint mismatch)
    const driftEvent = state.detectUpstreamDrift({
      currentFingerprint: current,
      previousFingerprint: previous,
      cascadeCategory: 2,
    });

    expect(driftEvent).not.toBeNull();
    expect(driftEvent!.type).toBe('UpstreamDriftDetected');
    expect(driftEvent!.cascadeClassification.category).toBe(2);
    expect(driftEvent!.cascadeClassification.description).toBeTruthy();
    expect(driftEvent!.cascadeClassification.requiredActions.length).toBeGreaterThan(0);
    expect(state.isDriftDetected()).toBe(true);

    // Step 2: Start reconciliation
    const startEvent = state.startReconciliation({
      reconciliationId: 'recon-001',
      mode: 'local',
      driftSummary: 'Specification changed: 2 contexts modified',
    });

    expect(startEvent.type).toBe('ReconciliationStarted');
    expect(startEvent.reconciliationId).toBe('recon-001');
    expect(startEvent.mode).toBe('local');
    expect(state.getActiveReconciliationId()).toBe('recon-001');

    // Step 3: Complete reconciliation
    const completeEvent = state.completeReconciliation({
      reconciliationId: 'recon-001',
      result: {
        filesUpdated: ['src/contexts/ordering.ts', 'src/contexts/shipping.ts'],
        conflictsResolved: 1,
        cascadeCategory: 2,
      },
    });

    expect(completeEvent.type).toBe('ReconciliationCompleted');
    expect(completeEvent.result.filesUpdated).toHaveLength(2);
    expect(completeEvent.result.cascadeCategory).toBe(2);
    expect(state.getActiveReconciliationId()).toBeNull();
    expect(state.isDriftDetected()).toBe(false);
  });

  it('no-drift scenario: matching fingerprints produce no event', () => {
    const state = new ReconciliationState();

    const fingerprint = makeFingerprint({ contentHash: 'same-hash' });

    const result = state.detectUpstreamDrift({
      currentFingerprint: fingerprint,
      previousFingerprint: fingerprint,
      cascadeCategory: 1,
    });

    expect(result).toBeNull();
    expect(state.isDriftDetected()).toBe(false);
    expect(state.getActiveReconciliationId()).toBeNull();
  });

  it('RS-01: concurrent reconciliation rejected', () => {
    const state = new ReconciliationState();

    const previous = makeFingerprint({ contentHash: 'old' });
    const current = makeFingerprint({ contentHash: 'new' });

    // Detect drift and start first reconciliation
    state.detectUpstreamDrift({
      currentFingerprint: current,
      previousFingerprint: previous,
      cascadeCategory: 3,
    });

    state.startReconciliation({
      reconciliationId: 'recon-001',
      mode: 'local',
      driftSummary: 'First reconciliation',
    });

    // Attempt to start a second reconciliation while first is active — RS-01
    expect(() =>
      state.startReconciliation({
        reconciliationId: 'recon-002',
        mode: 'event',
        driftSummary: 'Second reconciliation',
      }),
    ).toThrow('RS-01');

    // First reconciliation is still active
    expect(state.getActiveReconciliationId()).toBe('recon-001');
  });

  it('event replay reconstitutes full reconciliation state', () => {
    const state1 = new ReconciliationState();

    const previous = makeFingerprint({ contentHash: 'v1' });
    const current = makeFingerprint({ contentHash: 'v2' });

    // Execute full lifecycle
    const e1 = state1.detectUpstreamDrift({
      currentFingerprint: current,
      previousFingerprint: previous,
      cascadeCategory: 1,
    });
    expect(e1).not.toBeNull();

    const e2 = state1.startReconciliation({
      reconciliationId: 'recon-replay',
      mode: 'local',
      driftSummary: 'Replay test',
    });

    const e3 = state1.completeReconciliation({
      reconciliationId: 'recon-replay',
      result: {
        filesUpdated: ['src/updated.ts'],
        conflictsResolved: 0,
        cascadeCategory: 1,
      },
    });

    // Replay all events into a fresh state
    const state2 = new ReconciliationState();
    const events: ReconciliationStateEvent[] = [e1!, e2, e3];
    for (const event of events) {
      state2.apply(event);
    }

    // Replayed state should match original
    expect(state2.getActiveReconciliationId()).toBeNull();
    expect(state2.isDriftDetected()).toBe(false);
    expect(state2.getLastFingerprint()).toEqual(current);
  });
});
