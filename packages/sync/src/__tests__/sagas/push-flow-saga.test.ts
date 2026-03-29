import { describe, it, expect } from 'vitest';
import { PushFlowSaga } from '../../sagas/push-flow-saga.js';

describe('PushFlowSaga', () => {
  it('starts in Idle state', () => {
    const saga = new PushFlowSaga();
    expect(saga.getState()).toBe('Idle');
  });

  it('start() transitions Idle → Diffing', () => {
    const saga = new PushFlowSaga();
    const event = saga.start();
    expect(saga.getState()).toBe('Diffing');
    expect(event.type).toBe('PushFlowStarted');
  });

  it('proposalsGenerated() transitions Diffing → Proposing', () => {
    const saga = new PushFlowSaga();
    saga.start();
    const event = saga.proposalsGenerated(3);
    expect(saga.getState()).toBe('Proposing');
    expect(event.proposalCount).toBe(3);
  });

  it('proposalsGenerated(0) transitions Diffing → Complete with PushFlowCompleted event', () => {
    const saga = new PushFlowSaga();
    saga.start();
    saga.proposalsGenerated(0);
    expect(saga.getState()).toBe('Complete');

    // Should emit both ProposalsGenerated and Completed events
    const types = saga.getEvents().map((e) => e.type);
    expect(types).toContain('PushFlowProposalsGenerated');
    expect(types).toContain('PushFlowCompleted');
  });

  it('confirmationComplete() transitions Proposing → Recording', () => {
    const saga = new PushFlowSaga();
    saga.start();
    saga.proposalsGenerated(5);
    const event = saga.confirmationComplete(3, 1, 1);
    expect(saga.getState()).toBe('Recording');
    expect(event.acceptedCount).toBe(3);
  });

  it('recordingComplete() transitions Recording → Committing', () => {
    const saga = new PushFlowSaga();
    saga.start();
    saga.proposalsGenerated(2);
    saga.confirmationComplete(2, 0, 0);
    const event = saga.recordingComplete(2);
    expect(saga.getState()).toBe('Committing');
    expect(event.recordedCount).toBe(2);
  });

  it('complete() transitions Committing → Complete', () => {
    const saga = new PushFlowSaga();
    saga.start();
    saga.proposalsGenerated(1);
    saga.confirmationComplete(1, 0, 0);
    saga.recordingComplete(1);
    saga.committed('abc123');
    const event = saga.complete();
    expect(saga.getState()).toBe('Complete');
    expect(event.type).toBe('PushFlowCompleted');
  });

  it('abort() transitions any non-terminal state → Aborted', () => {
    // Test from multiple states
    for (const setup of [
      () => new PushFlowSaga(),
      () => {
        const s = new PushFlowSaga();
        s.start();
        return s;
      },
      () => {
        const s = new PushFlowSaga();
        s.start();
        s.proposalsGenerated(1);
        return s;
      },
      () => {
        const s = new PushFlowSaga();
        s.start();
        s.proposalsGenerated(1);
        s.confirmationComplete(1, 0, 0);
        return s;
      },
    ]) {
      const saga = setup();
      saga.abort('testing');
      expect(saga.getState()).toBe('Aborted');
    }
  });

  it('rejects invalid transitions', () => {
    const saga = new PushFlowSaga();
    expect(() => saga.recordingComplete(1)).toThrow();
    expect(() => saga.complete()).toThrow();
    expect(() => saga.proposalsGenerated(1)).toThrow();
  });

  it('IS-03: canAdvanceCursor() false before complete()', () => {
    const saga = new PushFlowSaga();
    expect(saga.canAdvanceCursor()).toBe(false);
    saga.start();
    expect(saga.canAdvanceCursor()).toBe(false);
    saga.proposalsGenerated(1);
    expect(saga.canAdvanceCursor()).toBe(false);
  });

  it('IS-03: canAdvanceCursor() true after complete()', () => {
    const saga = new PushFlowSaga();
    saga.start();
    saga.proposalsGenerated(1);
    saga.confirmationComplete(1, 0, 0);
    saga.recordingComplete(1);
    saga.committed('ref-1');
    saga.complete();
    expect(saga.canAdvanceCursor()).toBe(true);
  });

  it('IS-03: canAdvanceCursor() false if aborted', () => {
    const saga = new PushFlowSaga();
    saga.start();
    saga.abort('cancelled');
    expect(saga.canAdvanceCursor()).toBe(false);
  });

  it('IS-04: recordedCount must match acceptedCount', () => {
    const saga = new PushFlowSaga();
    saga.start();
    saga.proposalsGenerated(5);
    saga.confirmationComplete(3, 1, 1);
    saga.recordingComplete(3); // matches — should succeed
    expect(saga.getState()).toBe('Committing');
  });

  it('IS-04: throws if recordedCount does not match acceptedCount', () => {
    const saga = new PushFlowSaga();
    saga.start();
    saga.proposalsGenerated(5);
    saga.confirmationComplete(3, 1, 1);
    expect(() => saga.recordingComplete(4)).toThrow('IS-04');
  });

  it('accumulates all events in order', () => {
    const saga = new PushFlowSaga();
    saga.start();
    saga.proposalsGenerated(1);
    saga.confirmationComplete(1, 0, 0);
    saga.recordingComplete(1);
    saga.committed('abc');
    saga.complete();

    const types = saga.getEvents().map((e) => e.type);
    expect(types).toEqual([
      'PushFlowStarted',
      'PushFlowProposalsGenerated',
      'PushFlowConfirmationComplete',
      'PushFlowRecordingComplete',
      'PushFlowCommitted',
      'PushFlowCompleted',
    ]);
  });

  it('each event has the correct sagaId', () => {
    const saga = new PushFlowSaga('my-saga-id');
    saga.start();
    saga.proposalsGenerated(1);
    saga.confirmationComplete(1, 0, 0);
    saga.recordingComplete(1);
    saga.committed('ref');
    saga.complete();

    for (const event of saga.getEvents()) {
      expect(event.sagaId).toBe('my-saga-id');
    }
  });

  it('abort() throws on terminal state Complete', () => {
    const saga = new PushFlowSaga();
    saga.start();
    saga.proposalsGenerated(0);
    expect(() => saga.abort('too late')).toThrow(/terminal state/);
  });

  it('abort() throws on terminal state Aborted', () => {
    const saga = new PushFlowSaga();
    saga.start();
    saga.abort('once');
    expect(() => saga.abort('twice')).toThrow(/terminal state/);
  });

  it('apply() enforces state transitions during replay', () => {
    const saga = new PushFlowSaga('replay');
    // Apply out-of-order should throw
    expect(() =>
      saga.apply({
        type: 'PushFlowRecordingComplete',
        sagaId: 'replay',
        recordedCount: 1,
        timestamp: '2026-01-01T00:00:00Z',
      }),
    ).toThrow();
  });

  it('apply() rejects events after terminal state', () => {
    const saga = new PushFlowSaga('replay');
    saga.start();
    saga.proposalsGenerated(0); // goes to Complete
    expect(() =>
      saga.apply({
        type: 'PushFlowStarted',
        sagaId: 'replay',
        timestamp: '2026-01-01T00:00:00Z',
      }),
    ).toThrow(/terminal state/);
  });
});
