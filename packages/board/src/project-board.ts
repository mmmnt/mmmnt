import type {
  IntermediateRepresentation,
  ContextDefinition,
  FlowDefinition,
  MomentDefinition,
  MomentEntry,
} from '@mmmnt/core';
import type { NodeKind } from './palette.js';
import {
  conditionText,
  contextFrame,
  contextMapFrame,
  invariantCoverageFrame,
  threadFrame,
} from './frames.js';
import type { BoardFrame, BoardProjection, ManifestEdge, ManifestNode } from './types.js';

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

function placementNode(
  ir: IntermediateRepresentation,
  flow: FlowDefinition,
  e: MomentEntry,
  momentName: string,
  arm?: string,
): ManifestNode {
  const condition =
    e.nodeKind === 'policy'
      ? conditionText(
          ir.contexts.flatMap((c) => c.policies).find((p) => p.name === e.nodeName)?.condition,
        )
      : undefined;
  return {
    kind: e.nodeKind,
    name: e.nodeName,
    context: contextNameOf(ir, e.contextId),
    role: 'placement',
    flow: flow.name,
    moment: momentName,
    frame: `thread-${flow.name}`,
    path:
      arm === undefined
        ? 'flows[].moments[].contextEntries[]'
        : 'flows[].moments[].branches[].entries[]',
    ...(e.cause !== undefined && { cause: e.cause }),
    ...(e.exit !== undefined && { exit: e.exit }),
    ...(e.terminal && { terminal: true }),
    ...(e.optional && { optional: true }),
    ...(arm !== undefined && { arm }),
    ...(condition !== undefined && { condition }),
  };
}

function momentNodes(
  ir: IntermediateRepresentation,
  flow: FlowDefinition,
  m: MomentDefinition,
): ManifestNode[] {
  const base = {
    role: 'definition' as const,
    flow: flow.name,
    moment: m.name,
    frame: `thread-${flow.name}`,
  };
  const laneContext = (laneId?: string): string => {
    const lane = flow.lanes.find((l) => l.id === laneId);
    return lane ? contextNameOf(ir, lane.contextId) : '';
  };
  return [
    { ...base, kind: 'moment', name: m.name, context: '', path: 'flows[].moments[]' },
    ...m.contextEntries.map((e) => placementNode(ir, flow, e, m.name)),
    ...(m.notes ?? []).map((n): ManifestNode => ({
      ...base,
      role: 'placement',
      kind: 'note',
      name: n.text,
      context: laneContext(n.laneId),
      path: 'flows[].moments[].notes[]',
    })),
    ...(m.branches ?? []).flatMap((arm) => [
      {
        ...base,
        kind: 'branch' as const,
        name: arm.condition,
        context: '',
        path: 'flows[].moments[].branches[]',
      },
      ...arm.entries.map((e) => placementNode(ir, flow, e, m.name, arm.condition)),
    ]),
  ];
}

function placementsOf(
  ir: IntermediateRepresentation,
  flow: FlowDefinition,
): {
  nodes: ManifestNode[];
  edges: ManifestEdge[];
} {
  const flowNode: ManifestNode = {
    kind: 'flow',
    name: flow.name,
    context: '',
    role: 'definition',
    frame: `thread-${flow.name}`,
    path: 'flows[]',
  };
  const edges: ManifestEdge[] = flow.connections
    .filter((c) => c.connectionType === 'triggered-by' || c.connectionType === 'triggers')
    .filter((c) => c.sourceNodeName !== undefined && c.targetNodeName !== undefined)
    .map((c) => ({
      kind: 'triggered-by' as const,
      from: c.sourceNodeName ?? '',
      to: c.targetNodeName ?? '',
      flow: flow.name,
    }));
  return { nodes: [flowNode, ...flow.moments.flatMap((m) => momentNodes(ir, flow, m))], edges };
}

export function projectBoard(ir: IntermediateRepresentation): BoardProjection {
  const flows = ir.flows.map((f) => placementsOf(ir, f));
  const frames: BoardFrame[] = [
    ...ir.contexts.map(contextFrame),
    ...ir.flows.map((f) => threadFrame(ir, f)),
    contextMapFrame(ir),
    invariantCoverageFrame(ir),
  ];
  const mapNodes: ManifestNode[] = [
    ...ir.contexts.map((c) => ({
      kind: 'context' as const,
      name: c.name,
      context: c.name,
      role: 'definition' as const,
      frame: 'context-map',
      path: 'contexts[]',
    })),
    ...(ir.externals ?? []).map((e) => ({
      kind: 'external' as const,
      name: e.name,
      context: e.name,
      role: 'definition' as const,
      frame: 'context-map',
      path: 'externals[]',
    })),
  ];
  const nodes = [
    ...mapNodes,
    ...ir.contexts.flatMap(definitionsOf),
    ...flows.flatMap((f) => f.nodes),
  ];
  const edges: ManifestEdge[] = [
    ...ir.relationships.map((r) => ({
      kind: 'relationship' as const,
      from: contextNameOf(ir, r.sourceContextId),
      to: contextNameOf(ir, r.targetContextId),
      label: r.relationshipType,
    })),
    ...flows.flatMap((f) => f.edges),
  ];
  return {
    frames,
    manifest: {
      manifestVersion: 1,
      specification: ir.metadata.name,
      frames: frames.map((f) => ({ id: f.id, title: f.title, kind: f.kind })),
      nodes,
      edges,
      unrendered: [],
    },
  };
}
