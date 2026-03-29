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
   */
  advanceCursor(cursor: SyncCursor): CursorAdvanced {
    if (this.cursor !== null && cursor.timestamp <= this.cursor.timestamp) {
      throw new Error(
        `SS-02: New cursor timestamp '${cursor.timestamp}' must be greater than current cursor timestamp '${this.cursor.timestamp}'`,
      );
    }

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
   * SS-04: Throws for unrecognized event types.
   */
  apply(event: SyncStateEvent): void {
    switch (event.type) {
      case 'ProposalRecorded':
        this.proposals.set(event.proposalId, {
          proposal: event.proposal,
          status: 'pending',
        });
        break;

      case 'ProposalAccepted':
        this.setProposalStatus(event.proposalId, 'accepted');
        break;

      case 'ProposalRejected':
        this.setProposalStatus(event.proposalId, 'rejected');
        break;

      case 'ProposalSkipped':
        this.setProposalStatus(event.proposalId, 'superseded');
        break;

      case 'CursorAdvanced':
        this.cursor = event.cursor;
        break;

      default: {
        const exhaustive: never = event;
        throw new Error(`SS-04: Unknown event type '${(exhaustive as { type: string }).type}'`);
      }
    }
  }

  /**
   * Query the status of a proposal by id.
   */
  getProposalStatus(proposalId: string): ProposalStatus | undefined {
    return this.proposals.get(proposalId)?.status;
  }

  /**
   * Query the current sync cursor.
   */
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

  private setProposalStatus(proposalId: string, status: ProposalStatus): void {
    const entry = this.proposals.get(proposalId);
    if (entry) {
      this.proposals.set(proposalId, { ...entry, status });
    }
  }
}
