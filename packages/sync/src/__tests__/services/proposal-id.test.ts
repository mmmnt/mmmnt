import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { ASTDiffEngine } from '../../services/ast-diff-engine.js';
import { deriveProposalId } from '../../services/proposal-id.js';

const EXPECTED = `export interface Order { readonly id: string; readonly total: number; }`;
const ACTUAL = `export interface Order { readonly id: string; readonly total: string; readonly notes: string; readonly tag: string; }`;

function proposalsFor(actual: string = ACTUAL) {
  return new ASTDiffEngine().generateProposals({
    expected: new Map([['order.ts', EXPECTED]]),
    actual: new Map([['order.ts', actual]]),
  });
}

describe('drift-derived proposal id', () => {
  it('is prop- followed by the first 16 hex chars of sha256 over the drift', () => {
    const id = deriveProposalId({
      filePath: 'order.ts',
      differenceType: 'added-field',
      expectedNode: '',
      actualNode: 'Order.notes: readonly string',
    });
    const digest = createHash('sha256')
      .update(JSON.stringify(['order.ts', 'added-field', '', 'Order.notes: readonly string']))
      .digest('hex');
    expect(id).toBe(`prop-${digest.slice(0, 16)}`);
  });

  it('does not collide when parts shift across the separator', () => {
    const a = deriveProposalId({
      filePath: 'a',
      differenceType: 'added-field',
      expectedNode: 'b|c',
      actualNode: '',
    });
    const b = deriveProposalId({
      filePath: 'a',
      differenceType: 'added-field',
      expectedNode: 'b',
      actualNode: 'c',
    });
    expect(a).not.toBe(b);
  });

  it('gives the same drift the same id on every run', () => {
    const first = proposalsFor().map((p) => p.proposalId);
    const second = proposalsFor().map((p) => p.proposalId);
    expect(first).toEqual(second);
  });

  it('gives every distinct drift in one file a distinct id', () => {
    const ids = proposalsFor().map((p) => p.proposalId);
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
    for (const id of ids) expect(id).toMatch(/^prop-[0-9a-f]{16}$/);
  });

  it('records the expected and actual nodes the id is derived from', () => {
    const added = proposalsFor().find((p) => p.sourceDifference.differenceType === 'added-field');
    expect(added?.sourceDifference.actualNode).toBe('Order.notes: readonly string');
    expect(added?.sourceDifference.expectedNode).toBe('');
    expect(added?.proposalId).toBe(deriveProposalId(added!.sourceDifference));
  });
});
