import type {
  ContextDefinition,
  FlowDefinition,
  IntermediateRepresentation,
  MomentDefinition,
  MomentEntry,
} from '@mmmnt/core';
import type { BoardContext } from './context.js';
import { contextNumber, frameIds } from './context.js';
import { armIds } from './numbering.js';
import type { NumberedFlow } from './numbering.js';
import type { NodeKind } from './palette.js';
import { refusalsOf } from './refusals.js';
import { conditionBracket } from './uses.js';
import type { ManifestEdge, ManifestNode } from './types.js';

export function contextNameOf(ir: IntermediateRepresentation, id: string): string {
  const ctx = ir.contexts.find((c) => c.id === id);
  if (ctx) return ctx.name;
  const ext = ir.externals?.find((e) => e.id === id);
  return ext ? ext.name : id.replace(/^(ctx|ext)-/, '');
}

/** The condition of a policy as written in a manifest: `f = v`, `after E`. */
export function conditionText(cond: Parameters<typeof conditionBracket>[0]): string | undefined {
  const bracket = conditionBracket(cond).trim();
  return bracket === '' ? undefined : bracket.slice(1, -1);
}

type Draft = Omit<ManifestNode, 'key'>;

function definitions(ctx: ContextDefinition, num: string): Draft[] {
  const out: Draft[] = [];
  const add = (
    kind: NodeKind,
    name: string,
    frame: string,
    path: string,
    more: Partial<Draft> = {},
  ): void => {
    out.push({ kind, name, context: ctx.name, role: 'definition', frame, path, ...more });
  };
  const refusalsOfCommand = (
    cmd: { name: string; preconditions: ContextDefinition['commands'][number]['preconditions'] },
    frame: string,
  ): void => {
    cmd.preconditions.forEach((pre) =>
      add('refusal', pre.name, frame, 'contexts[].commands[].preconditions[]', {
        of: cmd.name,
        ...(pre.causes && pre.causes.length > 0 && { cause: pre.causes.join(', ') }),
      }),
    );
  };
  const services = frameIds.services(num);
  const owned = new Set(ctx.aggregates.flatMap((a) => a.commands.map((c) => c.name)));
  const ownedEvents = new Set(ctx.aggregates.flatMap((a) => a.events.map((e) => e.name)));
  for (const a of ctx.aggregates) {
    const frame = frameIds.aggregate(a.name);
    add('aggregate', a.name, frame, 'contexts[].aggregates[]');
    a.commands.forEach((c) => {
      add('command', c.name, frame, 'contexts[].aggregates[].commands[]');
      refusalsOfCommand(c, frame);
    });
    a.events.forEach((e) => add('event', e.name, frame, 'contexts[].aggregates[].events[]'));
    a.invariants.forEach((v) =>
      add('invariant', v.id, frame, 'contexts[].aggregates[].invariants[]'),
    );
  }
  ctx.commands
    .filter((c) => !owned.has(c.name))
    .forEach((c) => {
      add('command', c.name, services, 'contexts[].commands[]');
      refusalsOfCommand(c, services);
    });
  ctx.events
    .filter((e) => !ownedEvents.has(e.name))
    .forEach((e) => add('event', e.name, services, 'contexts[].events[]'));
  ctx.domainServices.forEach((s) =>
    add('service', s.name, services, 'contexts[].domainServices[]'),
  );
  for (const s of ctx.sagas) {
    add('saga', s.name, services, 'contexts[].sagas[]');
    (s.commands ?? []).forEach((c) => {
      add('command', c.name, services, 'contexts[].sagas[].commands[]');
      refusalsOfCommand(c, services);
    });
    (s.events ?? []).forEach((e) => add('event', e.name, services, 'contexts[].sagas[].events[]'));
  }
  ctx.policies.forEach((p) => {
    const condition = conditionText(p.condition);
    add(
      'policy',
      p.name,
      frameIds.policies,
      'contexts[].policies[]',
      condition !== undefined ? { condition } : {},
    );
  });
  (ctx.projections ?? []).forEach((p) =>
    add('projection', p.name, frameIds.projections, 'contexts[].projections[]'),
  );
  (ctx.queries ?? []).forEach((q) =>
    add('query', q.name, frameIds.projections, 'contexts[].queries[]'),
  );
  const inAggregate = new Set(ctx.aggregates.flatMap((a) => a.invariants.map((i) => i.id)));
  ctx.invariants
    .filter((i) => !inAggregate.has(i.id))
    .forEach((i) => add('invariant', i.id, frameIds.coverage, 'contexts[].invariants[]'));
  (ctx.rules ?? []).forEach((r) => add('rule', r.id, frameIds.coverage, 'contexts[].rules[]'));
  return out;
}

