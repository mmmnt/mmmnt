import type { IntermediateRepresentation } from '@mmmnt/core';
import type { UnrenderedEntry } from './types.js';

/**
 * The closure table (ADR-047 D5). Every property path of a real IR is either carried by the board
 * (drawn on a frame, or listed in the manifest as a node or edge) or unrendered with a reason.
 * `sweepIr` walks an IR instance, so a property added to the IR later is found here, not skipped.
 */

const commandFields = [
  '',
  '.id',
  '.name',
  '.causes',
  '.emitsEvent',
  '.outcomes',
  '.outcomes[].events',
  '.outcomes[].whenState',
  '.preconditions',
  '.preconditions[].name',
  '.preconditions[].description',
  '.preconditions[].causes',
];

const eventFields = ['', '.id', '.name', '.owner', '.owner.kind', '.owner.name'];

const under = (prefix: string, suffixes: string[]): string[] => suffixes.map((s) => prefix + s);

/** Property paths the board carries: drawn on a frame or listed in the manifest. */
export const RENDERED: ReadonlySet<string> = new Set([
  ...under('contexts[].aggregates[].commands[]', commandFields),
  ...under('contexts[].commands[]', commandFields),
  ...under('contexts[].sagas[].commands[]', commandFields),
  ...under('contexts[].aggregates[].events[]', eventFields),
  ...under('contexts[].events[]', eventFields),
  ...under('contexts[].sagas[].events[]', eventFields),
  'contexts[]',
  'contexts[].id',
  'contexts[].name',
  'contexts[].classification',
  'contexts[].aggregates[]',
  'contexts[].aggregates[].id',
  'contexts[].aggregates[].name',
  'contexts[].aggregates[].invariants[]',
  'contexts[].aggregates[].invariants[].id',
  'contexts[].aggregates[].invariants[].description',
  'contexts[].aggregates[].invariants[].scope',
  'contexts[].invariants[]',
  'contexts[].invariants[].id',
  'contexts[].invariants[].description',
  'contexts[].invariants[].scope',
  'contexts[].policies[]',
  'contexts[].policies[].id',
  'contexts[].policies[].name',
  'contexts[].policies[].trigger',
  'contexts[].policies[].chainsTo',
  'contexts[].policies[].condition',
  'contexts[].policies[].condition.field',
  'contexts[].policies[].condition.equals',
  'contexts[].policies[].condition.after',
  'contexts[].sagas[]',
  'contexts[].sagas[].id',
  'contexts[].sagas[].name',
  'contexts[].projections[]',
  'contexts[].projections[].id',
  'contexts[].projections[].name',
  'contexts[].projections[].sources',
  'contexts[].queries[]',
  'contexts[].queries[].id',
  'contexts[].queries[].name',
  'contexts[].queries[].reads',
  'contexts[].rules[]',
  'contexts[].rules[].id',
  'contexts[].rules[].description',
  'contexts[].rules[].enforcedBy',
  'contexts[].rules[].enforcerKind',
  'contexts[].domainServices[]',
  'contexts[].domainServices[].id',
  'contexts[].domainServices[].name',
  'externals[]',
  'externals[].id',
  'externals[].name',
  'relationships[]',
  'relationships[].sourceContextId',
  'relationships[].targetContextId',
  'relationships[].relationshipType',
  'flows[]',
  'flows[].id',
  'flows[].name',
  'flows[].lanes[]',
  'flows[].lanes[].id',
  'flows[].lanes[].label',
  'flows[].lanes[].contextId',
  'flows[].lanes[].classification',
  'flows[].lanes[].isBranch',
  'flows[].moments[]',
  'flows[].moments[].id',
  'flows[].moments[].name',
  'flows[].moments[].terminal',
  'flows[].moments[].isBranch',
  'flows[].moments[].contextEntries[]',
  'flows[].moments[].notes[]',
  'flows[].moments[].notes[].text',
  'flows[].moments[].notes[].laneId',
  'flows[].moments[].branches[]',
  'flows[].moments[].branches[].condition',
  'flows[].moments[].branches[].entries[]',
  ...['contextEntries[]', 'branches[].entries[]'].flatMap((p) =>
    under(`flows[].moments[].${p}`, [
      '.contextId',
      '.nodeKind',
      '.nodeName',
      '.cause',
      '.exit',
      '.terminal',
      '.optional',
      '.multiplicity',
    ]),
  ),
  'flows[].connections[]',
  'flows[].connections[].connectionType',
  'flows[].connections[].sourceMomentId',
  'flows[].connections[].sourceNodeName',
  'flows[].connections[].targetNodeName',
  'flows[].connections[].targetContextId',
  'flows[].connections[].schemaContract',
  'flows[].connections[].schemaContract.eventType',
  'metadata',
  'metadata.name',
]);

