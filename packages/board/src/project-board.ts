import type { IntermediateRepresentation, ContextDefinition } from '@mmmnt/core';
import type { NodeKind } from './palette.js';
import type { BoardProjection, ManifestNode } from './types.js';

function definitionsOf(ctx: ContextDefinition): ManifestNode[] {
  const frame = `context-${ctx.name}`;
  const out: ManifestNode[] = [];
  const add = (kind: NodeKind, name: string, path: string): void => {
    out.push({ kind, name, context: ctx.name, role: 'definition', frame, path });
  };
  const inAggregate = (pick: (a: ContextDefinition['aggregates'][number]) => { name: string }[]) =>
    new Set(ctx.aggregates.flatMap((a) => pick(a).map((x) => x.name)));

  ctx.aggregates.forEach((a, i) => {
    add('aggregate', a.name, `contexts[].aggregates[${i}]`);
    a.commands.forEach((c) => add('command', c.name, 'contexts[].aggregates[].commands[]'));
    a.events.forEach((e) => add('event', e.name, 'contexts[].aggregates[].events[]'));
    a.invariants.forEach((v) => add('invariant', v.id, 'contexts[].aggregates[].invariants[]'));
  });
  const ownCommands = inAggregate((a) => a.commands);
  ctx.commands
    .filter((c) => !ownCommands.has(c.name))
    .forEach((c) => add('command', c.name, 'contexts[].commands[]'));
  const ownEvents = inAggregate((a) => a.events);
  ctx.events
    .filter((e) => !ownEvents.has(e.name))
    .forEach((e) => add('event', e.name, 'contexts[].events[]'));
  ctx.policies.forEach((p) => add('policy', p.name, 'contexts[].policies[]'));
  ctx.sagas.forEach((s) => add('saga', s.name, 'contexts[].sagas[]'));
  (ctx.projections ?? []).forEach((p) => add('projection', p.name, 'contexts[].projections[]'));
  (ctx.queries ?? []).forEach((q) => add('query', q.name, 'contexts[].queries[]'));
  (ctx.rules ?? []).forEach((r) => add('rule', r.id, 'contexts[].rules[]'));
  ctx.domainServices.forEach((s) => add('service', s.name, 'contexts[].domainServices[]'));
  return out;
}

export function projectBoard(ir: IntermediateRepresentation): BoardProjection {
  const nodes = ir.contexts.flatMap(definitionsOf);
  return {
    frames: [],
    manifest: {
      manifestVersion: 1,
      specification: ir.metadata.name,
      frames: [],
      nodes,
      edges: [],
      unrendered: [],
    },
  };
}
