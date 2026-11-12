import type {
  BranchDefinition,
  ContextDefinition,
  FlowDefinition,
  MomentDefinition,
  MomentEntry,
  PreconditionDefinition,
} from '@mmmnt/core';
import { emitOutcomes } from '@mmmnt/core';
import type { BoardContext } from './context.js';
import { claim, contextNumber, frameIds } from './context.js';
import { contextNameOf } from './nodes.js';
import type { NodeKind } from './palette.js';
import { FrameBuilder } from './layout.js';
import { armIds } from './numbering.js';
import type { NumberedFlow } from './numbering.js';
import type { PointerIndex } from './pointers.js';
import { refusalsOf } from './refusals.js';
import {
  commandText,
  eventText,
  noteText,
  placementSuffix,
  policyText,
  refusalText,
  terminalText,
} from './uses.js';
import type { BoardFrame, BoardItem } from './types.js';

const X0 = 220;
const COL = 320;
const W = 259;
const H = 169;
const STACK = 189;
const BANNER_Y = 100;
const LABEL_Y = 170;
const ROWS_Y = 290;

type Entity = { kind: MomentEntry['nodeKind']; text: string };

function definitionText(ctx: ContextDefinition | undefined, e: MomentEntry): string {
  const suffix = placementSuffix(e);
  const name = e.nodeName;
  if (!ctx) return `${name}${suffix}`;
  if (e.nodeKind === 'command') {
    const cmd = [
      ...ctx.aggregates.flatMap((a) => a.commands),
      ...ctx.commands,
      ...ctx.sagas.flatMap((s) => s.commands ?? []),
    ].find((c) => c.name === name);
    const head = commandText({
      name: `${name}${suffix}`,
      causes: e.cause === undefined ? undefined : [e.cause],
      outcomes: cmd ? emitOutcomes(cmd) : [],
    });
    return head;
  }
  if (e.nodeKind === 'event') {
    const ev = [
      ...ctx.events,
      ...ctx.aggregates.flatMap((a) => a.events),
      ...ctx.sagas.flatMap((s) => s.events ?? []),
    ].find((x) => x.name === name);
    return `${eventText(name, ev?.owner)}${suffix}`;
  }
  if (e.nodeKind === 'policy') {
    const p = ctx.policies.find((x) => x.name === name);
    return p ? `${policyText(p)}${suffix}` : `${name}${suffix}`;
  }
  return `${name}${suffix}`;
}

const isExternal = (bc: BoardContext, id: string): boolean =>
  !bc.ir.contexts.some((c) => c.id === id);

/** The context a moment happens in: the first real context among its entries, else its first note's lane. */
function homeContext(
  bc: BoardContext,
  flow: FlowDefinition,
  m: MomentDefinition,
): string | undefined {
  const entry = [...m.contextEntries, ...(m.branches ?? []).flatMap((b) => b.entries)].find(
    (e) => !isExternal(bc, e.contextId),
  );
  if (entry) return bc.ir.contexts.find((c) => c.id === entry.contextId)?.name;
  const lane = flow.lanes.find((l) => l.id === m.notes?.[0]?.laneId);
  return lane ? bc.ir.contexts.find((c) => c.id === lane.contextId)?.name : undefined;
}

function isPersonNote(bc: BoardContext, flow: FlowDefinition, laneId?: string): boolean {
  if (laneId === undefined) return true;
  const lane = flow.lanes.find((l) => l.id === laneId);
  return !lane || lane.classification === 'External' || isExternal(bc, lane.contextId);
}

class Thread {
  readonly f: FrameBuilder;
  readonly frameId: string;
  private readonly stickies = new Map<string, BoardItem>();

  constructor(
    readonly bc: BoardContext,
    readonly flow: FlowDefinition,
    readonly nf: NumberedFlow,
    readonly ptr: PointerIndex,
  ) {
    this.frameId = frameIds.thread(nf.id);
    this.f = new FrameBuilder(this.frameId, `${nf.id} - ${nf.title}`, 'thread', nf.id, 'name');
  }

  ctxOf(e: MomentEntry): ContextDefinition | undefined {
    return this.bc.ir.contexts.find((c) => c.id === e.contextId);
  }

  /** Marks an item as the drawing of a manifest node of this frame. */
  own<T extends BoardItem>(
    item: T,
    kind: NodeKind,
    name: string,
    context: string,
    momentId?: string,
    arm?: string,
  ): T {
    return claim(this.bc, item, this.frameId, kind, name, context, momentId, arm);
  }

