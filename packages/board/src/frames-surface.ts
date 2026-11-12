import type { ContextDefinition } from '@mmmnt/core';
import { emitOutcomes } from '@mmmnt/core';
import type { BoardContext } from './context.js';
import { claim, contextNumber, frameIds } from './context.js';
import { FrameBuilder, GAP } from './layout.js';
import { KIND_SWATCH, OPTIONAL_SWATCH, STICKY_COLOR, SWATCH } from './palette.js';
import type { SwatchName } from './palette.js';
import type { PointerIndex } from './pointers.js';
import { USES, commandText, eventText, policyText, refusalText } from './uses.js';
import type { BoardFrame, BoardItem } from './types.js';

const W = 240;
const H = 156;
const COLS = 5;

const LEGEND: { label: string; swatch: SwatchName; use: string }[] = [
  { label: 'Moment', swatch: 'moment', use: 'a column of a thread; the moment sticky' },
  { label: 'Interface', swatch: 'interface', use: 'a lane note' },
  { label: 'Action', swatch: 'action', use: 'a person note (INTERACTION row)' },
  {
    label: 'Business rule / refusal',
    swatch: 'refusal',
    use: 'a precondition, an invariant, a rule',
  },
  { label: 'Process / policy', swatch: 'policy', use: 'a policy, an orchestration' },
  { label: 'External system', swatch: 'external', use: 'a system we depend on' },
  { label: 'Command', swatch: 'command', use: 'emits A, B | A when S' },
  { label: 'Event', swatch: 'event', use: 'Process-owned: [Process: Owner]' },
  { label: 'Projection', swatch: 'projection', use: 'a read model and what it folds' },
  { label: 'Resolver / query', swatch: 'query', use: 'a query and what it reads' },
];

/** Grid placement of stickies from (x, y); returns the y below the last row. */
function grid<T>(
  f: FrameBuilder,
  items: T[],
  x: number,
  y: number,
  draw: (item: T, px: number, py: number) => BoardItem | undefined,
): number {
  items.forEach((it, i) =>
    draw(it, x + (i % COLS) * (W + GAP), y + Math.floor(i / COLS) * (H + GAP)),
  );
  return items.length === 0 ? y : y + Math.ceil(items.length / COLS) * (H + GAP);
}

export function legendFrame(): BoardFrame {
  const f = new FrameBuilder(frameIds.legend, 'Legend & Reading Guide', 'legend');
  LEGEND.forEach((e, i) => {
    f.shape('swatch', '', 50, 60 + i * 90, 100, 60, { fill: SWATCH[e.swatch] });
    f.text(
      `${e.label}: ${STICKY_COLOR[e.swatch]} ${SWATCH[e.swatch]}\n${e.use}`,
      180,
      66 + i * 90,
      1100,
      18,
      true,
    );
  });
  const extra: [string, string][] = [
    ['Data Store (optional)', OPTIONAL_SWATCH.dataStore],
    ['Component, domain service (optional)', OPTIONAL_SWATCH.component],
  ];
  extra.forEach(([label, hex], i) => {
    f.shape('swatch', '', 50, 60 + (LEGEND.length + i) * 90, 100, 60, { fill: hex });
    f.text(`${label}: ${hex}`, 180, 76 + (LEGEND.length + i) * 90, 1100, 18, true);
  });
  const y = 60 + (LEGEND.length + extra.length) * 90 + 20;
  f.text('Aggregate = white with a black outline. Bounded context = frame.', 50, y, 1250, 17);
  f.text(
    'Sticky colors are nearest named approximations; the swatches above show the canonical hexes.',
    50,
    y + 40,
    1250,
    17,
  );
  f.text(
    'Reading order: contexts, relationships, command flows (Command, Aggregate, Event), policies, projections, invariant coverage.',
    50,
    y + 80,
    1250,
    17,
  );
  f.text(
    'Hotspot, RULED and DISCOVERED stickies are made by hand and are never generated; each frame ends in a free band for them.',
    50,
    y + 120,
    1250,
    17,
  );
  return f.build(1400);
}

