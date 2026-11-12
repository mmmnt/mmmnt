import type {
  AggregateDefinition,
  ConnectionDefinition,
  CommandDefinition,
  ContextDefinition,
  FlowDefinition,
  IntermediateRepresentation,
  LaneDefinition,
  MomentDefinition,
  MomentEntry,
  EmitsFields,
  PolicyConditionDefinition,
} from '@mmmnt/core';
import { emitOutcomes } from '@mmmnt/core';
import { FrameBuilder, GAP, HEADER_H, PAD, STICKY_H, STICKY_W } from './layout.js';
import { SWATCH, fillOf } from './palette.js';
import type { BoardFrame, BoardItem } from './types.js';

const CHIP_H = 28;

export function conditionText(cond: PolicyConditionDefinition | undefined): string | undefined {
  if (!cond) return undefined;
  const parts: string[] = [];
  if (cond.field !== undefined) parts.push(`when ${cond.field} = ${cond.equals ?? ''}`);
  if (cond.after !== undefined) parts.push(`after ${cond.after}`);
  return parts.length > 0 ? parts.join(' ') : undefined;
}

/** What the context frame needs of a command, an aggregate's or an orchestration's. */
type DrawnCommand = EmitsFields & Pick<CommandDefinition, 'name' | 'causes' | 'preconditions'>;

function causeChip(cmd: DrawnCommand): string | undefined {
  return cmd.causes && cmd.causes.length > 0 ? `causes ${cmd.causes.join(', ')}` : undefined;
}

/** A command, and to its right each outcome's events as a group carrying the state that chooses it. */
function commandRow(
  f: FrameBuilder,
  cmd: DrawnCommand,
  x: number,
  y: number,
  drawn: Set<string>,
): number {
  const cmdItem = f.node('command', cmd.name, x, y);
  const cause = causeChip(cmd);
  if (cause !== undefined) f.chip(cause, x, y + STICKY_H + 4);
  let ox = x + STICKY_W + GAP * 2;
  let stated = false;
  for (const outcome of emitOutcomes(cmd)) {
    const events = outcome.events.filter((e) => !drawn.has(e));
    if (events.length === 0) continue;
    if (outcome.whenState !== undefined) {
      stated = true;
      f.chip(`[${outcome.whenState}]`, ox, y - CHIP_H - 2, 90);
    }
    for (const name of events) {
      drawn.add(name);
      f.connect(cmdItem, f.node('event', name, ox, y));
      ox += STICKY_W + GAP;
    }
    ox += GAP;
  }
  const base = y + STICKY_H + CHIP_H + GAP + (stated ? CHIP_H : 0);
  return refusalRow(f, cmdItem, cmd, x, base);
}

/** A precondition is a refusal of the command; one scoped to causes carries them as a chip (ADR-040 D2). */
function refusalRow(
  f: FrameBuilder,
  cmdItem: BoardItem,
  cmd: DrawnCommand,
  x: number,
  y: number,
): number {
  cmd.preconditions.forEach((pre, i) => {
    const rx = x + i * (STICKY_W + GAP);
    f.connect(cmdItem, f.node('refusal', pre.name, rx, y), undefined, true);
    if (pre.causes && pre.causes.length > 0)
      f.chip(`cause ${pre.causes.join(', ')}`, rx, y + STICKY_H + 4);
  });
  return cmd.preconditions.length === 0 ? y : y + STICKY_H + CHIP_H + GAP;
}

function aggregateBlock(
  f: FrameBuilder,
  agg: AggregateDefinition,
  x: number,
  y: number,
  drawn: Set<string>,
): number {
  const before = f.items.length;
  const inner = x + GAP;
  let cy = y + GAP + 28;
  for (const cmd of agg.commands) cy = commandRow(f, cmd, inner, cy, drawn);
  const rest = agg.events.filter((e) => !drawn.has(e.name));
  rest.forEach((e, i) => {
    drawn.add(e.name);
    f.node('event', e.name, inner + i * (STICKY_W + GAP), cy);
  });
  if (rest.length > 0) cy += STICKY_H + GAP;
  cy = f.grid(
    'invariant',
    agg.invariants.map((i) => ({ text: `${i.id}: ${i.description}` })),
    inner,
    cy,
    4,
  );
  // The container is drawn first so the stickies sit in front of it.
  const w = Math.max(...f.items.slice(before).map((i) => i.x + i.w), inner + STICKY_W) - x + GAP;
  f.insertBehind(before, {
    kind: 'container',
    text: agg.name,
    x,
    y,
    w,
    h: cy - y,
    fill: fillOf('aggregate'),
  });
  return cy + GAP;
}