/** Subtrees the board does not carry, each with the reason. `*` matches any text. */
export const UNRENDERED: readonly { pattern: string; reason: string }[] = [
  {
    pattern: '*.annotations*',
    reason: 'classification annotations are metadata, not a palette construct',
  },
  { pattern: '*.fields*', reason: 'field lists are schema, not board nodes' },
  { pattern: '*.inputs*', reason: 'command and query inputs are schema, not board nodes' },
  { pattern: '*.identityField*', reason: 'the identity field is schema' },
  {
    pattern: '*.gateways*',
    reason: 'a gateway is request-to-value detail of its construct, not a node of the palette',
  },
  { pattern: '*.valueObjects*', reason: 'a value object is not in the NDD palette' },
  {
    pattern: 'contexts[].aggregates[].states*',
    reason: 'aggregate state and its transitions are not drawn',
  },
  {
    pattern: 'contexts[].sagas[].states*',
    reason: 'the orchestration state machine is not drawn on the context frame',
  },
  {
    pattern: 'contexts[].sagas[].transitions*',
    reason: 'the orchestration state machine is not drawn on the context frame',
  },
  { pattern: 'contexts[].sagas[].compensation*', reason: 'compensation is not drawn' },
  {
    pattern: 'contexts[].sagas[].issues*',
    reason: 'the commands an orchestration issues are not drawn as connectors',
  },
  {
    pattern: 'contexts[].sagas[].trigger',
    reason: 'the invoking command is not drawn as a connector',
  },
  {
    pattern: 'contexts[].sagas[].startEvent',
    reason: 'the start event is not drawn as a connector',
  },
  { pattern: 'contexts[].sagas[].timeout', reason: 'a timeout is not drawn' },
  {
    pattern: 'contexts[].sagas[].keyword',
    reason: 'orchestration and saga draw alike (the palette saga)',
  },
  { pattern: 'contexts[].policies[].action', reason: 'prose is not drawn on a sticky' },
  { pattern: '*.description', reason: 'prose is not drawn on a sticky' },
  { pattern: '*.consumes', reason: 'domain service signature is not drawn' },
  { pattern: '*.produces', reason: 'domain service signature is not drawn' },
  {
    pattern: 'flows[].moments[].sequence*',
    reason: 'textual order is not drawn; entries, notes and arms are laid out by kind',
  },
  {
    pattern: 'flows[].moments[].branches[].lane',
    reason: 'branch-lane routing is not drawn; arms sit in the BRANCH row',
  },
  {
    pattern: 'flows[].connections[].schemaContract.*',
    reason: 'crossing contract fields are not drawn',
  },
  { pattern: 'flows[].connections[].id', reason: 'connection bookkeeping' },
  {
    pattern: 'flows[].connections[].eventId',
    reason: 'connection bookkeeping; the hop is drawn from the node names',
  },
  { pattern: 'flows[].connections[].branchCondition', reason: 'connection bookkeeping' },
  {
    pattern: 'relationships[].contract',
    reason: 'the contract name is not drawn; the relationship type labels the connector',
  },
  { pattern: 'glossary*', reason: 'the glossary is a document, not a board frame' },
  { pattern: 'metadata.*', reason: 'specification version and description are not drawn' },
];

function matches(pattern: string, path: string): boolean {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`).test(path);
}

function isPrefixOfRendered(path: string): boolean {
  for (const r of RENDERED) {
    if (r.startsWith(`${path}.`) || r.startsWith(`${path}[]`)) return true;
  }
  return false;
}

/** Every distinct property path of an IR instance, arrays written `[]`. */
export function irPaths(ir: IntermediateRepresentation): Set<string> {
  const paths = new Set<string>();
  const walk = (value: unknown, path: string): void => {
    if (Array.isArray(value)) {
      value.forEach((v) => walk(v, `${path}[]`));
    } else if (value !== null && typeof value === 'object') {
      for (const [key, v] of Object.entries(value)) {
        const next = path === '' ? key : `${path}.${key}`;
        paths.add(next);
        walk(v, next);
      }
    }
  };
  walk(ir, '');
  return paths;
}

export interface Sweep {
  /** Paths neither carried nor unrendered: the closure violations. */
  uncovered: string[];
  /** The unrendered subtrees this IR actually holds, with their reasons. */
  unrendered: UnrenderedEntry[];
}

export function sweepIr(ir: IntermediateRepresentation): Sweep {
  const uncovered: string[] = [];
  const unrendered = new Map<string, UnrenderedEntry>();
  for (const path of irPaths(ir)) {
    if (RENDERED.has(path) || isPrefixOfRendered(path)) continue;
    const hit = UNRENDERED.find((u) => matches(u.pattern, path));
    if (!hit) uncovered.push(path);
    else if (hit.reason !== 'carried' && !unrendered.has(hit.pattern)) {
      unrendered.set(hit.pattern, { path: hit.pattern, reason: hit.reason });
    }
  }
  return {
    uncovered: uncovered.sort(),
    unrendered: [...unrendered.values()].sort((a, b) => a.path.localeCompare(b.path)),
  };
}
