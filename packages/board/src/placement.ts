import type { BoardFrame, Placement } from './types.js';

const GUTTER = 100;
const ROW_GAP = 200;
const SECTION_GAP = 300;
const MAX_ROW = 14000;

/**
 * The board grid (ADR-048 D2): legend, grammar and context map; captions and aggregates; services;
 * projections, policies and coverage; then the threads in two columns in number order. Sizes derive
 * from content, gutters are fixed, so the same frames always land in the same places.
 */
export function placeFrames(frames: BoardFrame[]): Map<string, Placement> {
  const out = new Map<string, Placement>();
  const rows: BoardFrame[][] = [
    frames.filter((f) => ['legend', 'grammar', 'context-map'].includes(f.kind)),
    frames.filter((f) => f.kind === 'context' || f.kind === 'aggregate'),
    frames.filter((f) => f.kind === 'services'),
    frames.filter((f) => ['projection-query', 'policies', 'invariant-coverage'].includes(f.kind)),
  ];
  let y = 0;
  for (const row of rows) {
    let x = 0;
    let lineH = 0;
    for (const f of row) {
      if (x > 0 && x + f.width > MAX_ROW) {
        y += lineH + GUTTER;
        x = 0;
        lineH = 0;
      }
      out.set(f.id, { x, y, width: f.width, height: f.height });
      x += f.width + GUTTER;
      lineH = Math.max(lineH, f.height);
    }
    y += lineH + (row.length > 0 ? ROW_GAP : 0);
  }
  const threads = frames.filter((f) => f.kind === 'thread');
  const half = Math.ceil(threads.length / 2);
  const colWidth = Math.max(0, ...threads.slice(0, half).map((f) => f.width));
  const start = y - ROW_GAP + SECTION_GAP;
  [threads.slice(0, half), threads.slice(half)].forEach((col, ci) => {
    let cy = start;
    for (const f of col) {
      out.set(f.id, {
        x: ci === 0 ? 0 : colWidth + SECTION_GAP,
        y: cy,
        width: f.width,
        height: f.height,
      });
      cy += f.height + GUTTER;
    }
  });
  return out;
}

export function extent(placements: Iterable<Placement>): { width: number; height: number } {
  let width = 0;
  let height = 0;
  for (const p of placements) {
    width = Math.max(width, p.x + p.width);
    height = Math.max(height, p.y + p.height);
  }
  return { width, height };
}