export function grammarFrame(bc: BoardContext): BoardFrame {
  const f = new FrameBuilder(frameIds.grammar, 'Grammar & Workshop Rules', 'grammar');
  const paragraphs = [
    'COLUMNS. Columns are moments: time flows left to right. A thread ends at a terminal banner; an arm ends [outcome] or [terminal].',
    'ROWS. SYSTEM stacks the building blocks of a moment; BRANCH holds refusals and arms; INTERACTION appears only where a person acts.',
    'PROVENANCE. Every item is derived from the model (the .moment files); an addition made by hand is discovered, a removal is challenged.',
    'SPEC-TRUTH LAW. No spec text on the board; a pointer under a sticky names where the spec lives.',
    `THREADS. ${bc.flows.map((fl) => `${fl.id} ${fl.title}`).join(' | ')}`,
    `USES (no new swatch). ${USES.map((u) => `${u.construct}: ${u.text}`).join('. ')}.`,
  ];
  let y = 50;
  for (const p of paragraphs) {
    const t = f.text(p, 50, y, 1650, 18);
    y += t.h + 30;
  }
  return f.build(1750);
}

export function contextMapFrame(bc: BoardContext): BoardFrame {
  const { ir } = bc;
  const f = new FrameBuilder(frameIds.map, 'Context Map', 'context-map');
  const boxes = new Map<string, BoardItem>();
  (ir.externals ?? []).forEach((e, i) => {
    boxes.set(
      e.id,
      f.shape(
        'external',
        e.description ? `${e.name} - ${e.description}` : e.name,
        40 + i * 400,
        140,
        360,
        110,
        { fontSize: 14 },
      ),
    );
  });
  ir.contexts.forEach((c, i) => {
    const cn = contextNumber(bc, c.name);
    const aggs = c.aggregates.map((a) => a.name).join(', ');
    const text = `${cn.number} ${c.name}${c.classification ? ` (${c.classification})` : ''}${aggs ? ` - ${aggs}` : ''}`;
    boxes.set(
      c.id,
      f.shape('context', text, 40 + (i % 4) * 650, 560 + Math.floor(i / 4) * 300, 600, 170, {
        outlined: true,
        fontSize: 14,
      }),
    );
  });
  (ir.externals ?? []).forEach((e) =>
    claim(bc, boxes.get(e.id)!, frameIds.map, 'external', e.name, e.name),
  );
  ir.contexts.forEach((c) => claim(bc, boxes.get(c.id)!, frameIds.map, 'context', c.name, c.name));
  for (const r of ir.relationships) {
    const a = boxes.get(r.sourceContextId);
    const b = boxes.get(r.targetContextId);
    if (a && b)
      f.connect(a, b, {
        label: r.contract ? `${r.relationshipType} - ${r.contract}` : r.relationshipType,
        shape: 'elbowed',
      });
  }
  return f.build(2800);
}

export function captionFrame(bc: BoardContext, ctx: ContextDefinition): BoardFrame {
  const cn = contextNumber(bc, ctx.name);
  const title = `${cn.number} ${ctx.name}${ctx.classification ? ` - ${ctx.classification}` : ''}`;
  const f = new FrameBuilder(frameIds.caption(cn.number), title, 'context', cn.number, cn.source);
  f.shape('context', title, 40, 40, 700, 100, { outlined: true, bold: true, fontSize: 22 });
  f.text(ctx.description ?? '', 40, 170, 700, 16);
  f.text(
    `${ctx.aggregates.length} aggregates, ${ctx.policies.length} policies, ${ctx.projections?.length ?? 0} projections, ${ctx.queries?.length ?? 0} queries, ${ctx.rules?.length ?? 0} rules`,
    40,
    300,
    700,
    14,
  );
  return f.build(800);
}

