import { describe, it, expect } from 'vitest';
import { ASTDiffEngine } from '../../services/ast-diff-engine.js';
import { SyncState } from '../../aggregates/sync-state.js';
import { ImplementationFeedbackJournal } from '../../aggregates/implementation-feedback-journal.js';
import { PushFlowSaga } from '../../sagas/push-flow-saga.js';
import type {
  ImplementationChangeProposal,
  SourceAttribution,
  SyncCursor,
} from '../../value-objects/index.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const EXPECTED_SOURCE = `export interface Order { readonly id: string; readonly amount: number; }`;

const ACTUAL_SOURCE = `export interface Order { readonly id: string; readonly amount: string; readonly notes: string; }`;

const FILE_PATH = 'order.ts';

const VALID_SOURCE: SourceAttribution = { source: 'mmmnt:implementation-feedback' };

function buildExpectedMap(source: string = EXPECTED_SOURCE): ReadonlyMap<string, string> {
  return new Map([[FILE_PATH, source]]);
}

function buildActualMap(source: string = ACTUAL_SOURCE): ReadonlyMap<string, string> {
  return new Map([[FILE_PATH, source]]);
}

function recordAndAcceptProposals(
  syncState: SyncState,
  proposals: readonly ImplementationChangeProposal[],
): void {
  for (const proposal of proposals) {
    syncState.recordProposal(proposal);
    syncState.acceptProposal(proposal.proposalId);
  }
}