export function contextFrame(ctx: ContextDefinition): BoardFrame {
  const f = new FrameBuilder(`context-${ctx.name}`, ctx.name, 'context');
  f.header(ctx.classification ? `${ctx.name} · ${ctx.classification}` : ctx.name, 900);
  const drawn = new Set<string>();
  let y = HEADER_H + PAD;
  for (const agg of ctx.aggregates) y = aggregateBlock(f, agg, PAD, y, drawn);

  const ownCommands = new Set(ctx.aggregates.flatMap((a) => a.commands.map((c) => c.name)));
  const loose = ctx.commands.filter((c) => !ownCommands.has(c.name));
  y = f.grid(
    'command',
    loose.map((c) => ({
      text: c.name,
      ...(c.causes?.length ? { chip: `causes ${c.causes.join(', ')}` } : {}),
    })),
    PAD,
    y,
  );
  const looseEvents = ctx.events.filter((e) => !drawn.has(e.name));
  y = f.grid(
    'event',
    looseEvents.map((e) => ({ text: e.name })),
    PAD,
    y,
  );

  y = f.grid(
    'policy',
    ctx.policies.map((p) => {
      const chip = conditionText(p.condition);
      return { text: p.name, ...(chip !== undefined ? { chip } : {}) };
    }),
    PAD,
    y,
  );
  for (const saga of ctx.sagas) {
    f.node('saga', saga.name, PAD, y);
    y += STICKY_H + GAP * 2;
    for (const cmd of saga.commands ?? []) y = commandRow(f, cmd, PAD, y, drawn);
    const rest = (saga.events ?? []).filter((e) => !drawn.has(e.name));
    y = f.grid(
      'event',
      rest.map((e) => ({ text: e.name })),
      PAD,
      y,
    );
  }
  y = f.grid(
    'projection',
    (ctx.projections ?? []).map((p) => ({ text: p.name })),
    PAD,
    y,
  );
  y = f.grid(
    'query',
    (ctx.queries ?? []).map((q) => ({ text: q.name })),
    PAD,
    y,
  );
  y = f.grid(
    'rule',
    (ctx.rules ?? []).map((r) => ({
      text: `${r.id}: ${r.description}`,
      chip: `enforced by ${r.enforcedBy}`,
    })),
    PAD,
    y,
  );
  y = f.grid(
    'service',
    ctx.domainServices.map((s) => ({ text: s.name })),
    PAD,
    y,
  );
  return f.build(960);
}

function policyCondition(ir: IntermediateRepresentation, name: string): string | undefined {
  return conditionText(
    ir.contexts.flatMap((c) => c.policies).find((p) => p.name === name)?.condition,
  );
}

/** The chips a placed node carries: cause, exit, optional, multiplicity and a policy's condition. */
function entryChips(ir: IntermediateRepresentation, e: MomentEntry): string[] {
  const chips: string[] = [];
  if (e.cause !== undefined) chips.push(`cause ${e.cause}`);
  if (e.exit === 'outcome') chips.push('OUTCOME');
  else if (e.terminal) chips.push('TERMINAL');
  if (e.optional) chips.push('optional');
  if (e.multiplicity !== undefined) chips.push(`x${String(e.multiplicity)}`);
  const condition = e.nodeKind === 'policy' ? policyCondition(ir, e.nodeName) : undefined;
  if (condition !== undefined) chips.push(condition);
  return chips;
}

const entryHeight = (ir: IntermediateRepresentation, e: MomentEntry): number =>
  STICKY_H + GAP + entryChips(ir, e).length * (CHIP_H + 2);

export function momentMarker(m: MomentDefinition): 'terminal' | 'branch' | undefined {
  if (m.terminal) return 'terminal';
  return m.isBranch ? 'branch' : undefined;
}

const momentTitle = (m: MomentDefinition): string => {
  const marker = momentMarker(m);
  return marker === undefined ? m.name : `${m.name} [${marker}]`;
};

const LABEL_W = 160;
const COL_W = STICKY_W + GAP * 2;

interface ThreadGeometry {
  lanes: LaneDefinition[];
  rowY: number[];
  branchY: number;
  hasArms: boolean;
}

function laneIndex(lanes: LaneDefinition[], contextId: string): number {
  return Math.max(
    0,
    lanes.findIndex((l) => l.contextId === contextId),
  );
}

