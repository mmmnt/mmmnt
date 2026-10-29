/**
 * planDecision — one accept or reject run over pending proposals (ADR-039 §3)
 *
 * Every named proposal must be pending or the run is refused whole. A run drives
 * one PushFlowSaga to Committing; the caller commits the logs, then records
 * Committed and Complete. Each accepted proposal yields exactly one
 * ImplementationFeedbackRecorded (IS-04).
 */

import { PushFlowSaga } from '../sagas/push-flow-saga.js';
import type { PushFlowEvent } from '../sagas/push-flow-saga.js';
import type { SyncLogs } from '../infrastructure/jsonl-sync-log-store.js';
import type { ImplementationFeedbackRecorded } from '../aggregates/implementation-feedback-journal.js';
import type { SyncStateEvent } from '../events/sync-state-events.js';
import type { ImplementationChangeProposal } from '../value-objects/index.js';

export type DecisionKind = 'accept' | 'reject';

export interface DecisionInput {
  readonly kind: DecisionKind;
  readonly proposalIds: readonly string[];
  readonly actor: string;
  /** Required for a rejection. */
  readonly reason?: string;
  /** The local commit the decision was made against (feedback commitRef). */
  readonly commitRef: string;
}

export interface DecisionPlan {
  readonly proposals: readonly ImplementationChangeProposal[];
  readonly syncState: readonly SyncStateEvent[];
  readonly feedback: readonly ImplementationFeedbackRecorded[];
  readonly pushFlow: readonly PushFlowEvent[];
  readonly saga: PushFlowSaga;
}

export interface DecisionRefusal {
  readonly refused: string;
}

function unpending(logs: SyncLogs, ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const problems: string[] = [];
  for (const id of ids) {
    const status = logs.syncState.getProposalStatus(id);
    if (seen.has(id)) problems.push(`${id} (named twice)`);
    else if (status !== 'pending') problems.push(`${id} (${status ?? 'not found'})`);
    seen.add(id);
  }
  return problems;
}

export function planDecision(logs: SyncLogs, input: DecisionInput): DecisionPlan | DecisionRefusal {
  if (input.kind === 'reject' && (input.reason ?? '').trim().length === 0) {
    return { refused: 'a rejection needs a reason' };
  }
  const problems = unpending(logs, input.proposalIds);
  if (problems.length > 0) {
    return { refused: `only pending proposals can be decided: ${problems.join(', ')}` };
  }
  const byId = new Map(logs.syncState.getProposals().map((e) => [e.proposal.proposalId, e]));
  const proposals = input.proposalIds.map((id) => byId.get(id)!.proposal);

  const saga = new PushFlowSaga();
  const accepting = input.kind === 'accept';
  const n = proposals.length;
  const pushFlow: PushFlowEvent[] = [
    saga.start(),
    saga.proposalsGenerated(n),
    saga.confirmationComplete(accepting ? n : 0, accepting ? 0 : n, 0),
  ];

  const syncState: SyncStateEvent[] = [];
  const feedback: ImplementationFeedbackRecorded[] = [];
  for (const proposal of proposals) {
    if (!accepting) {
      syncState.push(
        logs.syncState.rejectProposal(proposal.proposalId, input.reason!, input.actor),
      );
      continue;
    }
    syncState.push(logs.syncState.acceptProposal(proposal.proposalId, input.actor));
    feedback.push(
      logs.journal.recordImplementationFeedback({
        feedbackEventType: proposal.proposedEventType,
        payload: proposal.proposedPayload,
        source: { source: 'mmmnt:implementation-feedback' },
        causationId: proposal.proposalId,
        correlationId: saga.getSagaId(),
        actor: input.actor,
        commitRef: input.commitRef,
      }),
    );
  }
  pushFlow.push(saga.recordingComplete(feedback.length));

  return { proposals, syncState, feedback, pushFlow, saga };
}
