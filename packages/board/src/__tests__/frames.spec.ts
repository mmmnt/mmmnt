import { describe, it, expect, beforeAll } from 'vitest';
import { projectBoard } from '../project-board.js';
import { boardFiles } from '../files.js';
import { renderBoardSvg, renderFrameSvg } from '../svg.js';
import { placeFrames } from '../placement.js';
import { OPTIONAL_SWATCH, SWATCH } from '../palette.js';
import type { BoardFrame, BoardProjection } from '../types.js';
import { loadIr, numbered } from './helpers.js';

let pc: BoardProjection;
let tw: BoardProjection;
beforeAll(async () => {
  pc = projectBoard(numbered(await loadIr('fixtures/valid/process-constructs')));
  tw = projectBoard(numbered(await loadIr('examples/ticketwave/spec/ticketwave.moment')));
});

const frame = (b: BoardProjection, id: string): BoardFrame => {
  const f = b.frames.find((x) => x.id === id);
  if (!f) throw new Error(`no frame ${id}`);
  return f;
};
const texts = (f: BoardFrame): string[] => f.items.map((i) => i.text);
const threadOf = (b: BoardProjection, id: string): BoardFrame => frame(b, `thread-${id}`);

describe('the frame inventory (ADR-048 D1)', () => {
  it('has the singletons, a caption per context, a frame per aggregate and a thread per flow', () => {
    const ids = pc.frames.map((f) => f.id);
    for (const id of [
      'legend',
      'grammar',
      'context-map',
      'policies',
      'invariant-coverage',
      'context-C1',
      'aggregate-Booking',
      'thread-N1',
      'thread-N3',
    ]) {
      expect(ids).toContain(id);
    }
    expect(pc.manifest.frames.map((f) => f.id)).toEqual(ids);
  });

  it('omits a services frame the context has nothing for', () => {
    expect(tw.frames.some((f) => f.kind === 'services')).toBe(true);
    const bare = pc.frames.filter((f) => f.kind === 'services').map((f) => f.id);
    expect(bare.length).toBeLessThanOrEqual(pc.frames.filter((f) => f.kind === 'context').length);
  });

  it('generates the legend with the exact hexes and the optional swatches', () => {
    const legend = texts(frame(pc, 'legend')).join('\n');
    for (const hex of [...Object.values(SWATCH), ...Object.values(OPTIONAL_SWATCH)])
      expect(legend).toContain(hex);
    expect(legend).toContain('nearest named approximations');
  });

  it('generates the grammar with the thread index and the uses table', () => {
    const grammar = texts(frame(pc, 'grammar')).join('\n');
    expect(grammar).toContain('N3');
    expect(grammar).toContain('process-owned event');
  });
});

describe('the thread frame (ADR-048 D4)', () => {
  it('is titled with its number and draws moments as numbered columns', () => {
    const t = threadOf(pc, 'N3');
    expect(t.title).toMatch(/^N3 - /);
    expect(texts(t)).toContain('N3.M1 - Order placed');
  });

  it('folds the cause into the command and a person note into the Action colour', () => {
    expect(
      texts(threadOf(pc, 'N1')).some((t) =>
        t.startsWith('CancelBooking [CustomerRequest]\nemits '),
      ),
    ).toBe(true);
    const note = threadOf(pc, 'N3').items.find((i) =>
      i.text.startsWith('[CardNetwork] The card network'),
    );
    expect(note?.color).toBe('yellow');
  });

  it('draws a person note in an INTERACTION row only when the flow has one', () => {
    const withNote = texts(threadOf(pc, 'N3'));
    expect(withNote).toContain('INTERACTION');
    expect(texts(threadOf(pc, 'N1'))).not.toContain('INTERACTION');
  });

  it('draws the refusals of a placed command as BRANCH stickies joined by a dashed connector', () => {
    const t = threadOf(pc, 'N1');
    expect(texts(t)).toContain('BRANCH');
    const refusal = t.items.find(
      (i) => i.kind === 'refusal' && i.text.startsWith('WithinRefundWindow - CancelBooking'),
    );
    expect(refusal?.text).toContain('[CustomerRequest]');
    expect(t.connectors.some((c) => c.dashed === true && c.to === refusal?.id)).toBe(true);
  });

  it('draws the table of arms, a terminal banner and continued columns on a branching flow', () => {
    const threads = tw.frames.filter((f) => f.kind === 'thread');
    const all = threads.flatMap(texts);
    expect(all.some((t) => /^Branches of N\d+ \(\d+ arms in \d+ branch moments\)/.test(t))).toBe(
      true,
    );
    expect(all.some((t) => t.startsWith('ARM'))).toBe(true);
    expect(all.some((t) => /\[outcome\] \w+ @ N\d+\.M\d+/.test(t))).toBe(true);
    expect(
      threads.some((f) =>
        f.items.some((i) => i.kind === 'banner' && i.text.includes('(terminal)')),
      ),
    ).toBe(true);
  });

  it('connects the nodes of a moment in a stack', () => {
    expect(threadOf(pc, 'N3').connectors.length).toBeGreaterThan(0);
  });
});