function noteLane(lanes: LaneDefinition[], laneId?: string): number {
  return Math.max(
    0,
    lanes.findIndex((l) => l.id === laneId),
  );
}

/** Row heights are the tallest stack any moment puts in a lane. */
function geometry(ir: IntermediateRepresentation, flow: FlowDefinition): ThreadGeometry {
  const lanes = flow.lanes.filter((l) => !l.isBranch);
  const rows = Math.max(lanes.length, 1);
  const stack = Array.from({ length: rows }, () => 0);
  let arms = 0;
  for (const m of flow.moments) {
    const here = Array.from({ length: rows }, () => 0);
    for (const e of m.contextEntries) here[laneIndex(lanes, e.contextId)]! += entryHeight(ir, e);
    for (const n of m.notes ?? []) here[noteLane(lanes, n.laneId)]! += STICKY_H + GAP;
    here.forEach((h, i) => (stack[i] = Math.max(stack[i]!, h)));
    let armH = 0;
    for (const arm of m.branches ?? []) {
      armH += CHIP_H + GAP + arm.entries.reduce((h, e) => h + entryHeight(ir, e), 0);
    }
    arms = Math.max(arms, armH);
  }
  const rowY: number[] = [];
  let y = PAD + HEADER_H;
  for (const h of stack) {
    rowY.push(y);
    y += Math.max(STICKY_H + GAP, h) + GAP;
  }
  return { lanes, rowY, branchY: y + GAP, hasArms: arms > 0 };
}

class Placements {
  private readonly byMoment = new Map<string, BoardItem>();
  private readonly byName = new Map<string, BoardItem>();

  add(moment: number, name: string, item: BoardItem): void {
    this.byMoment.set(`${moment}:${name}`, item);
    if (!this.byName.has(name)) this.byName.set(name, item);
  }

  /** The node as placed in this moment, else the nearest earlier moment, else anywhere. */
  find(name: string, moment: number): BoardItem | undefined {
    for (let m = moment; m >= 0; m--) {
      const hit = this.byMoment.get(`${m}:${name}`);
      if (hit) return hit;
    }
    return this.byName.get(name);
  }

  here(name: string, moment: number): BoardItem | undefined {
    return this.byMoment.get(`${moment}:${name}`);
  }
}

function drawEntry(
  f: FrameBuilder,
  ir: IntermediateRepresentation,
  placed: Placements,
  e: MomentEntry,
  moment: number,
  x: number,
  y: number,
): number {
  const item = f.node(e.nodeKind, e.nodeName, x, y);
  placed.add(moment, e.nodeName, item);
  let h = STICKY_H + GAP;
  for (const chip of entryChips(ir, e)) {
    f.chip(chip, x, y + h - GAP + 2);
    h += CHIP_H + 2;
  }
  return h;
}

function drawMoment(
  f: FrameBuilder,
  ir: IntermediateRepresentation,
  placed: Placements,
  g: ThreadGeometry,
  m: MomentDefinition,
  mi: number,
): void {
  const x = PAD + LABEL_W + mi * COL_W;
  const used = Array.from({ length: Math.max(g.lanes.length, 1) }, () => 0);
  for (const e of m.contextEntries) {
    const li = laneIndex(g.lanes, e.contextId);
    used[li]! += drawEntry(f, ir, placed, e, mi, x, g.rowY[li]! + used[li]!);
  }
  for (const n of m.notes ?? []) {
    const li = noteLane(g.lanes, n.laneId);
    f.node('note', n.text, x, g.rowY[li]! + used[li]!);
    used[li]! += STICKY_H + GAP;
  }
  let ay = g.branchY;
  for (const arm of m.branches ?? []) {
    f.add({
      kind: 'chip',
      text: `when ${arm.condition}`,
      x,
      y: ay,
      w: STICKY_W,
      h: CHIP_H,
      fill: SWATCH.refusal,
    });
    ay += CHIP_H + GAP;
    for (const e of arm.entries) ay += drawEntry(f, ir, placed, e, mi, x, ay);
  }
}

function isHop(c: ConnectionDefinition): boolean {
  const hop = c.connectionType === 'triggered-by' || c.connectionType === 'triggers';
  return hop && c.sourceNodeName !== undefined && c.targetNodeName !== undefined;
}

