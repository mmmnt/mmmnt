import type { ASTDifference } from './ast-difference.js';
import type { FeedbackEventType } from './feedback-event-type.js';

export interface ImplementationChangeProposal {
  readonly proposalId: string;
  readonly proposedEventType: FeedbackEventType;
  readonly proposedPayload: Readonly<Record<string, unknown>>;
  readonly sourceFile: string;
  readonly sourceDifference: ASTDifference;
  readonly dualPopulationApplied?: boolean;
}
