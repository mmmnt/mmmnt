import { describe, it, expect } from 'vitest';
import { PushFlowSaga } from '../../sagas/push-flow-saga.js';

describe('PushFlowSaga', () => {
  // 1. Starts in Idle state
  it('starts in Idle state', () => {
    const saga = new PushFlowSaga();
    expect(saga.getState()).toBe('Idle');
  });

  // 2. start() transitions Idle -> Diffing
  it('start() transitions Idle -> Diffing', () => {
    const saga = new PushFlowSaga();
    const event = saga.start();
    expect(saga.getState()).toBe('Diffing');
    expect(event.type).toBe('PushFlowStarted');
  });

  // 3. proposalsGenerated() transitions Diffing -> Proposing
  it('proposalsGenerated() transitions Diffing -> Proposing', () => {
    const saga = new PushFlowSaga();
    saga.start();
    const event = saga.proposalsGenerated(3);
    expect(saga.getState()).toBe('Proposing');
    expect(event.proposalCount).toBe(3);
  });

  // 4. proposalsGenerated(0) transitions Diffing -> Complete
  it('proposalsGenerated(0) transitions Diffing -> Complete', () => {
    const saga = new PushFlowSaga();
    saga.start();
    saga.proposalsGenerated(0);
    expect(saga.getState()).toBe('Complete');
  });

  // 5. confirmationComplete() transitions Proposing -> Recording
  it('confirmationComplete() transitions Proposing -> Recording', () => {
    const saga = new PushFlowSaga();
    saga.start();
    saga.proposalsGenerated(5);
    const event = saga.confirmationComplete(3, 1, 1);
    expect(saga.getState()).toBe('Recording');
    expect(event.acceptedCount).toBe(3);
    expect(event.rejectedCount).toBe(1);
    expect(event.skippedCount).toBe(1);
  });

  // 6. recordingComplete() transitions Recording -> Committing
  it('recordingComplete() transitions Recording -> Committing', () => {
    const saga = new PushFlowSaga();
    saga.start();
    saga.proposalsGenerated(2);
    saga.confirmationComplete(2, 0, 0);
    const event = saga.recordingComplete(2);
    expect(saga.getState()).toBe('Committing');
    expect(event.recordedCount).toBe(2);
  });

  // 7. complete() transitions Committing -> Complete
  it('complete() transitions Committing -> Complete', () => {
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

  // 8. abort() transitions any non-terminal state -> Aborted
  it('abort() transitions any non-terminal state -> Aborted', () => {
    const states = ['Idle', 'Diffing', 'Proposing', 'Recording', 'Committing'] as const;
    const builders: Record<string, () => PushFlowSaga> = {
      Idle: () => new PushFlowSaga(),
      Diffing: () => {
        const s = new PushFlowSaga();
        s.start();
        return s;
      },
      Proposing: () => {
        const s = new PushFlowSaga();
        s.start();
        s.proposalsGenerated(1);
        return s;
      },
      Recording: () => {
        const s = new PushFlowSaga();
        s.start();
        s.proposalsGenerated(1);
        s.confirmationComplete(1, 0, 0);
        return s;
      },
      Committing: () => {
        const s = new PushFlowSaga();
        s.start();
        s.proposalsGenerated(1);
        s.confirmationComplete(1, 0, 0);
        s.recordingComplete(1);
        return s;
      },
    };

    for (const st of states) {
      const saga = builders[st]();
      expect(saga.getState()).toBe(st);
      const event = saga.abort('testing');
      expect(saga.getState()).toBe('Aborted');
      expect(event.reason).toBe('testing');
    }
  });

  // 9. Invalid transition rejected
  it('rejects invalid transitions', () => {
    const saga = new PushFlowSaga();
    expect(() => saga.recordingComplete(1)).toThrow(/Invalid transition/);
    expect(() => saga.complete()).toThrow(/Invalid transition/);
    expect(() => saga.proposalsGenerated(1)).toThrow(/Invalid transition/);
  });

  // 10. IS-03: canAdvanceCursor() false before complete()
  it('IS-03: canAdvanceCursor() is false before complete()', () => {
    const saga = new PushFlowSaga();
    expect(saga.canAdvanceCursor()).toBe(false);
    saga.start();
    expect(saga.canAdvanceCursor()).toBe(false);
    saga.proposalsGenerated(1);
    expect(saga.canAdvanceCursor()).toBe(false);
    saga.confirmationComplete(1, 0, 0);
    expect(saga.canAdvanceCursor()).toBe(false);
    saga.recordingComplete(1);
    expect(saga.canAdvanceCursor()).toBe(false);
    saga.committed('ref-1');
    expect(saga.canAdvanceCursor()).toBe(false);
  });

  // 11. IS-03: canAdvanceCursor() true after complete()
  it('IS-03: canAdvanceCursor() is true after complete()', () => {
    const saga = new PushFlowSaga();
    saga.start();
    saga.proposalsGenerated(1);
    saga.confirmationComplete(1, 0, 0);
    saga.recordingComplete(1);
    saga.committed('ref-1');
    saga.complete();
    expect(saga.canAdvanceCursor()).toBe(true);
  });

  // 12. IS-03: canAdvanceCursor() false if aborted
  it('IS-03: canAdvanceCursor() is false if aborted', () => {
    const saga = new PushFlowSaga();
    saga.start();
    saga.proposalsGenerated(1);
    saga.abort('user cancelled');
    expect(saga.canAdvanceCursor()).toBe(false);
  });

  // 13. IS-04: recordedCount matches acceptedCount
  it('IS-04: recordedCount matches acceptedCount from confirmation', () => {
    const saga = new PushFlowSaga();
    saga.start();
    saga.proposalsGenerated(5);
    saga.confirmationComplete(3, 1, 1);
    const recordingEvent = saga.recordingComplete(3);
    expect(recordingEvent.recordedCount).toBe(3);

    const events = saga.getEvents();
    const confirmation = events.find((e) => e.type === 'PushFlowConfirmationComplete');
    expect(confirmation).toBeDefined();
    if (confirmation && confirmation.type === 'PushFlowConfirmationComplete') {
      expect(recordingEvent.recordedCount).toBe(confirmation.acceptedCount);
    }
  });

  // 14. All saga events accumulated in order
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

  // 15. Each event has correct sagaId
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

  // 16. abort() throws on terminal states
  it('abort() throws on terminal state Complete', () => {
    const saga = new PushFlowSaga();
    saga.start();
    saga.proposalsGenerated(0);
    expect(saga.getState()).toBe('Complete');
    expect(() => saga.abort('too late')).toThrow(/terminal state/);
  });

  it('abort() throws on terminal state Aborted', () => {
    const saga = new PushFlowSaga();
    saga.start();
    saga.abort('once');
    expect(() => saga.abort('twice')).toThrow(/terminal state/);
  });
});