function drawHops(f: FrameBuilder, flow: FlowDefinition, placed: Placements): void {
  const momentIndex = new Map(flow.moments.map((m, i) => [m.id, i]));
  for (const c of flow.connections.filter(isHop)) {
    const mi = momentIndex.get(c.sourceMomentId) ?? 0;
    const target = c.targetNodeName ?? '';
    const from = placed.find(c.sourceNodeName ?? '', mi);
    const to = placed.here(target, mi) ?? placed.find(target, mi);
    if (from && to && from.id !== to.id) f.connect(from, to);
  }
}

export function threadFrame(ir: IntermediateRepresentation, flow: FlowDefinition): BoardFrame {
  const f = new FrameBuilder(`thread-${flow.name}`, flow.name, 'thread');
  const g = geometry(ir, flow);
  const placed = new Placements();
  f.add({
    kind: 'header',
    text: flow.name,
    x: PAD,
    y: PAD,
    w: LABEL_W - GAP,
    h: HEADER_H - GAP,
    fill: SWATCH.moment,
  });
  flow.moments.forEach((m, mi) => {
    f.add({
      kind: 'moment',
      text: m.name,
      x: PAD + LABEL_W + mi * COL_W,
      y: PAD,
      w: STICKY_W,
      h: HEADER_H - GAP,
      fill: fillOf('moment'),
    });
  });
  g.lanes.forEach((l, li) => {
    const text = l.classification ? `${l.label} [${l.classification}]` : l.label;
    f.add({
      kind: 'header',
      text,
      x: PAD,
      y: g.rowY[li]!,
      w: LABEL_W - GAP,
      h: STICKY_H,
      fill: SWATCH.interface,
    });
  });
  if (g.hasArms)
    f.add({
      kind: 'header',
      text: 'BRANCH',
      x: PAD,
      y: g.branchY,
      w: LABEL_W - GAP,
      h: STICKY_H,
      fill: SWATCH.refusal,
    });
  flow.moments.forEach((m, mi) => drawMoment(f, ir, placed, g, m, mi));
  drawHops(f, flow, placed);
  return f.build();
}

interface MapEntry {
  id: string;
  name: string;
  kind: 'context' | 'external';
  sub?: string;
}

export function contextMapFrame(ir: IntermediateRepresentation): BoardFrame {
  const f = new FrameBuilder('context-map', 'Context Map', 'context-map');
  f.header('Context Map', 700);
  const boxes = new Map<string, BoardItem>();
  const entries: MapEntry[] = [
    ...ir.contexts.map((c): MapEntry => ({
      id: c.id,
      name: c.name,
      kind: 'context',
      sub: c.classification,
    })),
    ...(ir.externals ?? []).map((e): MapEntry => ({ id: e.id, name: e.name, kind: 'external' })),
  ];
  const cols = 3;
  entries.forEach((e, i) => {
    const x = PAD + (i % cols) * (STICKY_W * 2 + GAP * 4);
    const y = HEADER_H + PAD + Math.floor(i / cols) * (STICKY_H * 2 + GAP * 3);
    const text = e.sub ? `${e.name} · ${e.sub}` : e.name;
    boxes.set(e.id, f.node(e.kind, text, x, y, STICKY_W * 2, STICKY_H + 20));
  });
  for (const r of ir.relationships) {
    const a = boxes.get(r.sourceContextId);
    const b = boxes.get(r.targetContextId);
    if (a && b) f.connect(a, b, r.relationshipType);
  }
  return f.build(760);
}

export function invariantCoverageFrame(ir: IntermediateRepresentation): BoardFrame {
  const f = new FrameBuilder('invariant-coverage', 'Invariant Coverage', 'invariant-coverage');
  f.header('Invariant Coverage', 700);
  let y = HEADER_H + PAD;
  for (const ctx of ir.contexts) {
    const items = [
      ...ctx.aggregates.flatMap((a) =>
        a.invariants.map((i) => ({
          text: `${i.id}: ${i.description}`,
          chip: `${ctx.name} · ${a.name}`,
        })),
      ),
      ...ctx.invariants
        .filter((i) => !ctx.aggregates.some((a) => a.invariants.some((x) => x.id === i.id)))
        .map((i) => ({ text: `${i.id}: ${i.description}`, chip: `${ctx.name} · ${i.scope}` })),
    ];
    y = f.grid('invariant', items, PAD, y, 4);
    y = f.grid(
      'rule',
      (ctx.rules ?? []).map((r) => ({
        text: `${r.id}: ${r.description}`,
        chip: `${ctx.name} · enforced by ${r.enforcedBy}`,
      })),
      PAD,
      y,
      4,
    );
  }
  return f.build(760);
}
