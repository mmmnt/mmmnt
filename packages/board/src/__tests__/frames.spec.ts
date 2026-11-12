import { describe, it, expect, beforeAll } from 'vitest';
import type { IntermediateRepresentation } from '@mmmnt/core';
import { projectBoard } from '../project-board.js';
import { renderFrameSvg } from '../svg.js';
import { SWATCH } from '../palette.js';
import type { BoardFrame, BoardProjection } from '../types.js';
import { loadIr } from './helpers.js';

let pc: IntermediateRepresentation;
let tw: IntermediateRepresentation;
let pcBoard: BoardProjection;
let twBoard: BoardProjection;
beforeAll(async () => {
  pc = await loadIr('fixtures/valid/process-constructs');
  tw = await loadIr('examples/ticketwave/spec/ticketwave.moment');
  pcBoard = projectBoard(pc);
  twBoard = projectBoard(tw);
});

const frame = (b: BoardProjection, id: string): BoardFrame => {
  const f = b.frames.find((x) => x.id === id);
  if (!f) throw new Error(`no frame ${id}`);
  return f;
};
const texts = (f: BoardFrame): string[] => f.items.map((i) => i.text);

describe('the frame inventory', () => {
  it('has a frame per context, a thread per flow, the context map and invariant coverage', () => {
    const ids = pcBoard.frames.map((f) => f.id);
    expect(ids).toContain('context-Ticketing');
    expect(ids).toContain('context-Ordering');
    expect(ids).toContain('thread-Checkout');
    expect(ids).toContain('context-map');
    expect(ids).toContain('invariant-coverage');
    expect(pcBoard.manifest.frames.map((f) => f.id)).toEqual(ids);
  });
});

describe('a context frame', () => {
  it('draws a policy condition as a chip on the policy (ADR-045)', () => {
    const inventory = frame(twBoard, 'context-Inventory');
    expect(texts(inventory)).toContain('when reason = expired');
  });

  it('draws alternative outcomes as groups carrying the state that chooses them (ADR-041)', () => {
    const all = twBoard.frames.flatMap(texts);
    expect(all).toContain('[Open]');
    expect(all).toContain('[OneUseLeft]');
  });
});

describe('a thread frame', () => {
  it('draws a note, a cause chip and the moments as columns (ADR-040)', () => {
    const checkout = frame(pcBoard, 'thread-Checkout');
    expect(texts(checkout)).toContain(
      'The card network authorises the card and answers within seconds',
    );
    expect(texts(checkout)).toContain('Order placed');
    expect(texts(frame(pcBoard, 'thread-Customer cancels'))).toContain('cause CustomerRequest');
  });

  it('draws a branch arm with its condition and an outcome exit as OUTCOME (ADR-043)', () => {
    const texts2 = twBoard.frames.filter((f) => f.kind === 'thread').flatMap(texts);
    expect(texts2).toContain('when approved');
    expect(texts2).toContain('OUTCOME');
  });

  it('connects a triggered-by hop', () => {
    expect(frame(pcBoard, 'thread-Checkout').connectors.length).toBeGreaterThan(0);
  });
});

describe('the svg of a frame', () => {
  it('draws each kind in its ruled swatch', () => {
    const svg = pcBoard.frames.map(renderFrameSvg).join('\n');
    expect(svg).toContain(SWATCH.command);
    expect(svg).toContain(SWATCH.event);
    expect(svg).toContain(SWATCH.policy);
    expect(svg).toContain(SWATCH.moment);
  });

  it('is one svg root with a data-frame group and escapes text', () => {
    const f = frame(pcBoard, 'thread-Checkout');
    const svg = renderFrameSvg({
      ...f,
      title: 'A & B',
      items: [{ ...f.items[0]!, text: 'x < y' }],
    });
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('data-frame="A &amp; B"');
    expect(svg).toContain('x &lt; y');
  });

  it('is byte-identical when the same IR is projected twice', () => {
    const a = projectBoard(pc).frames.map(renderFrameSvg).join('');
    const b = projectBoard(pc).frames.map(renderFrameSvg).join('');
    expect(a).toBe(b);
  });
});
