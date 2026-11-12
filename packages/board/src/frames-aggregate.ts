import type { AggregateDefinition, ContextDefinition } from '@mmmnt/core';
import { emitOutcomes } from '@mmmnt/core';
import type { BoardContext } from './context.js';
import { contextNumber, frameIds } from './context.js';
import { FrameBuilder } from './layout.js';
import type { PointerIndex } from './pointers.js';
import { commandText, eventText, refusalText } from './uses.js';
import type { BoardFrame, BoardItem } from './types.js';

const W = 240;
const H = 156;
const PITCH = 176;

/** The aggregate frame of Sift: commands left, the aggregate holding its refusals and invariants, events right. */
export function aggregateFrame(
  bc: BoardContext,
  ctx: ContextDefinition,
  agg: AggregateDefinition,
  ptr: PointerIndex,
): BoardFrame {
  const cn = contextNumber(bc, ctx.name);
  const f = new FrameBuilder(
    frameIds.aggregate(agg.name),
    `${agg.name} - ${ctx.name} (${cn.number})`,
    'aggregate',
  );
  const inner: { text: string; kind: 'refusal' | 'invariant'; name: string }[] = [
    ...agg.commands.flatMap((c) =>
      c.preconditions.map((p) => ({
        text: refusalText(p, c.name),
        kind: 'refusal' as const,
        name: p.name,
      })),
    ),
    ...agg.invariants.map((i) => ({
      text: `${i.id}: ${i.description}`,
      kind: 'invariant' as const,
      name: i.id,
    })),
  ];
  const rows = Math.max(agg.commands.length, agg.events.length, inner.length, 1);
  const container = f.shape('container', agg.name, 340, 100, 320, rows * PITCH + 90, {
    outlined: true,
    bold: true,
    fontSize: 22,
  });
  const place = (
    item: BoardItem,
    kind: Parameters<PointerIndex['find']>[0],
    name: string,
  ): void => {
    const p = ptr.find(kind, name, ctx.name);
    if (p !== undefined) f.pointer(p, item.x, item.y + item.h + 2, item.w);
  };
  agg.commands.forEach((c, i) => {
    const item = f.sticky(
      'command',
      commandText({ name: c.name, causes: c.causes, outcomes: emitOutcomes(c) }),
      40,
      150 + i * PITCH,
      W,
      H,
    );
    place(item, 'command', c.name);
    f.connect(item, container, { shape: 'straight' });
  });
  inner.forEach((r, i) => {
    place(f.sticky(r.kind, r.text, 400, 150 + i * PITCH, W, H), r.kind, r.name);
  });
  const owners = new Map(agg.events.map((e) => [e.name, e.owner]));
  agg.events.forEach((e, i) => {
    const item = f.sticky(
      'event',
      eventText(e.name, owners.get(e.name)),
      760,
      150 + i * PITCH,
      W,
      H,
    );
    place(item, 'event', e.name);
    f.connect(container, item, { shape: 'straight' });
  });
  f.text(
    `${agg.commands.length} commands, ${agg.events.length} events, ${agg.commands.reduce((n, c) => n + c.preconditions.length, 0)} refusals, ${agg.invariants.length} invariants (${ctx.name}, ${cn.number})`,
    40,
    rows * PITCH + 220,
    900,
    16,
  );
  return f.build(1100);
}