function recordFeedbackForAccepted(
  journal: ImplementationFeedbackJournal,
  proposals: readonly ImplementationChangeProposal[],
  correlationId: string,
): void {
  for (const proposal of proposals) {
    journal.recordImplementationFeedback({
      feedbackEventType: proposal.proposedEventType,
      payload: proposal.proposedPayload,
      source: VALID_SOURCE,
      causationId: proposal.proposalId,
      correlationId,
      actor: 'test-actor',
      commitRef: 'abc123',
    });
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Full sync cycle integration', () => {
  // -------------------------------------------------------------------------
  // 1. Full cycle: detect drift -> proposals -> accept -> record -> complete
  // -------------------------------------------------------------------------
  it('full cycle: detect drift -> proposals -> accept -> record -> complete', () => {
    const engine = new ASTDiffEngine();
    const syncState = new SyncState();
    const journal = new ImplementationFeedbackJournal(syncState);
    const saga = new PushFlowSaga();

    // Step 1: Start saga
    saga.start();
    expect(saga.getState()).toBe('Diffing');

    // Step 2: Detect drift
    const driftReport = engine.detectDrift({
      expected: buildExpectedMap(),
      actual: buildActualMap(),
    });
    expect(driftReport.driftPoints.length).toBeGreaterThan(0);
    expect(driftReport.totalDrifted).toBeGreaterThan(0);

    // Step 3: Generate proposals
    const proposals = engine.generateProposals({
      expected: buildExpectedMap(),
      actual: buildActualMap(),
    });
    expect(proposals.length).toBeGreaterThan(0);

    saga.proposalsGenerated(proposals.length);
    expect(saga.getState()).toBe('Proposing');

    // Step 4: Record and accept proposals in SyncState
    recordAndAcceptProposals(syncState, proposals);

    for (const proposal of proposals) {
      expect(syncState.getProposalStatus(proposal.proposalId)).toBe('accepted');
    }

    saga.confirmationComplete(proposals.length, 0, 0);
    expect(saga.getState()).toBe('Recording');

    // Step 5: Record feedback in journal
    const correlationId = saga.getSagaId();
    recordFeedbackForAccepted(journal, proposals, correlationId);

    saga.recordingComplete(proposals.length);
    expect(saga.getState()).toBe('Committing');

    // Step 6: Commit and complete
    saga.committed('integration-test-ref');
    saga.complete();
    expect(saga.getState()).toBe('Complete');

    // Verify final state
    expect(saga.canAdvanceCursor()).toBe(true);
    expect(journal.getEntryCount()).toBe(proposals.length);
    expect(journal.getEntries().length).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // 2. No drift produces no proposals and saga completes immediately
  // -------------------------------------------------------------------------
  it('no drift produces no proposals and saga completes immediately', () => {
    const engine = new ASTDiffEngine();
    const saga = new PushFlowSaga();

    const identicalSource = EXPECTED_SOURCE;

    // Detect drift with identical sources
    const driftReport = engine.detectDrift({
      expected: buildExpectedMap(identicalSource),
      actual: buildActualMap(identicalSource),
    });
    expect(driftReport.driftPoints).toHaveLength(0);
    expect(driftReport.totalDrifted).toBe(0);

    // Generate proposals — should be empty
    const proposals = engine.generateProposals({
      expected: buildExpectedMap(identicalSource),
      actual: buildActualMap(identicalSource),
    });
    expect(proposals).toHaveLength(0);

    // Saga zero-proposal shortcut
    saga.start();
    saga.proposalsGenerated(0);
    expect(saga.getState()).toBe('Complete');
  });

  // -------------------------------------------------------------------------
  // 3. IS-04 end-to-end: accepted proposals match recorded feedback events
  // -------------------------------------------------------------------------
  it('IS-04 end-to-end: accepted proposals match recorded feedback events', () => {
    const engine = new ASTDiffEngine();
    const syncState = new SyncState();
    const journal = new ImplementationFeedbackJournal(syncState);

    const proposals = engine.generateProposals({
      expected: buildExpectedMap(),
      actual: buildActualMap(),
    });
    expect(proposals.length).toBeGreaterThanOrEqual(2);

    // Accept all proposals
    recordAndAcceptProposals(syncState, proposals);

    // Record feedback for each accepted proposal
    recordFeedbackForAccepted(journal, proposals, 'correlation-is04');

    // IS-04: the number of recorded feedback events must match accepted proposals
    expect(journal.getEntryCount()).toBe(proposals.length);

    // Verify each entry has matching metadata
    const entries = journal.getEntries();
    for (let i = 0; i < proposals.length; i++) {
      expect(entries[i].metadata.causationId).toBe(proposals[i].proposalId);
      expect(entries[i].metadata.eventType).toBe(proposals[i].proposedEventType);
    }
  });

  // -------------------------------------------------------------------------
  // 4. IS-01 end-to-end: proposals never modify spec directly
  // -------------------------------------------------------------------------
  it('IS-01 end-to-end: proposals never modify spec directly', () => {
    const engine = new ASTDiffEngine();

    const proposals = engine.generateProposals({
      expected: buildExpectedMap(),
      actual: buildActualMap(),
    });
    expect(proposals.length).toBeGreaterThan(0);

    // Every proposal must contain a proposedEventType (suggesting an update via
    // event, not a direct mutation). This is the IS-01 invariant: proposals
    // suggest domain events rather than directly modifying the specification.
    for (const proposal of proposals) {
      expect(proposal.proposedEventType).toBeDefined();
      expect(typeof proposal.proposedEventType).toBe('string');
      expect(proposal.proposedEventType.length).toBeGreaterThan(0);

      // Verify the proposal carries structured payload, not raw source mutations
      expect(proposal.proposedPayload).toBeDefined();
      expect(typeof proposal.proposedPayload).toBe('object');
    }
  });

  // -------------------------------------------------------------------------
  // 5. SyncState cursor advanced after successful complete
  // -------------------------------------------------------------------------
  it('SyncState cursor advanced after successful complete', () => {
    const engine = new ASTDiffEngine();
    const syncState = new SyncState();
    const journal = new ImplementationFeedbackJournal(syncState);
    const saga = new PushFlowSaga();

    // Run full cycle
    saga.start();

    const proposals = engine.generateProposals({
      expected: buildExpectedMap(),
      actual: buildActualMap(),
    });
    saga.proposalsGenerated(proposals.length);
    recordAndAcceptProposals(syncState, proposals);
    saga.confirmationComplete(proposals.length, 0, 0);

    recordFeedbackForAccepted(journal, proposals, saga.getSagaId());
    saga.recordingComplete(proposals.length);

    saga.committed('cursor-test-ref');
    saga.complete();

    expect(saga.canAdvanceCursor()).toBe(true);

    // Advance cursor
    const cursor: SyncCursor = {
      specificationHash: 'sha256-abc',
      timestamp: new Date().toISOString(),
    };
    syncState.advanceCursor(cursor);
    expect(syncState.getCursor()).toEqual(cursor);

    // Verify cursor moved forward — a second advance with a later timestamp succeeds
    const laterCursor: SyncCursor = {
      specificationHash: 'sha256-def',
      timestamp: new Date(Date.now() + 1000).toISOString(),
    };
    syncState.advanceCursor(laterCursor);
    expect(syncState.getCursor()).toEqual(laterCursor);
  });

  // -------------------------------------------------------------------------
  // 6. Saga abort path: drift found but all proposals rejected
  // -------------------------------------------------------------------------
  it('saga abort path: drift found but all proposals rejected', () => {
    const engine = new ASTDiffEngine();
    const syncState = new SyncState();
    const saga = new PushFlowSaga();

    saga.start();

    const driftReport = engine.detectDrift({
      expected: buildExpectedMap(),
      actual: buildActualMap(),
    });
    expect(driftReport.driftPoints.length).toBeGreaterThan(0);

    const proposals = engine.generateProposals({
      expected: buildExpectedMap(),
      actual: buildActualMap(),
    });
    expect(proposals.length).toBeGreaterThan(0);

    saga.proposalsGenerated(proposals.length);

    // Record proposals in SyncState, then reject all
    for (const proposal of proposals) {
      syncState.recordProposal(proposal);
      syncState.rejectProposal(proposal.proposalId, 'Not applicable');
    }

    for (const proposal of proposals) {
      expect(syncState.getProposalStatus(proposal.proposalId)).toBe('rejected');
    }

    // Abort the saga since all proposals were rejected
    saga.abort('All proposals rejected');
    expect(saga.getState()).toBe('Aborted');
    expect(saga.canAdvanceCursor()).toBe(false);
  });

  // -------------------------------------------------------------------------
  // 7. Journal rejects invalid source attribution (IFJ-01)
  // -------------------------------------------------------------------------
  it('journal rejects invalid source attribution (IFJ-01)', () => {
    const engine = new ASTDiffEngine();
    const syncState = new SyncState();
    const journal = new ImplementationFeedbackJournal(syncState);

    const proposals = engine.generateProposals({
      expected: buildExpectedMap(),
      actual: buildActualMap(),
    });
    expect(proposals.length).toBeGreaterThan(0);

    // Accept the first proposal so causation is valid
    const proposal = proposals[0];
    syncState.recordProposal(proposal);
    syncState.acceptProposal(proposal.proposalId);

    // Attempt to record with an invalid source attribution
    const invalidSource: SourceAttribution = { source: 'invalid:source' };

    expect(() =>
      journal.recordImplementationFeedback({
        feedbackEventType: proposal.proposedEventType,
        payload: proposal.proposedPayload,
        source: invalidSource,
        causationId: proposal.proposalId,
        correlationId: 'correlation-ifj01',
        actor: 'test-actor',
        commitRef: 'abc123',
      }),
    ).toThrow('IFJ-01');
  });
});
