/**
 * Node ids (Facet parses `<frameId>::<lane>::<label>::<scope>`).
 *
 * The first placement of a name in a moment, lane and scope keeps `main` / `br<n>`; a later placement
 * of the same name there adds an occurrence mark, `main#2`, so ids are unique within a topology.
 * Topology, routing and scenarios all call `nodeId`, so they agree by construction.
 */
import type { MomentDefinition, MomentEntry } from '@mmmnt/core';
import { orderedMomentChildren } from './moment-children.js';

const occurrences = new WeakMap<MomentDefinition, Map<MomentEntry, number>>();

function occurrencesIn(moment: MomentDefinition, laneOf: (e: MomentEntry) => string) {
  const known = occurrences.get(moment);
  if (known) return known;
  const seen = new Map<string, number>();
  const result = new Map<MomentEntry, number>();
  const visit = (entry: MomentEntry, scope: string): void => {
    const key = `${laneOf(entry)}\u0000${entry.nodeName}\u0000${scope}`;
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    result.set(entry, n);
  };
  for (const child of orderedMomentChildren(moment, 'entries-first')) {
    if (child.kind === 'entry') visit(child.entry, 'main');
    else for (const e of child.branch.entries) visit(e, `br${child.branchIndex}`);
  }
  occurrences.set(moment, result);
  return result;
}

/** The id of a placed node. `laneOf` maps an entry to the lane id the topology uses. */
export function nodeId(
  moment: MomentDefinition,
  entry: MomentEntry,
  laneOf: (e: MomentEntry) => string,
  scope: string,
): string {
  const n = occurrencesIn(moment, laneOf).get(entry) ?? 1;
  return `${moment.id}::${laneOf(entry)}::${entry.nodeName}::${scope}${n > 1 ? `#${n}` : ''}`;
}
