import type { ImplementationChangeProposal } from '../value-objects/index.js';
import type { SyncCursor } from '../value-objects/index.js';

export interface ProposalRecorded {
  readonly type: 'ProposalRecorded';
  readonly proposalId: string;
  readonly proposal: ImplementationChangeProposal;
  readonly timestamp: string;
}

export interface ProposalAccepted {
  readonly type: 'ProposalAccepted';
  readonly proposalId: string;
  readonly timestamp: string;
  /** Who decided: the repo's git user.email (ADR-039 §1). Absent on records written before it. */
  readonly actor?: string;
}

export interface ProposalRejected {
  readonly type: 'ProposalRejected';
  readonly proposalId: string;
  readonly reason: string;
  readonly timestamp: string;
  /** Who decided: the repo's git user.email (ADR-039 §1). Absent on records written before it. */
  readonly actor?: string;
}

export interface ProposalSkipped {
  readonly type: 'ProposalSkipped';
  readonly proposalId: string;
  readonly reason: string;
  readonly timestamp: string;
}

export interface CursorAdvanced {
  readonly type: 'CursorAdvanced';
  readonly cursor: SyncCursor;
  readonly timestamp: string;
}

export type SyncStateEvent =
  | ProposalRecorded
  | ProposalAccepted
  | ProposalRejected
  | ProposalSkipped
  | CursorAdvanced;