/** What a context holds that is not an aggregate: services, orchestrations with their commands and process events, loose commands and events. */
export function servicesFrame(
  bc: BoardContext,
  ctx: ContextDefinition,
  ptr: PointerIndex,
): BoardFrame | undefined {
  const cn = contextNumber(bc, ctx.name);
  const ownedC = new Set(ctx.aggregates.flatMap((a) => a.commands.map((c) => c.name)));
  const ownedE = new Set(ctx.aggregates.flatMap((a) => a.events.map((e) => e.name)));
  const loose = ctx.commands.filter((c) => !ownedC.has(c.name));
  const looseEvents = ctx.events.filter((e) => !ownedE.has(e.name));
  if (ctx.domainServices.length + ctx.sagas.length + loose.length + looseEvents.length === 0)
    return undefined;
  const f = new FrameBuilder(
    frameIds.services(cn.number),
    `Services - ${cn.number} ${ctx.name}`,
    'services',
    cn.number,
    cn.source,
  );
  let y = 60;
  const pointed = (
    item: BoardItem | undefined,
    kind: Parameters<PointerIndex['find']>[0],
    name: string,
  ): undefined => {
    if (item) claim(bc, item, frameIds.services(cn.number), kind, name, ctx.name);
    const p = ptr.find(kind, name, ctx.name);
    if (item && p !== undefined) f.pointer(p, item.x, item.y + item.h + 2, item.w);
    return undefined;
  };
  y = grid(f, ctx.domainServices, 40, y, (s, x, py) => {
    const item = f.shape('service', `${s.name}\n${s.consumes} -> ${s.produces}`, x, py, W, H, {
      fill: OPTIONAL_SWATCH.component,
      textColor: '#ffffff',
    });
    return pointed(item, 'service', s.name) ?? item;
  });
  for (const s of ctx.sagas) {
    const saga = f.sticky('saga', `${s.name}\ntrigger ${s.trigger}`, 40, y, W, H);
    pointed(saga, 'saga', s.name);
    const parts = [
      ...(s.commands ?? []).flatMap((c) => [
        {
          kind: 'command' as const,
          name: c.name,
          text: commandText({ name: c.name, causes: c.causes, outcomes: emitOutcomes(c) }),
        },
        ...c.preconditions.map((p) => ({
          kind: 'refusal' as const,
          name: p.name,
          text: refusalText(p, c.name),
        })),
      ]),
      ...(s.events ?? []).map((e) => ({
        kind: 'event' as const,
        name: e.name,
        text: eventText(e.name, e.owner),
      })),
    ];
    parts.forEach((p, i) => {
      const item = f.sticky(
        p.kind,
        p.text,
        40 + (W + GAP * 2) * (1 + (i % 4)),
        y + Math.floor(i / 4) * (H + GAP),
        W,
        H,
      );
      pointed(item, p.kind, p.name);
      f.connect(saga, item, { shape: 'straight' });
    });
    y += Math.max(1, Math.ceil(parts.length / 4)) * (H + GAP) + GAP;
  }
  y = grid(f, loose, 40, y, (c, x, py) =>
    pointed(
      f.sticky(
        'command',
        commandText({ name: c.name, causes: c.causes, outcomes: emitOutcomes(c) }),
        x,
        py,
        W,
        H,
      ),
      'command',
      c.name,
    ),
  );
  grid(f, looseEvents, 40, y, (e, x, py) =>
    pointed(f.sticky('event', eventText(e.name, e.owner), x, py, W, H), 'event', e.name),
  );
  return f.build(1400);
}

export function projectionFrame(bc: BoardContext, ptr: PointerIndex): BoardFrame | undefined {
  const bands = bc.ir.contexts.filter(
    (c) => (c.projections?.length ?? 0) + (c.queries?.length ?? 0) > 0,
  );
  if (bands.length === 0) return undefined;
  const f = new FrameBuilder(
    frameIds.projections,
    'Projection & Query Surface',
    'projection-query',
  );
  let y = 40;
  for (const ctx of bands) {
    const cn = contextNumber(bc, ctx.name);
    f.text(`${cn.number} ${ctx.name}`, 40, y, 800, 22, true);
    y += 50;
    const entries = [
      ...(ctx.projections ?? []).map((p) => ({
        kind: 'projection' as const,
        name: p.name,
        text: `${p.name}\nfold of ${p.sources.join(', ')}`,
      })),
      ...(ctx.queries ?? []).map((q) => ({
        kind: 'query' as const,
        name: q.name,
        text: `${q.name}\nreads ${q.reads.join(', ')}`,
      })),
    ];
    y =
      grid(f, entries, 40, y, (e, x, py) => {
        const item = claim(
          bc,
          f.sticky(e.kind, e.text, x, py, W, H),
          frameIds.projections,
          e.kind,
          e.name,
          ctx.name,
        );
        const p = ptr.find(e.kind, e.name, ctx.name);
        if (p !== undefined) f.pointer(p, x, py + H + 2, W);
        return item;
      }) + 40;
  }
  return f.build(1760);
}

