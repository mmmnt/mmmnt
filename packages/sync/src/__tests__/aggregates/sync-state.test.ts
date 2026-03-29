import { describe, it, expect } from 'vitest';
import { SyncState } from '../../aggregates/sync-state.js';
import type { ImplementationChangeProposal, SyncCursor } from '../../index.js';

function makeProposal(id = 'prop-001'): ImplementationChangeProposal {
  return {
    proposalId: id,
    proposedEventType: 'ValueObjectFieldAdded',
    proposedPayload: { fieldName: 'amount', fieldType: 'number' },
    sourceFile: 'src/order.ts',
    sourceDifference: {
      filePath: 'src/order.ts',
      differenceType: 'added-field',
      expectedNode: '',
      actualNode: 'amount: number',
    },
  };
}

function makeCursor(timestamp: string, hash = 'hash-1'): SyncCursor {
  return { specificationHash: hash, timestamp };
}

describe('SyncState', () => {
  // -----------------------------------------------------------------------
  // RecordProposal command
  // -----------------------------------------------------------------------

  describe('recordProposal', () => {
    it('records a new proposal and returns ProposalRecorded event', () => {
      const state = new SyncState();
      const event = state.recordProposal(makeProposal());

      expect(event.type).toBe('ProposalRecorded');
      expect(event.proposalId).toBe('prop-001');
      expect(event.proposal.proposedEventType).toBe('ValueObjectFieldAdded');
    });

    it('sets proposal status to pending', () => {
      const state = new SyncState();
      state.recordProposal(makeProposal());

      expect(state.getProposalStatus('prop-001')).toBe('pending');
    });

    it('SS-01: rejects duplicate proposalId', () => {
      const state = new SyncState();
      state.recordProposal(makeProposal('dup-001'));

      expect(() => state.recordProposal(makeProposal('dup-001'))).toThrow('SS-01');
    });
  });

  // -----------------------------------------------------------------------
  // AcceptProposal command
  // -----------------------------------------------------------------------

  describe('acceptProposal', () => {
    it('accepts a pending proposal and returns ProposalAccepted event', () => {
      const state = new SyncState();
      state.recordProposal(makeProposal());
      const event = state.acceptProposal('prop-001');

      expect(event.type).toBe('ProposalAccepted');
      expect(event.proposalId).toBe('prop-001');
      expect(state.getProposalStatus('prop-001')).toBe('accepted');
    });

    it('throws if proposal not found', () => {
      const state = new SyncState();
      expect(() => state.acceptProposal('nonexistent')).toThrow('not found');
    });

    it('SS-03: rejects if proposal is in terminal state (accepted)', () => {
      const state = new SyncState();
      state.recordProposal(makeProposal());
      state.acceptProposal('prop-001');

      expect(() => state.acceptProposal('prop-001')).toThrow('SS-03');
    });
  });

  // -----------------------------------------------------------------------
  // RejectProposal command
  // -----------------------------------------------------------------------

  describe('rejectProposal', () => {
    it('rejects a pending proposal and returns ProposalRejected event', () => {
      const state = new SyncState();
      state.recordProposal(makeProposal());
      const event = state.rejectProposal('prop-001', 'not needed');

      expect(event.type).toBe('ProposalRejected');
      expect(event.reason).toBe('not needed');
      expect(state.getProposalStatus('prop-001')).toBe('rejected');
    });

    it('SS-03: rejects if proposal is in terminal state (rejected)', () => {
      const state = new SyncState();
      state.recordProposal(makeProposal());
      state.rejectProposal('prop-001', 'first rejection');

      expect(() => state.rejectProposal('prop-001', 'again')).toThrow('SS-03');
    });
  });

  // -----------------------------------------------------------------------
  // SkipProposal command
  // -----------------------------------------------------------------------

  describe('skipProposal', () => {
    it('skips a pending proposal and returns ProposalSkipped event', () => {
      const state = new SyncState();
      state.recordProposal(makeProposal());
      const event = state.skipProposal('prop-001', 'deferred');

      expect(event.type).toBe('ProposalSkipped');
      expect(event.reason).toBe('deferred');
      expect(state.getProposalStatus('prop-001')).toBe('superseded');
    });

    it('SS-03: rejects if proposal is in terminal state (superseded)', () => {
      const state = new SyncState();
      state.recordProposal(makeProposal());
      state.skipProposal('prop-001', 'skip once');

      expect(() => state.skipProposal('prop-001', 'skip twice')).toThrow('SS-03');
    });
  });

  // -----------------------------------------------------------------------
  // AdvanceCursor command
  // -----------------------------------------------------------------------

  describe('advanceCursor', () => {
    it('advances the cursor and returns CursorAdvanced event', () => {
      const state = new SyncState();
      const event = state.advanceCursor(makeCursor('2026-01-01T00:00:00Z'));

      expect(event.type).toBe('CursorAdvanced');
      expect(event.cursor.specificationHash).toBe('hash-1');
      expect(state.getCursor()?.timestamp).toBe('2026-01-01T00:00:00Z');
    });

    it('SS-02: rejects cursor that does not advance', () => {
      const state = new SyncState();
      state.advanceCursor(makeCursor('2026-01-02T00:00:00Z'));

      expect(() => state.advanceCursor(makeCursor('2026-01-01T00:00:00Z'))).toThrow('SS-02');
    });

    it('SS-02: rejects cursor with equal timestamp', () => {
      const state = new SyncState();
      state.advanceCursor(makeCursor('2026-01-01T00:00:00Z'));

      expect(() => state.advanceCursor(makeCursor('2026-01-01T00:00:00Z', 'hash-2'))).toThrow(
        'SS-02',
      );
    });

    it('allows advancing with a later timestamp', () => {
      const state = new SyncState();
      state.advanceCursor(makeCursor('2026-01-01T00:00:00Z'));
      state.advanceCursor(makeCursor('2026-01-02T00:00:00Z'));

      expect(state.getCursor()?.timestamp).toBe('2026-01-02T00:00:00Z');
    });
  });

  // -----------------------------------------------------------------------
  // Event sourcing replay
  // -----------------------------------------------------------------------

  describe('apply (event sourcing)', () => {
    it('replays ProposalRecorded event', () => {
      const state = new SyncState();
      state.apply({
        type: 'ProposalRecorded',
        proposalId: 'p1',
        proposal: makeProposal('p1'),
        timestamp: '2026-01-01T00:00:00Z',
      });

      expect(state.getProposalStatus('p1')).toBe('pending');
    });

    it('replays full lifecycle: record → accept', () => {
      const state = new SyncState();
      state.apply({
        type: 'ProposalRecorded',
        proposalId: 'p1',
        proposal: makeProposal('p1'),
        timestamp: '2026-01-01T00:00:00Z',
      });
      state.apply({
        type: 'ProposalAccepted',
        proposalId: 'p1',
        timestamp: '2026-01-01T00:01:00Z',
      });

      expect(state.getProposalStatus('p1')).toBe('accepted');
    });
  });

  // -----------------------------------------------------------------------
  // Query methods
  // -----------------------------------------------------------------------

  describe('queries', () => {
    it('getProposalStatus returns undefined for unknown id', () => {
      const state = new SyncState();
      expect(state.getProposalStatus('nope')).toBeUndefined();
    });

    it('getCursor returns null initially', () => {
      const state = new SyncState();
      expect(state.getCursor()).toBeNull();
    });
  });
});
