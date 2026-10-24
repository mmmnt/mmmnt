import { createHash } from 'node:crypto';
import type { ASTDifference } from '../value-objects/index.js';

/** A proposal's id names its drift: the same drift yields the same id on every run (ADR-039 §2). */
export function deriveProposalId(difference: ASTDifference): string {
  const parts = [
    difference.filePath,
    difference.differenceType,
    difference.expectedNode,
    difference.actualNode,
  ];
  const digest = createHash('sha256').update(JSON.stringify(parts)).digest('hex');
  return `prop-${digest.slice(0, 16)}`;
}