function placement(
  ir: IntermediateRepresentation,
  flow: FlowDefinition,
  nf: NumberedFlow,
  m: MomentDefinition,
  momentId: string,
  e: MomentEntry,
  arm?: { id: string; condition: string },
): Draft {
  const policy =
    e.nodeKind === 'policy'
      ? ir.contexts.flatMap((c) => c.policies).find((p) => p.name === e.nodeName)
      : undefined;
  const condition = policy ? conditionText(policy.condition) : undefined;
  return {
    kind: e.nodeKind,
    name: e.nodeName,
    context: contextNameOf(ir, e.contextId),
    role: 'placement',
    flow: flow.name,
    moment: m.name,
    momentId,
    frame: frameIds.thread(nf.id),
    path: arm ? 'flows[].moments[].branches[].entries[]' : 'flows[].moments[].contextEntries[]',
    ...(e.cause !== undefined && { cause: e.cause }),
    ...(e.exit !== undefined && { exit: e.exit }),
    ...(e.terminal && { terminal: true }),
    ...(e.optional && { optional: true }),
    ...(arm && { arm: arm.id, armCondition: arm.condition }),
    ...(condition !== undefined && { condition }),
  };
}

function momentDrafts(
  ir: IntermediateRepresentation,
  flow: FlowDefinition,
  nf: NumberedFlow,
): Draft[] {
  const frame = frameIds.thread(nf.id);
  const out: Draft[] = [
    {
      kind: 'flow',
      name: flow.name,
      context: '',
      role: 'definition',
      flow: flow.name,
      frame,
      path: 'flows[]',
    },
  ];
  const laneContext = (laneId?: string): string => {
    const lane = flow.lanes.find((l) => l.id === laneId);
    return lane ? contextNameOf(ir, lane.contextId) : '';
  };
  flow.moments.forEach((m, mi) => {
    const momentId = nf.moments[mi]!.id;
    const marker = m.terminal
      ? ('terminal' as const)
      : m.isBranch
        ? ('branch' as const)
        : undefined;
    const base = { flow: flow.name, moment: m.name, momentId, frame };
    out.push({
      ...base,
      kind: 'moment',
      name: m.name,
      context: '',
      role: 'definition',
      path: 'flows[].moments[]',
      ...(marker && { marker }),
    });
    const seen = new Set<string>();
    const refuse = (e: MomentEntry, arm?: { id: string; condition: string }): void => {
      for (const pre of refusalsOf(ir, e)) {
        const key = `${e.nodeName}|${pre.name}|${arm?.id ?? ''}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          ...base,
          kind: 'refusal',
          name: pre.name,
          context: contextNameOf(ir, e.contextId),
          role: 'placement',
          path: 'flows[].moments[].contextEntries[]',
          of: e.nodeName,
          ...(pre.causes && pre.causes.length > 0 && { cause: pre.causes.join(', ') }),
          ...(arm && { arm: arm.id, armCondition: arm.condition }),
        });
      }
    };
    m.contextEntries.forEach((e) => {
      out.push(placement(ir, flow, nf, m, momentId, e));
      refuse(e);
    });
    (m.notes ?? []).forEach((n) =>
      out.push({
        ...base,
        kind: 'note',
        name: n.text,
        context: laneContext(n.laneId),
        role: 'placement',
        path: 'flows[].moments[].notes[]',
      }),
    );
    const ids = armIds(momentId, m.branches ?? []);
    (m.branches ?? []).forEach((arm, ai) => {
      const id = ids[ai];
      if (id === undefined) return;
      const armRef = { id, condition: arm.condition };
      out.push({
        ...base,
        kind: 'branch',
        name: arm.condition,
        context: '',
        role: 'definition',
        path: 'flows[].moments[].branches[]',
        arm: id,
        armCondition: arm.condition,
      });
      arm.entries.forEach((e) => {
        out.push(placement(ir, flow, nf, m, momentId, e, armRef));
        refuse(e, armRef);
      });
    });
  });
  return out;
}

/** Stable address of a node; a repeat in one frame gets a `#n` suffix. */
export function assignKeys(drafts: Draft[]): ManifestNode[] {
  const seen = new Map<string, number>();
  return drafts.map((d) => {
    const base = [d.frame, d.kind, d.name, d.context, d.momentId ?? '', d.arm ?? ''].join('|');
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return { ...d, key: n === 1 ? base : `${base}#${n}` };
  });
}

export function buildNodes(bc: BoardContext): ManifestNode[] {
  const { ir } = bc;
  const mapNodes: Draft[] = [
    ...ir.contexts.map((c): Draft => ({
      kind: 'context',
      name: c.name,
      context: c.name,
      role: 'definition',
      frame: frameIds.map,
      path: 'contexts[]',
    })),
    ...(ir.externals ?? []).map((e): Draft => ({
      kind: 'external',
      name: e.name,
      context: e.name,
      role: 'definition',
      frame: frameIds.map,
      path: 'externals[]',
    })),
  ];
  const drafts = [
    ...mapNodes,
    ...ir.contexts.flatMap((c) => definitions(c, contextNumber(bc, c.name).number)),
    ...ir.flows.flatMap((f, i) => momentDrafts(ir, f, bc.flows[i]!)),
  ];
  return assignKeys(drafts);
}

export function buildEdges(ir: IntermediateRepresentation): ManifestEdge[] {
  const context = ir.contexts.flatMap((ctx): ManifestEdge[] => {
    const edge = (kind: ManifestEdge['kind'], from: string, to: string): ManifestEdge => ({
      kind,
      from,
      to,
      context: ctx.name,
    });
    return [
      ...ctx.policies.flatMap((p) => [
        edge('triggers', p.trigger, p.name),
        ...(p.chainsTo ? [edge('chains-to', p.name, p.chainsTo)] : []),
      ]),
      ...(ctx.projections ?? []).flatMap((p) => p.sources.map((s) => edge('feeds', s, p.name))),
      ...(ctx.queries ?? []).flatMap((q) => q.reads.map((r) => edge('reads', q.name, r))),
    ];
  });
  const relationships = ir.relationships.map((r): ManifestEdge => ({
    kind: 'relationship',
    from: contextNameOf(ir, r.sourceContextId),
    to: contextNameOf(ir, r.targetContextId),
    label: r.relationshipType,
  }));
  const flows = ir.flows.flatMap((flow): ManifestEdge[] =>
    flow.connections.flatMap((c): ManifestEdge[] => {
      if (c.connectionType === 'crosses-to') {
        return [
          {
            kind: 'crosses-to',
            from: c.sourceNodeName ?? '',
            to: contextNameOf(ir, c.targetContextId),
            flow: flow.name,
            label: c.schemaContract.eventType,
          },
        ];
      }
      const hop =
        (c.connectionType === 'triggered-by' || c.connectionType === 'triggers') &&
        c.sourceNodeName !== undefined &&
        c.targetNodeName !== undefined;
      return hop
        ? [
            {
              kind: 'triggered-by',
              from: c.sourceNodeName ?? '',
              to: c.targetNodeName ?? '',
              flow: flow.name,
            },
          ]
        : [];
    }),
  );
  return [...context, ...relationships, ...flows];
}
