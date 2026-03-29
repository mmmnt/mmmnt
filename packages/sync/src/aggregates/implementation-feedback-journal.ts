/**
 * ImplementationFeedbackJournal Aggregate
 *
 * Persisted to: .domain/implementation-feedback.jsonl
 * Append-only journal of confirmed implementation feedback events.
 */

import { randomUUID } from 'crypto';
import type {
  FeedbackEventType,
  EventMetadata,
  SourceAttribution,
} from '../value-objects/index.js';
import { SyncState } from './sync-state.js';

// The 8 known feedback event types
const KNOWN_FEEDBACK_TYPES: ReadonlySet<FeedbackEventType> = new Set([
  'ValueObjectDefined',
  'ValueObjectRemoved',
  'ValueObjectRenamed',
  'ValueObjectFieldAdded',
  'ValueObjectFieldRemoved',
  'ValueObjectFieldRevised',
  'CommandInputRevised',
  'DomainEventPayloadRevised',
]);

export interface RecordImplementationFeedbackInput {
  readonly feedbackEventType: FeedbackEventType;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly source: SourceAttribution;
  readonly causationId: string;
  readonly correlationId: string;
  readonly actor: string;
  readonly commitRef: string;
}

export interface ImplementationFeedbackRecorded {
  readonly type: 'ImplementationFeedbackRecorded';
  readonly metadata: EventMetadata;
  readonly payload: Readonly<Record<string, unknown>>;
}

export class ImplementationFeedbackJournal {
  private readonly entries: ImplementationFeedbackRecorded[] = [];

  constructor(private readonly syncState: SyncState) {}

  recordImplementationFeedback(
    input: RecordImplementationFeedbackInput,
  ): ImplementationFeedbackRecorded {
    this.assertValidSource(input.source);
    this.assertAcceptedProposal(input.causationId);
    this.assertKnownFeedbackType(input.feedbackEventType);
    this.assertValidActor(input.actor);

    const event: ImplementationFeedbackRecorded = {
      type: 'ImplementationFeedbackRecorded',
      metadata: {
        eventId: randomUUID(),
        eventType: input.feedbackEventType,
        timestamp: new Date().toISOString(),
        actor: input.actor,
        source: input.source,
        causationId: input.causationId,
        correlationId: input.correlationId,
        version: 1,
        commitRef: input.commitRef,
      },
      payload: input.payload,
    };

    this.entries.push(event);
    return event;
  }

  getEntries(): readonly ImplementationFeedbackRecorded[] {
    return [...this.entries];
  }

  getEntryCount(): number {
    return this.entries.length;
  }

  // IFJ-01: source must be mmmnt:implementation-feedback
  private assertValidSource(source: SourceAttribution): void {
    if (source.source !== 'mmmnt:implementation-feedback') {
      throw new Error(
        `IFJ-01: Source must be 'mmmnt:implementation-feedback', got '${source.source}'`,
      );
    }
  }

  // IFJ-02: causation must reference valid accepted proposal
  private assertAcceptedProposal(causationId: string): void {
    const proposalStatus = this.syncState.getProposalStatus(causationId);
    if (proposalStatus !== 'accepted') {
      throw new Error(
        `IFJ-02: Causation '${causationId}' must reference an accepted proposal, got '${proposalStatus ?? 'not found'}'`,
      );
    }
  }

  // IFJ-03: event type must be known
  private assertKnownFeedbackType(feedbackEventType: FeedbackEventType): void {
    if (!KNOWN_FEEDBACK_TYPES.has(feedbackEventType)) {
      throw new Error(`IFJ-03: Unknown feedback event type '${feedbackEventType}'`);
    }
  }

  // IFJ-04: actor must be valid (non-empty string)
  private assertValidActor(actor: string): void {
    if (!actor || actor.trim().length === 0) {
      throw new Error('IFJ-04: Actor must be a valid non-empty identity');
    }
  }
}