  point(
    item: BoardItem,
    kind: Parameters<PointerIndex['find']>[0],
    name: string,
    context: string,
    momentId: string,
  ): void {
    const p = this.ptr.find(kind, name, context, momentId);
    if (p !== undefined) this.f.pointer(p, item.x, item.y + item.h + 2, item.w);
  }

  entrySticky(
    e: MomentEntry,
    x: number,
    y: number,
    momentId: string,
    terminal: boolean,
    arm?: string,
  ): BoardItem {
    const ctx = this.ctxOf(e);
    const text = definitionText(ctx, e);
    const context = contextNameOf(this.bc.ir, e.contextId);
    const item = this.own(
      this.f.sticky(e.nodeKind, terminal ? terminalText(text) : text, x, y, W, H),
      e.nodeKind,
      e.nodeName,
      context,
      momentId,
      arm,
    );
    this.point(item, e.nodeKind, e.nodeName, ctx?.name ?? '', momentId);
    this.stickies.set(`${momentId}|${e.nodeName}`, item);
    return item;
  }

  find(momentId: string, name: string): BoardItem | undefined {
    return this.stickies.get(`${momentId}|${name}`);
  }
}

interface NoteRef {
  text: string;
  /** The lane label the note speaks for, and the context that lane belongs to. */
  lane?: string;
  context: string;
  raw: string;
}

interface RefusalRef {
  e: MomentEntry;
  pre: PreconditionDefinition;
  arm?: string;
}

interface Column {
  m: MomentDefinition;
  id: string;
  title: string;
  x: number;
  home: string | undefined;
  system: { e?: MomentEntry; note?: NoteRef }[];
  person: NoteRef[];
  arms: { arm: BranchDefinition; id: string }[];
  refusals: RefusalRef[];
}

function refusalRefs(bc: BoardContext, entries: MomentEntry[], arm?: string): RefusalRef[] {
  return entries.flatMap((e) =>
    refusalsOf(bc.ir, e).map((pre) => ({ e, pre, ...(arm !== undefined && { arm }) })),
  );
}

