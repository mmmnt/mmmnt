import { describe, it, expect } from 'vitest';
import { ReconciliationState } from './reconciliation-state.js';
import type { UpstreamFingerprint } from '../events/reconciliation-state-events.js';
import type { ReconciliationResult } from '../value-objects/index.js';

function makeFingerprint(overrides: Partial<UpstreamFingerprint> = {}): UpstreamFingerprint {
  return {
    specificationId: 'spec_abc123',
    contentHash: 'sha256:aaa',
    recordedAt: '2026-03-16T10:30:00Z',
    ...overrides,
  };
}

function makeResult(overrides: Partial<ReconciliationResult> = {}): ReconciliationResult {
  return {
    filesUpdated: ['flow-a.moment'],
    conflictsResolved: 0,
    cascadeCategory: 1,
    ...overrides,
  };
}

describe('ReconciliationState', () => {
  // --- DetectUpstreamDrift ---

  it('emits UpstreamDriftDetected when fingerprints differ', () => {
    const state = new ReconciliationState();
    const prev = makeFingerprint({ contentHash: 'sha256:aaa' });
    const curr = makeFingerprint({ contentHash: 'sha256:bbb' });

    const event = state.detectUpstreamDrift({
      currentFingerprint: curr,
      previousFingerprint: prev,
      cascadeCategory: 2,
    });

    expect(event).not.toBeNull();
    expect(event!.type).toBe('UpstreamDriftDetected');
    expect(event!.previousFingerprint).toEqual(prev);
    expect(event!.currentFingerprint).toEqual(curr);
  });

  it('returns null when fingerprints are identical (no-diff = no event)', () => {
    const state = new ReconciliationState();
    const fp = makeFingerprint({ contentHash: 'sha256:same' });

    const event = state.detectUpstreamDrift({
      currentFingerprint: fp,
      previousFingerprint: fp,
      cascadeCategory: 1,
    });

    expect(event).toBeNull();
  });

  it('classifies cascade category 1 as deterministic re-projection', () => {
    const state = new ReconciliationState();
    const event = state.detectUpstreamDrift({
      currentFingerprint: makeFingerprint({ contentHash: 'sha256:new' }),
      previousFingerprint: makeFingerprint({ contentHash: 'sha256:old' }),
      cascadeCategory: 1,
    });

    expect(event!.cascadeClassification.category).toBe(1);
    expect(event!.cascadeClassification.description).toBe('Deterministic re-projection');
  });

  it('classifies cascade category 2 as structural drift', () => {
    const state = new ReconciliationState();
    const event = state.detectUpstreamDrift({
      currentFingerprint: makeFingerprint({ contentHash: 'sha256:new' }),
      previousFingerprint: makeFingerprint({ contentHash: 'sha256:old' }),
      cascadeCategory: 2,
    });

    expect(event!.cascadeClassification.category).toBe(2);
    expect(event!.cascadeClassification.description).toBe('Structural drift detected');
  });

  it('classifies cascade category 3 as breaking change', () => {
    const state = new ReconciliationState();
    const event = state.detectUpstreamDrift({
      currentFingerprint: makeFingerprint({ contentHash: 'sha256:new' }),
      previousFingerprint: makeFingerprint({ contentHash: 'sha256:old' }),
      cascadeCategory: 3,
    });

    expect(event!.cascadeClassification.category).toBe(3);
    expect(event!.cascadeClassification.description).toBe('Breaking change');
  });

  // --- RS-01: Only one active reconciliation at a time ---

  it('RS-01: allows starting a reconciliation after drift is detected', () => {
    const state = new ReconciliationState();
    state.detectUpstreamDrift({
      currentFingerprint: makeFingerprint({ contentHash: 'sha256:new' }),
      previousFingerprint: makeFingerprint({ contentHash: 'sha256:old' }),
      cascadeCategory: 1,
    });

    const event = state.startReconciliation({
      reconciliationId: 'recon-1',
      mode: 'local',
      driftSummary: '1 element modified',
    });

    expect(event.type).toBe('ReconciliationStarted');
    expect(event.reconciliationId).toBe('recon-1');
    expect(event.mode).toBe('local');
  });

  it('RS-01: rejects second StartReconciliation while one is active', () => {
    const state = new ReconciliationState();
    state.detectUpstreamDrift({
      currentFingerprint: makeFingerprint({ contentHash: 'sha256:new' }),
      previousFingerprint: makeFingerprint({ contentHash: 'sha256:old' }),
      cascadeCategory: 2,
    });

    state.startReconciliation({
      reconciliationId: 'recon-1',
      mode: 'local',
      driftSummary: 'drift',
    });

    expect(() =>
      state.startReconciliation({
        reconciliationId: 'recon-2',
        mode: 'event',
        driftSummary: 'more drift',
      }),
    ).toThrow('RS-01');
  });

  it('rejects StartReconciliation when no drift has been detected', () => {
    const state = new ReconciliationState();

    expect(() =>
      state.startReconciliation({
        reconciliationId: 'recon-1',
        mode: 'local',
        driftSummary: 'drift',
      }),
    ).toThrow('no upstream drift detected');
  });

  // --- CompleteReconciliation ---

  it('completes an active reconciliation and clears drift state', () => {
    const state = new ReconciliationState();
    state.detectUpstreamDrift({
      currentFingerprint: makeFingerprint({ contentHash: 'sha256:new' }),
      previousFingerprint: makeFingerprint({ contentHash: 'sha256:old' }),
      cascadeCategory: 1,
    });

    state.startReconciliation({
      reconciliationId: 'recon-1',
      mode: 'local',
      driftSummary: 'drift',
    });

    const event = state.completeReconciliation({
      reconciliationId: 'recon-1',
      result: makeResult(),
    });

    expect(event.type).toBe('ReconciliationCompleted');
    expect(event.reconciliationId).toBe('recon-1');
    expect(state.getActiveReconciliationId()).toBeNull();
    expect(state.isDriftDetected()).toBe(false);
  });

  it('rejects CompleteReconciliation with no active reconciliation', () => {
    const state = new ReconciliationState();

    expect(() =>
      state.completeReconciliation({
        reconciliationId: 'recon-1',
        result: makeResult(),
      }),
    ).toThrow('no active reconciliation');
  });

  it('rejects CompleteReconciliation with mismatched reconciliationId', () => {
    const state = new ReconciliationState();
    state.detectUpstreamDrift({
      currentFingerprint: makeFingerprint({ contentHash: 'sha256:new' }),
      previousFingerprint: makeFingerprint({ contentHash: 'sha256:old' }),
      cascadeCategory: 1,
    });
    state.startReconciliation({
      reconciliationId: 'recon-1',
      mode: 'local',
      driftSummary: 'drift',
    });

    expect(() =>
      state.completeReconciliation({
        reconciliationId: 'recon-wrong',
        result: makeResult(),
      }),
    ).toThrow("active reconciliation is 'recon-1'");
  });

  // --- RS-02: Cascade category follows PADR-009 rules ---

  it('RS-02: all three cascade categories produce valid classifications', () => {
    for (const category of [1, 2, 3] as const) {
      const state = new ReconciliationState();
      const event = state.detectUpstreamDrift({
        currentFingerprint: makeFingerprint({ contentHash: `sha256:v${category}` }),
        previousFingerprint: makeFingerprint({ contentHash: 'sha256:old' }),
        cascadeCategory: category,
      });

      expect(event!.cascadeClassification.category).toBe(category);
      expect(event!.cascadeClassification.description).toBeTruthy();
      expect(event!.cascadeClassification.requiredActions.length).toBeGreaterThan(0);
    }
  });

  // --- Replay invariant enforcement ---

  it('rejects ReconciliationStarted replay without preceding UpstreamDriftDetected', () => {
    const state = new ReconciliationState();

    expect(() =>
      state.apply({
        type: 'ReconciliationStarted',
        reconciliationId: 'recon-1',
        mode: 'local',
        driftSummary: 'drift',
        timestamp: new Date().toISOString(),
      }),
    ).toThrow('without preceding UpstreamDriftDetected');
  });

  // --- Event sourcing replay ---

  it('replays events correctly to rebuild state', () => {
    const state1 = new ReconciliationState();
    const prev = makeFingerprint({ contentHash: 'sha256:old' });
    const curr = makeFingerprint({ contentHash: 'sha256:new' });

    const e1 = state1.detectUpstreamDrift({
      currentFingerprint: curr,
      previousFingerprint: prev,
      cascadeCategory: 2,
    })!;
    const e2 = state1.startReconciliation({
      reconciliationId: 'recon-1',
      mode: 'event',
      driftSummary: '2 elements changed',
    });
    const e3 = state1.completeReconciliation({
      reconciliationId: 'recon-1',
      result: makeResult({ cascadeCategory: 2 }),
    });

    // Replay into fresh aggregate
    const state2 = new ReconciliationState();
    state2.apply(e1);
    state2.apply(e2);
    state2.apply(e3);

    expect(state2.getActiveReconciliationId()).toBeNull();
    expect(state2.isDriftDetected()).toBe(false);
    expect(state2.getLastFingerprint()).toEqual(curr);
  });

  it('allows a new reconciliation cycle after completing the previous one', () => {
    const state = new ReconciliationState();

    // First cycle
    state.detectUpstreamDrift({
      currentFingerprint: makeFingerprint({ contentHash: 'sha256:v1' }),
      previousFingerprint: makeFingerprint({ contentHash: 'sha256:v0' }),
      cascadeCategory: 1,
    });
    state.startReconciliation({
      reconciliationId: 'recon-1',
      mode: 'local',
      driftSummary: 'drift 1',
    });
    state.completeReconciliation({
      reconciliationId: 'recon-1',
      result: makeResult(),
    });

    // Second cycle — detect new drift and start again
    state.detectUpstreamDrift({
      currentFingerprint: makeFingerprint({ contentHash: 'sha256:v2' }),
      previousFingerprint: makeFingerprint({ contentHash: 'sha256:v1' }),
      cascadeCategory: 3,
    });

    const event = state.startReconciliation({
      reconciliationId: 'recon-2',
      mode: 'event',
      driftSummary: 'drift 2',
    });

    expect(event.reconciliationId).toBe('recon-2');
    expect(state.getActiveReconciliationId()).toBe('recon-2');
  });

  it('updates lastFingerprint on each drift detection', () => {
    const state = new ReconciliationState();

    expect(state.getLastFingerprint()).toBeNull();

    const fp1 = makeFingerprint({ contentHash: 'sha256:first' });
    state.detectUpstreamDrift({
      currentFingerprint: fp1,
      previousFingerprint: makeFingerprint({ contentHash: 'sha256:old' }),
      cascadeCategory: 1,
    });

    expect(state.getLastFingerprint()).toEqual(fp1);
  });
});
