/**
 * Sequence-aware iteration over a moment's children (M-S12).
 *
 * MomentDefinition.sequence records the textual source order of a moment's
 * entries and `when` branches (core M-P13). Emitters historically hardcoded
 * an order (entries-then-branches, or branches-then-entries in the scenario
 * walker); this helper makes them read the declared sequence instead, falling
 * back to the caller's legacy order when the IR carries no usable sequence
 * (hand-constructed IR, older artifacts).
 *
 * Today's grammar cannot produce interleaved order (`when` blocks greedily
 * consume trailing nodes), so on every parseable spec the sequence equals
 * entries-then-branches and output is byte-identical to the legacy orders —
 * asserted by the sequence-identity integration test.
 */

import type { MomentDefinition, MomentEntry, BranchDefinition } from '@mmmnt/core';

export type OrderedMomentChild =
  | { kind: 'entry'; entry: MomentEntry; entryIndex: number }
  | { kind: 'branch'; branch: BranchDefinition; branchIndex: number };

type WalkedSequenceItem = { kind: 'entry' | 'branch'; index: number };

export type ChildOrderFallback = 'entries-first' | 'branches-first';

export function orderedMomentChildren(
  moment: MomentDefinition,
  fallback: ChildOrderFallback,
): OrderedMomentChild[] {
  const entries = moment.contextEntries;
  const branches = moment.branches ?? [];
  const seq = moment.sequence;

  // Notes (ADR-040 D3) sit in the sequence to keep source order but are not children to walk.
  const walked = seq?.filter((item) => item.kind !== 'note') as WalkedSequenceItem[] | undefined;
  if (walked && isUsableSequence(walked, entries.length, branches.length)) {
    return walked.map((item) =>
      item.kind === 'entry'
        ? { kind: 'entry' as const, entry: entries[item.index], entryIndex: item.index }
        : { kind: 'branch' as const, branch: branches[item.index], branchIndex: item.index },
    );
  }

  const entryChildren = entries.map((entry, i) => ({
    kind: 'entry' as const,
    entry,
    entryIndex: i,
  }));
  const branchChildren = branches.map((branch, i) => ({
    kind: 'branch' as const,
    branch,
    branchIndex: i,
  }));
  return fallback === 'entries-first'
    ? [...entryChildren, ...branchChildren]
    : [...branchChildren, ...entryChildren];
}

/**
 * A sequence is usable only when it covers every child exactly once with
 * in-range indices — anything else (partial, duplicated, out-of-range) falls
 * back rather than silently dropping or double-emitting children.
 */
function isUsableSequence(
  seq: readonly { kind: 'entry' | 'branch'; index: number }[],
  entryCount: number,
  branchCount: number,
): boolean {
  if (seq.length !== entryCount + branchCount) return false;
  const seenEntries = new Set<number>();
  const seenBranches = new Set<number>();
  for (const item of seq) {
    if (item.kind === 'entry') {
      if (item.index < 0 || item.index >= entryCount || seenEntries.has(item.index)) return false;
      seenEntries.add(item.index);
    } else {
      if (item.index < 0 || item.index >= branchCount || seenBranches.has(item.index)) return false;
      seenBranches.add(item.index);
    }
  }
  return true;
}
