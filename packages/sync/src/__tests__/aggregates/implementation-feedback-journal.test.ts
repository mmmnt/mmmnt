import { describe, it, expect } from 'vitest';
import { SyncState } from '../../aggregates/sync-state.js';
import { ImplementationFeedbackJournal } from '../../aggregates/implementation-feedback-journal.js';
import type { RecordImplementationFeedbackInput } from '../../aggregates/implementation-feedback-journal.js';
import type { ImplementationChangeProposal, FeedbackEventType } from '../../value-objects/index.js';

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

function makeSyncStateWithAcceptedProposal(proposalId = 'prop-001'): SyncState {
  const state = new SyncState();
  state.recordProposal(makeProposal(proposalId));
  state.acceptProposal(proposalId);
  return state;
}

function makeValidInput(
  overrides: Partial<RecordImplementationFeedbackInput> = {},
): RecordImplementationFeedbackInput {
  return {
    feedbackEventType: 'ValueObjectFieldAdded',
    payload: { fieldName: 'amount', fieldType: 'number' },
    source: { source: 'mmmnt:implementation-feedback' },
    causationId: 'prop-001',
    correlationId: 'corr-001',
    actor: 'developer@example.com',
    commitRef: 'abc123',
    ...overrides,
  };
}

describe('ImplementationFeedbackJournal', () => {
  it('records valid feedback event and returns ImplementationFeedbackRecorded', () => {
    const state = makeSyncStateWithAcceptedProposal();
    const journal = new ImplementationFeedbackJournal(state);

    const event = journal.recordImplementationFeedback(makeValidInput());

    expect(event.type).toBe('ImplementationFeedbackRecorded');
    expect(event.payload).toEqual({ fieldName: 'amount', fieldType: 'number' });
  });

  it('IFJ-01: rejects source that is not mmmnt:implementation-feedback', () => {
    const state = makeSyncStateWithAcceptedProposal();
    const journal = new ImplementationFeedbackJournal(state);

    expect(() =>
      journal.recordImplementationFeedback(makeValidInput({ source: { source: 'other:source' } })),
    ).toThrow('IFJ-01');
  });

  it('IFJ-02: rejects causation that does not reference accepted proposal', () => {
    const state = makeSyncStateWithAcceptedProposal();
    const journal = new ImplementationFeedbackJournal(state);

    expect(() =>
      journal.recordImplementationFeedback(makeValidInput({ causationId: 'nonexistent-id' })),
    ).toThrow('IFJ-02');
  });

  it('IFJ-02: rejects causation for pending proposal', () => {
    const state = new SyncState();
    state.recordProposal(makeProposal('prop-pending'));
    const journal = new ImplementationFeedbackJournal(state);

    expect(() =>
      journal.recordImplementationFeedback(makeValidInput({ causationId: 'prop-pending' })),
    ).toThrow('IFJ-02');
  });

  it('IFJ-02: rejects causation for rejected proposal', () => {
    const state = new SyncState();
    state.recordProposal(makeProposal('prop-rejected'));
    state.rejectProposal('prop-rejected', 'not needed');
    const journal = new ImplementationFeedbackJournal(state);

    expect(() =>
      journal.recordImplementationFeedback(makeValidInput({ causationId: 'prop-rejected' })),
    ).toThrow('IFJ-02');
  });

  it('IFJ-03: rejects unknown feedback event type', () => {
    const state = makeSyncStateWithAcceptedProposal();
    const journal = new ImplementationFeedbackJournal(state);

    expect(() =>
      journal.recordImplementationFeedback(
        makeValidInput({ feedbackEventType: 'UnknownType' as FeedbackEventType }),
      ),
    ).toThrow('IFJ-03');
  });

  it('IFJ-04: rejects empty actor', () => {
    const state = makeSyncStateWithAcceptedProposal();
    const journal = new ImplementationFeedbackJournal(state);

    expect(() => journal.recordImplementationFeedback(makeValidInput({ actor: '' }))).toThrow(
      'IFJ-04',
    );
  });

  it('IFJ-04: rejects whitespace-only actor', () => {
    const state = makeSyncStateWithAcceptedProposal();
    const journal = new ImplementationFeedbackJournal(state);

    expect(() => journal.recordImplementationFeedback(makeValidInput({ actor: '   ' }))).toThrow(
      'IFJ-04',
    );
  });

  it('accepts all 8 feedback event types', () => {
    const allTypes: FeedbackEventType[] = [
      'ValueObjectDefined',
      'ValueObjectRemoved',
      'ValueObjectRenamed',
      'ValueObjectFieldAdded',
      'ValueObjectFieldRemoved',
      'ValueObjectFieldRevised',
      'CommandInputRevised',
      'DomainEventPayloadRevised',
    ];

    for (const feedbackEventType of allTypes) {
      const state = makeSyncStateWithAcceptedProposal(`prop-${feedbackEventType}`);
      const journal = new ImplementationFeedbackJournal(state);

      const event = journal.recordImplementationFeedback(
        makeValidInput({ feedbackEventType, causationId: `prop-${feedbackEventType}` }),
      );

      expect(event.type).toBe('ImplementationFeedbackRecorded');
      expect(event.metadata.eventType).toBe(feedbackEventType);
    }
  });

  it('journal is append-only — entries accumulate', () => {
    const state = makeSyncStateWithAcceptedProposal();
    const journal = new ImplementationFeedbackJournal(state);

    journal.recordImplementationFeedback(makeValidInput());
    journal.recordImplementationFeedback(makeValidInput({ correlationId: 'corr-002' }));
    journal.recordImplementationFeedback(makeValidInput({ correlationId: 'corr-003' }));

    expect(journal.getEntryCount()).toBe(3);
    expect(journal.getEntries()).toHaveLength(3);
  });

  it('EventMetadata includes all required fields', () => {
    const state = makeSyncStateWithAcceptedProposal();
    const journal = new ImplementationFeedbackJournal(state);

    const event = journal.recordImplementationFeedback(makeValidInput());
    const { metadata } = event;

    expect(metadata.eventId).toBeDefined();
    expect(metadata.eventType).toBe('ValueObjectFieldAdded');
    expect(metadata.timestamp).toBeDefined();
    expect(metadata.actor).toBe('developer@example.com');
    expect(metadata.source).toEqual({ source: 'mmmnt:implementation-feedback' });
    expect(metadata.causationId).toBe('prop-001');
    expect(metadata.correlationId).toBe('corr-001');
    expect(metadata.version).toBe(1);
    expect(metadata.commitRef).toBe('abc123');
  });

  it('each entry has a unique eventId', () => {
    const state = makeSyncStateWithAcceptedProposal();
    const journal = new ImplementationFeedbackJournal(state);

    const event1 = journal.recordImplementationFeedback(makeValidInput());
    const event2 = journal.recordImplementationFeedback(
      makeValidInput({ correlationId: 'corr-002' }),
    );

    expect(event1.metadata.eventId).not.toBe(event2.metadata.eventId);
  });
});
