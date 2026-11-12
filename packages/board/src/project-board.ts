import type {
  IntermediateRepresentation,
  ContextDefinition,
  FlowDefinition,
  MomentEntry,
} from '@mmmnt/core';
import type { NodeKind } from './palette.js';
import type { BoardProjection, ManifestEdge, ManifestNode } from './types.js';

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

function contextNameOf(ir: IntermediateRepresentation, id: string): string {
  const ctx = ir.contexts.find((c) => c.id === id);
  if (ctx) return ctx.name;
  const ext = ir.externals?.find((e) => e.id === id);
  return ext ? ext.name : id.replace(/^(ctx|ext)-/, '');
}

function conditionText(ir: IntermediateRepresentation, policy: string): string | undefined {
  const cond = ir.contexts.flatMap((c) => c.policies).find((p) => p.name === policy)?.condition;
  if (!cond) return undefined;
  const parts: string[] = [];
  if (cond.field !== undefined) parts.push(`when ${cond.field} = ${cond.equals ?? ''}`);
  if (cond.after !== undefined) parts.push(`after ${cond.after}`);
  return parts.join(' ');
}

function placementsOf(
  ir: IntermediateRepresentation,
  flow: FlowDefinition,
): {
  nodes: ManifestNode[];
  edges: ManifestEdge[];
} {
  const frame = `thread-${flow.name}`;
  const nodes: ManifestNode[] = [
    { kind: 'flow', name: flow.name, context: '', role: 'definition', frame, path: 'flows[]' },
  ];
  const laneContext = (laneId?: string): string => {
    const lane = flow.lanes.find((l) => l.id === laneId);
    return lane ? contextNameOf(ir, lane.contextId) : '';
  };
  const place = (e: MomentEntry, momentName: string, arm?: string): ManifestNode => {
    const node: ManifestNode = {
      kind: e.nodeKind === 'saga' ? 'saga' : e.nodeKind,
      name: e.nodeName,
      context: contextNameOf(ir, e.contextId),
      role: 'placement',
      flow: flow.name,
      moment: momentName,
      frame,
      path:
        arm === undefined
          ? 'flows[].moments[].contextEntries[]'
          : 'flows[].moments[].branches[].entries[]',
    };
    if (e.cause !== undefined) node.cause = e.cause;
    if (e.exit !== undefined) node.exit = e.exit;
    if (e.terminal) node.terminal = true;
    if (e.optional) node.optional = true;
    if (arm !== undefined) node.arm = arm;
    if (e.nodeKind === 'policy') {
      const condition = conditionText(ir, e.nodeName);
      if (condition !== undefined) node.condition = condition;
    }
    return node;
  };
  for (const m of flow.moments) {
    nodes.push({
      kind: 'moment',
      name: m.name,
      context: '',
      role: 'definition',
      flow: flow.name,
      moment: m.name,
      frame,
      path: 'flows[].moments[]',
    });
    m.contextEntries.forEach((e) => nodes.push(place(e, m.name)));
    for (const note of m.notes ?? []) {
      nodes.push({
        kind: 'note',
        name: note.text,
        context: laneContext(note.laneId),
        role: 'placement',
        flow: flow.name,
        moment: m.name,
        frame,
        path: 'flows[].moments[].notes[]',
      });
    }
    for (const arm of m.branches ?? []) {
      nodes.push({
        kind: 'branch',
        name: arm.condition,
        context: '',
        role: 'definition',
        flow: flow.name,
        moment: m.name,
        frame,
        path: 'flows[].moments[].branches[]',
      });
      arm.entries.forEach((e) => nodes.push(place(e, m.name, arm.condition)));
    }
  }
  const edges: ManifestEdge[] = flow.connections
    .filter((c) => c.connectionType === 'triggered-by' || c.connectionType === 'triggers')
    .filter((c) => c.sourceNodeName !== undefined && c.targetNodeName !== undefined)
    .map((c) => ({
      kind: 'triggered-by' as const,
      from: c.sourceNodeName ?? '',
      to: c.targetNodeName ?? '',
      flow: flow.name,
    }));
  return { nodes, edges };
}

export function projectBoard(ir: IntermediateRepresentation): BoardProjection {
  const flows = ir.flows.map((f) => placementsOf(ir, f));
  const nodes = [...ir.contexts.flatMap(definitionsOf), ...flows.flatMap((f) => f.nodes)];
  const edges = flows.flatMap((f) => f.edges);
  return {
    frames: [],
    manifest: {
      manifestVersion: 1,
      specification: ir.metadata.name,
      frames: [],
      nodes,
      edges,
      unrendered: [],
    },
  };
}
