import { describe, it, expect } from 'vitest';
import { SyncState } from '../../aggregates/sync-state.js';
import { ImplementationFeedbackJournal } from '../../aggregates/implementation-feedback-journal.js';
import { planDecision } from '../../services/sync-decision.js';
import type { SyncLogs } from '../../infrastructure/jsonl-sync-log-store.js';
import type { ImplementationChangeProposal } from '../../value-objects/index.js';

function makeProposal(id: string): ImplementationChangeProposal {
  return {
    proposalId: id,
    proposedEventType: 'ValueObjectFieldAdded',
    proposedPayload: { symbolName: 'Order' },
    sourceFile: 'src/order.ts',
    sourceDifference: {
      filePath: 'src/order.ts',
      differenceType: 'added-field',
      expectedNode: '',
      actualNode: `Order.${id}: string`,
    },
  };
}

function logsWith(...ids: string[]): SyncLogs {
  const syncState = new SyncState();
  for (const id of ids) syncState.recordProposal(makeProposal(id));
  return { syncState, journal: new ImplementationFeedbackJournal(syncState), sagas: new Map() };
}

const ACTOR = 'dev@example.com';

describe('planDecision', () => {
  it('accepts each named pending proposal with the actor and one feedback event apiece', () => {
    const logs = logsWith('p1', 'p2');

    const plan = planDecision(logs, {
      kind: 'accept',
      proposalIds: ['p1', 'p2'],
      actor: ACTOR,
      commitRef: 'head-oid',
    });

    if ('refused' in plan) throw new Error(plan.refused);
    expect(plan.syncState).toMatchObject([
      { type: 'ProposalAccepted', proposalId: 'p1', actor: ACTOR },
      { type: 'ProposalAccepted', proposalId: 'p2', actor: ACTOR },
    ]);
    expect(plan.feedback.map((f) => f.metadata)).toMatchObject([
      {
        causationId: 'p1',
        correlationId: plan.saga.getSagaId(),
        source: { source: 'mmmnt:implementation-feedback' },
        commitRef: 'head-oid',
        actor: ACTOR,
        eventType: 'ValueObjectFieldAdded',
      },
      { causationId: 'p2' },
    ]);
  });

  it('drives one saga to Committing: Started, ProposalsGenerated, ConfirmationComplete, RecordingComplete', () => {
    const plan = planDecision(logsWith('p1'), {
      kind: 'accept',
      proposalIds: ['p1'],
      actor: ACTOR,
      commitRef: 'head-oid',
    });

    if ('refused' in plan) throw new Error(plan.refused);
    expect(plan.pushFlow).toMatchObject([
      { type: 'PushFlowStarted' },
      { type: 'PushFlowProposalsGenerated', proposalCount: 1 },
      { type: 'PushFlowConfirmationComplete', acceptedCount: 1, rejectedCount: 0, skippedCount: 0 },
      { type: 'PushFlowRecordingComplete', recordedCount: 1 },
    ]);
    expect(plan.saga.getState()).toBe('Committing');
  });

  it('rejects each named pending proposal with the reason and records no feedback', () => {
    const plan = planDecision(logsWith('p1'), {
      kind: 'reject',
      proposalIds: ['p1'],
      actor: ACTOR,
      reason: 'a local workaround',
      commitRef: 'head-oid',
    });

    if ('refused' in plan) throw new Error(plan.refused);
    expect(plan.syncState).toMatchObject([
      { type: 'ProposalRejected', proposalId: 'p1', reason: 'a local workaround', actor: ACTOR },
    ]);
    expect(plan.feedback).toEqual([]);
    expect(plan.pushFlow[2]).toMatchObject({ acceptedCount: 0, rejectedCount: 1 });
  });

  it('refuses the whole run when any id is not pending, naming each id and its status', () => {
    const logs = logsWith('p1', 'p2');
    logs.syncState.acceptProposal('p2', ACTOR);

    const plan = planDecision(logs, {
      kind: 'accept',
      proposalIds: ['p1', 'p2', 'ghost'],
      actor: ACTOR,
      commitRef: 'head-oid',
    });

    expect(plan).toEqual({ refused: expect.stringContaining('p2 (accepted)') });
    expect('refused' in plan && plan.refused).toContain('ghost (not found)');
    expect('refused' in plan && plan.refused).not.toContain('p1 (');
    expect(logs.syncState.getProposalStatus('p1')).toBe('pending');
  });

  it('refuses a proposal named twice', () => {
    const plan = planDecision(logsWith('p1'), {
      kind: 'accept',
      proposalIds: ['p1', 'p1'],
      actor: ACTOR,
      commitRef: 'head-oid',
    });

    expect(plan).toEqual({ refused: expect.stringContaining('p1 (named twice)') });
  });

  it('refuses a rejection with no reason', () => {
    const plan = planDecision(logsWith('p1'), {
      kind: 'reject',
      proposalIds: ['p1'],
      actor: ACTOR,
      reason: ' ',
      commitRef: 'head-oid',
    });

    expect(plan).toEqual({ refused: expect.stringContaining('reason') });
  });

  it('refuses a rejection that omits the reason entirely', () => {
    const plan = planDecision(logsWith('p1'), {
      kind: 'reject',
      proposalIds: ['p1'],
      actor: ACTOR,
      commitRef: 'head-oid',
    });

    expect(plan).toEqual({ refused: 'a rejection needs a reason' });
  });
});