export function policiesFrame(bc: BoardContext, ptr: PointerIndex): BoardFrame | undefined {
  const bands = bc.ir.contexts.filter((c) => c.policies.length > 0);
  if (bands.length === 0) return undefined;
  const f = new FrameBuilder(frameIds.policies, 'Policies - reactive wiring', 'policies');
  f.text(
    'A policy is one event leading to one command; a rule that lists several commands for one event is several policies.',
    40,
    30,
    1800,
    18,
  );
  let y = 100;
  for (const ctx of bands) {
    const cn = contextNumber(bc, ctx.name);
    f.text(`${cn.number} ${ctx.name}`, 40, y, 800, 22, true);
    y += 50;
    y =
      grid(f, ctx.policies, 40, y, (p, x, py) => {
        const item = claim(
          bc,
          f.sticky('policy', policyText(p), x, py, W, H),
          frameIds.policies,
          'policy',
          p.name,
          ctx.name,
        );
        const pt = ptr.find('policy', p.name, ctx.name);
        if (pt !== undefined) f.pointer(pt, x, py + H + 2, W);
        return item;
      }) + 40;
  }
  return f.build(1800);
}

const clip = (text: string): string => (text.length > 200 ? `${text.slice(0, 199)}…` : text);

export function coverageFrame(bc: BoardContext): BoardFrame {
  const f = new FrameBuilder(
    frameIds.coverage,
    'Invariant Coverage & Enforcement',
    'invariant-coverage',
  );
  const rows: { text: string; kind?: 'invariant' | 'rule'; name?: string; context?: string }[] = [];
  let preconditions = 0;
  let invariants = 0;
  let rules = 0;
  for (const ctx of bc.ir.contexts) {
    const inAgg = new Set(ctx.aggregates.flatMap((a) => a.invariants.map((i) => i.id)));
    for (const a of ctx.aggregates) {
      a.invariants.forEach((i) => {
        invariants += 1;
        rows.push({ text: `${ctx.name}.${a.name} . invariant . ${i.id}: ${i.description}` });
      });
      a.commands.forEach((c) =>
        c.preconditions.forEach((p) => {
          preconditions += 1;
          rows.push({ text: `${ctx.name}.${a.name} . precondition . ${p.name}: ${p.description}` });
        }),
      );
    }
    ctx.invariants
      .filter((i) => !inAgg.has(i.id))
      .forEach((i) => {
        invariants += 1;
        rows.push({
          text: `${ctx.name} . invariant . ${i.id}: ${i.description}`,
          kind: 'invariant',
          name: i.id,
          context: ctx.name,
        });
      });
    (ctx.rules ?? []).forEach((r) => {
      rules += 1;
      rows.push({
        text: `${ctx.name} . rule . ${r.id}: ${r.description} (enforced by ${r.enforcedBy})`,
        kind: 'rule',
        name: r.id,
        context: ctx.name,
      });
    });
  }
  f.text(
    `${invariants} invariants, ${rules} context rules, ${preconditions} preconditions, 1:1 with the model.`,
    40,
    30,
    3800,
    22,
    true,
  );
  rows.forEach((r, i) => {
    const item = f.text(clip(r.text), 40, 100 + i * 30, 3800, 15);
    if (r.kind !== undefined)
      claim(bc, item, frameIds.coverage, r.kind, r.name ?? '', r.context ?? '');
  });
  return f.build(4200);
}

void KIND_SWATCH;