describe('the aggregate frame', () => {
  it('draws commands left, the aggregate holding refusals and invariants, events right', () => {
    const f = frame(pc, 'aggregate-Booking');
    const container = f.items.find((i) => i.kind === 'container');
    expect(container?.text).toBe('Booking');
    expect(f.items.find((i) => i.kind === 'command')?.x).toBeLessThan(container!.x);
    expect(f.items.find((i) => i.kind === 'event')?.x).toBeGreaterThan(container!.x);
    expect(f.items.some((i) => i.kind === 'refusal' && i.x > container!.x)).toBe(true);
  });

  it('draws alternative outcomes in the command text (ADR-041)', () => {
    const all = tw.frames.flatMap(texts);
    expect(all.some((t) => t.includes('when Open | '))).toBe(true);
  });
});

describe('policies', () => {
  it('writes the condition into the sticky (ADR-045)', () => {
    expect(
      texts(frame(tw, 'policies')).some((t) =>
        /trigger HoldReleased \[reason = expired\] -> /.test(t),
      ),
    ).toBe(true);
  });
});

describe('svg and placement (ADR-048 D2, D3)', () => {
  it('draws stickies natively with a named colour and shapes with an exact hex', () => {
    const svg = renderFrameSvg(threadOf(pc, 'N1'));
    expect(svg).toContain('data-type="sticky"');
    expect(svg).toContain('data-color="light_blue"');
    expect(svg).toContain('data-color="orange"');
    const map = renderFrameSvg(frame(pc, 'context-map'));
    expect(map).toContain('stroke="#1a1a1a"');
  });

  it('escapes the text and carries line breaks as <br>', () => {
    const f = {
      ...threadOf(pc, 'N1'),
      title: 'A & B',
      items: [{ ...threadOf(pc, 'N1').items[0]!, widget: 'sticky' as const, text: 'x < y\nz' }],
      connectors: [],
    };
    const svg = renderFrameSvg(f);
    expect(svg).toContain('data-frame="A &amp; B"');
    expect(svg).toContain('x &lt; y&lt;br&gt;z');
  });

  it('places every frame on the grid without overlap, deterministically', () => {
    const a = placeFrames(pc.frames);
    expect([...a.keys()].sort()).toEqual(pc.frames.map((f) => f.id).sort());
    const boxes = [...a.values()];
    for (const [i, p] of boxes.entries()) {
      for (const q of boxes.slice(i + 1)) {
        const apart =
          p.x + p.width <= q.x ||
          q.x + q.width <= p.x ||
          p.y + p.height <= q.y ||
          q.y + q.height <= p.y;
        expect(apart).toBe(true);
      }
    }
    expect(JSON.stringify([...placeFrames(pc.frames)])).toBe(JSON.stringify([...a]));
  });

  it('writes board.svg with every frame at its place, and the same bytes twice', () => {
    const files = boardFiles(pc);
    const board = files.get('board.svg')!;
    const places = placeFrames(pc.frames);
    expect(board).toBe(renderBoardSvg(pc.frames, places));
    const p = places.get('thread-N3')!;
    expect(board).toContain(`id="thread-N3" transform="translate(${p.x},${p.y})"`);
    expect([...boardFiles(pc)].join('')).toBe([...files].join(''));
    expect([...files.keys()]).toContain('thread-N3.svg');
  });

  it('puts the placement of each frame in the manifest', () => {
    expect(pc.manifest.frames.every((f) => f.placement.width > 0 && f.placement.height > 0)).toBe(
      true,
    );
  });
});
