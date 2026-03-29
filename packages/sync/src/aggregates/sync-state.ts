/**
 * SyncState Aggregate
 *
 * Persisted to: .domain/sync-state.jsonl
 */

import type {
  ImplementationChangeProposal,
  ProposalStatus,
  SyncCursor,
} from '../value-objects/index.js';
import type {
  SyncStateEvent,
  ProposalRecorded,
  ProposalAccepted,
  ProposalRejected,
  ProposalSkipped,
  CursorAdvanced,
} from '../events/sync-state-events.js';

const TERMINAL_STATUSES: ReadonlySet<ProposalStatus> = new Set<ProposalStatus>([
  'accepted',
  'rejected',
  'superseded',
]);

function parseTimestamp(ts: string): number {
  const parsed = Date.parse(ts);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid timestamp: '${ts}' is not a valid ISO-8601 date`);
  }
  return parsed;
}

export class SyncState {
  private readonly proposals: Map<
    string,
    { proposal: ImplementationChangeProposal; status: ProposalStatus }
  > = new Map();

  private cursor: SyncCursor | null = null;

  /**
   * SS-01: Record a new proposal. Throws if proposalId already exists.
   */
  recordProposal(proposal: ImplementationChangeProposal): ProposalRecorded {
    if (this.proposals.has(proposal.proposalId)) {
      throw new Error(`SS-01: Proposal with id '${proposal.proposalId}' already exists`);
    }

    const event: ProposalRecorded = {
      type: 'ProposalRecorded',
      proposalId: proposal.proposalId,
      proposal,
      timestamp: new Date().toISOString(),
    };

    this.apply(event);
    return event;
  }

  /**
   * SS-03: Accept a proposal. Throws if proposal not found or in terminal state.
   */
  acceptProposal(proposalId: string): ProposalAccepted {
    this.assertProposalExistsAndNotTerminal(proposalId);

    const event: ProposalAccepted = {
      type: 'ProposalAccepted',
      proposalId,
      timestamp: new Date().toISOString(),
    };

    this.apply(event);
    return event;
  }

  /**
   * SS-03: Reject a proposal. Throws if proposal not found or in terminal state.
   */
  rejectProposal(proposalId: string, reason: string): ProposalRejected {
    this.assertProposalExistsAndNotTerminal(proposalId);

    const event: ProposalRejected = {
      type: 'ProposalRejected',
      proposalId,
      reason,
      timestamp: new Date().toISOString(),
    };

    this.apply(event);
    return event;
  }

  /**
   * SS-03: Skip a proposal. Throws if proposal not found or in terminal state.
   */
  skipProposal(proposalId: string, reason: string): ProposalSkipped {
    this.assertProposalExistsAndNotTerminal(proposalId);

    const event: ProposalSkipped = {
      type: 'ProposalSkipped',
      proposalId,
      reason,
      timestamp: new Date().toISOString(),
    };

    this.apply(event);
    return event;
  }

  /**
   * SS-02: Advance the sync cursor. Throws if new cursor timestamp <= current.
   * Validates timestamps via Date.parse for robust comparison.
   */
  advanceCursor(cursor: SyncCursor): CursorAdvanced {
    this.assertCursorAdvances(cursor);

    const event: CursorAdvanced = {
      type: 'CursorAdvanced',
      cursor,
      timestamp: new Date().toISOString(),
    };

    this.apply(event);
    return event;
  }

  /**
   * Apply a domain event to update internal state (event sourcing replay).
   * Enforces all invariants during replay to detect corrupted streams.
   * SS-04: Throws for unrecognized event types.
   */
  apply(event: SyncStateEvent): void {
    switch (event.type) {
      case 'ProposalRecorded':
        // SS-01: reject duplicate proposalId during replay
        if (this.proposals.has(event.proposalId)) {
          throw new Error(`SS-01: Duplicate proposalId '${event.proposalId}' in event stream`);
        }
        this.proposals.set(event.proposalId, {
          proposal: event.proposal,
          status: 'pending',
        });
        break;

      case 'ProposalAccepted':
        this.assertProposalExistsAndNotTerminal(event.proposalId);
        this.proposals.set(event.proposalId, {
          ...this.proposals.get(event.proposalId)!,
          status: 'accepted',
        });
        break;

      case 'ProposalRejected':
        this.assertProposalExistsAndNotTerminal(event.proposalId);
        this.proposals.set(event.proposalId, {
          ...this.proposals.get(event.proposalId)!,
          status: 'rejected',
        });
        break;

      case 'ProposalSkipped':
        this.assertProposalExistsAndNotTerminal(event.proposalId);
        this.proposals.set(event.proposalId, {
          ...this.proposals.get(event.proposalId)!,
          status: 'superseded',
        });
        break;

      case 'CursorAdvanced':
        // SS-02: enforce forward-only during replay
        this.assertCursorAdvances(event.cursor);
        this.cursor = event.cursor;
        break;

      default: {
        const exhaustive: never = event;
        throw new Error(`SS-04: Unknown event type '${(exhaustive as { type: string }).type}'`);
      }
    }
  }

  getProposalStatus(proposalId: string): ProposalStatus | undefined {
    return this.proposals.get(proposalId)?.status;
  }

  getCursor(): SyncCursor | null {
    return this.cursor;
  }

  private assertProposalExistsAndNotTerminal(proposalId: string): void {
    const entry = this.proposals.get(proposalId);
    if (!entry) {
      throw new Error(`Proposal with id '${proposalId}' not found`);
    }
    if (TERMINAL_STATUSES.has(entry.status)) {
      throw new Error(`SS-03: Proposal '${proposalId}' is in terminal state '${entry.status}'`);
    }
  }

  private assertCursorAdvances(cursor: SyncCursor): void {
    if (this.cursor === null) return;
    const currentMs = parseTimestamp(this.cursor.timestamp);
    const newMs = parseTimestamp(cursor.timestamp);
    if (newMs <= currentMs) {
      throw new Error(
        `SS-02: New cursor timestamp '${cursor.timestamp}' must be after current '${this.cursor.timestamp}'`,
      );
    }
  }
}