function columns(t: Thread): Column[] {
  const { bc, flow, nf } = t;
  return flow.moments.map((m, i) => {
    const id = nf.moments[i]!.id;
    const ids = armIds(id, m.branches ?? []);
    const noteRef = (n: { text: string; laneId?: string }): NoteRef => {
      const lane = flow.lanes.find((l) => l.id === n.laneId);
      return {
        text: noteText(n.text, lane?.label),
        raw: n.text,
        ...(lane && { lane: lane.label }),
        context: lane ? contextNameOf(bc.ir, lane.contextId) : '',
      };
    };
    const notes = m.notes ?? [];
    const arms = (m.branches ?? []).flatMap((arm, k) =>
      ids[k] === undefined ? [] : [{ arm, id: ids[k]! }],
    );
    const refs = [
      ...refusalRefs(bc, m.contextEntries),
      ...arms.flatMap((a) => refusalRefs(bc, a.arm.entries, a.id)),
    ];
    const seen = new Set<string>();
    const refusals = refs.filter((r) => {
      const key = `${r.e.nodeName}|${r.pre.name}|${r.arm ?? ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return {
      m,
      id,
      title: nf.moments[i]!.title,
      x: X0 + i * COL,
      home: homeContext(bc, flow, m),
      system: [
        ...m.contextEntries.map((e) => ({ e })),
        ...notes
          .filter((n) => !isPersonNote(bc, flow, n.laneId))
          .map((n) => ({ note: noteRef(n) })),
      ],
      person: notes.filter((n) => isPersonNote(bc, flow, n.laneId)).map(noteRef),
      arms,
      refusals,
    };
  });
}

function drawStack(t: Thread, c: Column, y: number): number {
  let cy = y;
  let prev: BoardItem | undefined;
  c.system.forEach((s, i) => {
    const last = i === c.system.length - 1;
    const terminal = c.m.terminal === true && last && s.e !== undefined;
    let item: BoardItem;
    if (s.e) item = t.entrySticky(s.e, c.x, cy, c.id, terminal);
    else
      item = t.own(
        t.f.sticky('note', s.note!.text, c.x, cy, W, H),
        'note',
        s.note!.raw,
        s.note!.context,
        c.id,
      );
    if (prev) t.f.connect(prev, item, { shape: 'straight' });
    prev = item;
    cy += STACK;
  });
  return cy;
}

function drawBranch(t: Thread, c: Column, momentSticky: BoardItem, y: number): number {
  let cy = y;
  for (const { arm, id } of c.arms) {
    const label = t.own(
      t.f.text(`${id} when ${arm.condition}`, c.x, cy, W, 14, true),
      'branch',
      arm.condition,
      '',
      c.id,
      id,
    );
    cy += label.h + 10;
    for (const e of arm.entries) {
      const item = t.entrySticky(e, c.x, cy, c.id, false, id);
      t.f.connect(momentSticky, item, { dashed: true, shape: 'elbowed' });
      cy += STACK;
    }
  }
  for (const r of c.refusals) {
    const context = contextNameOf(t.bc.ir, r.e.contextId);
    const item = t.own(
      t.f.sticky('refusal', refusalText(r.pre, r.e.nodeName), c.x, cy, W, H),
      'refusal',
      r.pre.name,
      context,
      c.id,
      r.arm,
    );
    t.point(item, 'refusal', r.pre.name, t.ctxOf(r.e)?.name ?? '', c.id);
    t.f.connect(momentSticky, item, { dashed: true, shape: 'elbowed' });
    cy += STACK;
  }
  return cy;
}

function exitOf(c: Column, arm: BranchDefinition): string {
  const hit = [...arm.entries].reverse().find((e) => e.terminal === true || e.exit === 'outcome');
  if (!hit) return 'continues';
  return `${hit.exit === 'outcome' ? '[outcome]' : '[terminal]'} ${hit.nodeName} @ ${c.id}`;
}

function drawTable(
  t: Thread,
  cols: Column[],
  y: number,
  arms: number,
  branchMoments: number,
): number {
  let cy = y;
  t.f.text(
    `Branches of ${t.nf.id} (${arms} arms in ${branchMoments} branch moments): one row each.`,
    40,
    cy,
    2400,
    22,
    true,
  );
  cy += 50;
  t.f.text('ARM', 40, cy, 1200, 13, true);
  t.f.text('SPEC LINES', 1300, cy, 400, 13, true);
  t.f.text('EXIT', 1750, cy, 1500, 13, true);
  cy += 30;
  for (const c of cols) {
    for (const { arm, id } of c.arms) {
      const pointer = t.ptr.find('branch', arm.condition, '', c.id) ?? '';
      t.f.text(`${id} ${arm.condition} (branch ${c.id})`, 40, cy, 1200, 13);
      t.f.text(pointer, 1300, cy, 400, 13);
      t.f.text(exitOf(c, arm), 1750, cy, 1500, 13);
      cy += 30;
    }
  }
  return cy;
}

/** The rows of the thread above SYSTEM: INTERACTION (when a person acts), MOMENTS (moments with no home context), one per context. */
function drawMomentRows(
  t: Thread,
  cols: Column[],
  y0: number,
): { y: number; stickies: BoardItem[]; hasPerson: boolean } {
  const { bc, flow, nf } = t;
  const label = (text: string, ry: number): void => void t.f.text(text, 40, ry, 170, 18, true);
  const hasPerson =
    cols.some((c) => c.person.length > 0) ||
    flow.moments.some((m) => m.contextEntries.some((e) => isExternal(bc, e.contextId)));
  const stickies: BoardItem[] = [];
  let y = y0;
  if (hasPerson) {
    label('INTERACTION', y);
    const rows = Math.max(1, ...cols.map((c) => c.person.length));
    cols.forEach((c) =>
      c.person.forEach((n, i) =>
        t.own(
          t.f.sticky('note', n.text, c.x, y + i * STACK, W, H, 'action'),
          'note',
          n.raw,
          n.context,
          c.id,
        ),
      ),
    );
    y += rows * STACK + 40;
  }
  const momentSticky = (c: Column, ry: number): BoardItem =>
    t.own(
      t.f.sticky('moment', `${c.id} - ${c.title}`, c.x, ry, W, H),
      'moment',
      c.m.name,
      '',
      c.id,
    );
  const homeless = cols.filter((c) => c.home === undefined);
  if (homeless.length > 0) {
    label('MOMENTS', y);
    homeless.forEach((c) => (stickies[cols.indexOf(c)] = momentSticky(c, y)));
    y += STACK + 40;
  }
  for (const name of [
    ...new Set(cols.map((c) => c.home).filter((h): h is string => h !== undefined)),
  ]) {
    label(`${contextNumber(bc, name).number} ${name}`, y);
    cols
      .filter((c) => c.home === name)
      .forEach((c) => (stickies[cols.indexOf(c)] = momentSticky(c, y)));
    y += STACK + 40;
  }
  void nf;
  return { y, stickies, hasPerson };
}

export function threadFrame(
  bc: BoardContext,
  flow: FlowDefinition,
  nf: NumberedFlow,
  ptr: PointerIndex,
): BoardFrame {
  const t = new Thread(bc, flow, nf, ptr);
  const cols = columns(t);
  const arms = cols.reduce((n, c) => n + c.arms.length, 0);
  const branchMoments = cols.filter((c) => c.arms.length > 0).length;
  const refusals = cols.reduce((n, c) => n + c.refusals.length, 0);
  t.own(t.f.text(`${nf.id} - ${nf.title}`, 40, 36, 1800, 22, true), 'flow', flow.name, '');
  t.f.text(
    `${cols.length} moments, ${arms} arms in ${branchMoments} branch moments, ${refusals} refusals.`,
    40,
    73,
    900,
    12,
  );
  cols.forEach((c) => t.f.text(`${c.id} - ${c.title}`, c.x, LABEL_Y, W, 17));

  const rows = drawMomentRows(t, cols, ROWS_Y);
  const label = (text: string, ry: number): void => void t.f.text(text, 40, ry, 170, 18, true);
  let y = rows.y;
  label('SYSTEM', y);
  y = Math.max(y + STACK, ...cols.map((c) => drawStack(t, c, y))) + 40;
  label('BRANCH', y);
  y = Math.max(y + STACK, ...cols.map((c, i) => drawBranch(t, c, rows.stickies[i]!, y))) + 40;
  cols.forEach((c, i) => {
    const prev = cols[i - 1];
    if (i > 0 && (c.m.isBranch === true || prev?.m.isBranch === true)) {
      t.f.connect(rows.stickies[i - 1]!, rows.stickies[i]!, { shape: 'straight' });
    }
    if (c.m.terminal === true) {
      const last = c.system.filter((s) => s.e).pop()?.e;
      t.f.shape(
        'banner',
        `${c.id} - ${c.title} (terminal)${last ? ` - ${last.nodeName} (terminal)` : ''}`,
        c.x,
        BANNER_Y,
        W,
        60,
        { textColor: '#ffffff', fontSize: 14 },
      );
    }
  });
  drawHops(t, cols);
  if (arms > 0) y = drawTable(t, cols, y, arms, branchMoments);
  return t.f.build(X0 + cols.length * COL, y + 260);
}

function isHop(c: FlowDefinition['connections'][number]): boolean {
  const hop = c.connectionType === 'triggered-by' || c.connectionType === 'triggers';
  return hop && c.sourceNodeName !== undefined && c.targetNodeName !== undefined;
}

/** Pairs of consecutive entries in one stack: those hops are the stack's own connectors. */
function stackPairs(cols: Column[]): Set<string> {
  const pairs = new Set<string>();
  for (const c of cols) {
    c.system.forEach((s, i) => {
      const next = c.system[i + 1];
      if (s.e && next?.e) pairs.add(`${c.id}|${s.e.nodeName}|${next.e.nodeName}`);
    });
  }
  return pairs;
}

/** The source of a hop: the node as placed in its moment, else in the nearest earlier one. */
function earlier(t: Thread, cols: Column[], from: number, name: string): BoardItem | undefined {
  for (let k = from; k >= 0; k--) {
    const hit = t.find(cols[k]!.id, name);
    if (hit) return hit;
  }
  return undefined;
}

function drawHops(t: Thread, cols: Column[]): void {
  const idOf = new Map(t.flow.moments.map((m, i) => [m.id, cols[i]!.id]));
  const pairs = stackPairs(cols);
  for (const conn of t.flow.connections.filter(isHop)) {
    const mid = idOf.get(conn.sourceMomentId);
    const source = conn.sourceNodeName ?? '';
    const target = conn.targetNodeName ?? '';
    if (mid === undefined || pairs.has(`${mid}|${source}|${target}`)) continue;
    const from = earlier(
      t,
      cols,
      cols.findIndex((c) => c.id === mid),
      source,
    );
    const to = t.find(mid, target);
    if (from && to && from !== to) t.f.connect(from, to, { shape: 'elbowed' });
  }
}
