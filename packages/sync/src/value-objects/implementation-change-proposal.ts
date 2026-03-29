import type { ASTDifference } from './ast-difference.js';

export interface ImplementationChangeProposal {
  readonly proposalId: string;
  readonly proposedEventType: string;
  readonly proposedPayload: Readonly<Record<string, unknown>>;
  readonly sourceFile: string;
  readonly sourceDifference: ASTDifference;
  readonly dualPopulationApplied?: boolean;
}
