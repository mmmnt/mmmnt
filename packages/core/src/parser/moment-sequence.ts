/**
 * M-P13 — Textual order of a moment's children.
 *
 * The grammar alternates `(nodes+=NodePlacement | whenBlocks+=WhenBlock)*`,
 * so the AST splits a moment's children into two arrays and loses their
 * interleaving. CST offsets recover the true source order without a grammar
 * change. Shared by the IR transform (MomentDefinition.sequence) and the V8
 * terminal-position validator.
 */
import type { MomentDeclaration } from '../generated/ast.js';
import type { MomentSequenceItem } from '../ir/index.js';

export interface MomentSequenceResult {
  /** Children of the moment in textual order (entry/branch + array index). */
  sequence: MomentSequenceItem[];
  /**
   * True when every child carried a `$cstNode` and the order is genuinely
   * textual. False for hand-constructed ASTs (no CST): the sequence then
   * falls back to entries-then-branches declaration order.
   */
  fromCst: boolean;
}

export function buildMomentSequence(moment: MomentDeclaration): MomentSequenceResult {
  const positioned: { item: MomentSequenceItem; offset: number | undefined }[] = [];
  moment.nodes.forEach((node, index) => {
    positioned.push({ item: { kind: 'entry', index }, offset: node.$cstNode?.offset });
  });
  moment.whenBlocks.forEach((block, index) => {
    positioned.push({ item: { kind: 'branch', index }, offset: block.$cstNode?.offset });
  });

  const fromCst = positioned.every((p) => p.offset !== undefined);
  if (!fromCst) {
    // Fallback: entries-then-branches (the push order above).
    return { sequence: positioned.map((p) => p.item), fromCst: false };
  }

  // CST offsets are unique per child, so this sort is deterministic.
  const sequence = positioned
    .slice()
    .sort((a, b) => (a.offset as number) - (b.offset as number))
    .map((p) => p.item);
  return { sequence, fromCst: true };
}
