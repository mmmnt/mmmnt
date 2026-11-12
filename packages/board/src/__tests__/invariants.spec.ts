import { describe, it, expect, beforeAll } from 'vitest';
import { resolve } from 'node:path';
import { projectBoard } from '../project-board.js';
import { renderFrameSvg } from '../svg.js';
import type { BoardFrame, BoardProjection } from '../types.js';
import { ROOT, SIFT_MODEL, loadIr, numbered } from './helpers.js';

const SIFT_ORDER = ['Enablement', 'Intake', 'DesignModel', 'Clarification', 'Governance'];

let boards: { name: string; board: BoardProjection }[];
beforeAll(async () => {
  boards = [
    { name: 'sift', board: projectBoard(await loadIr(SIFT_MODEL), { contextOrder: SIFT_ORDER }) },
    {
      name: 'ticketwave',
      board: projectBoard(numbered(await loadIr('examples/ticketwave/spec/ticketwave.moment'))),
    },
    {
      name: 'process-constructs',
      board: projectBoard(numbered(await loadIr('fixtures/valid/process-constructs'))),
    },
    {
      name: 'note-moment',
      board: projectBoard(await loadIr(resolve(ROOT, 'packages/board/fixtures/note-moment'))),
    },
  ];
});

const overlap = (a: BoardFrame['items'][number], b: BoardFrame['items'][number]): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** One XML decoding gives the value Miro reads. */
const decodeOnce = (attr: string): string =>
  attr
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');

/** An entity left after one decoding is escaped twice; a `<` that is not a `<br>` is markup Miro would read. */
const hasStrayMarkup = (value: string): boolean =>
  /&(lt|gt|amp|quot);/.test(value) || value.replace(/<br>/g, '').includes('<');

/** Each manifest node is drawn once, and each key an item carries names a manifest node. */
function keyProblems(name: string, board: BoardProjection): string[] {
  const drawn = new Map<string, number>();
  for (const item of board.frames.flatMap((f) => f.items)) {
    if (item.key !== undefined) drawn.set(item.key, (drawn.get(item.key) ?? 0) + 1);
  }
  const keys = new Set(board.manifest.nodes.map((n) => n.key));
  return [
    ...board.manifest.nodes
      .filter((n) => drawn.get(n.key) !== 1)
      .map((n) => `${name}: ${n.key} drawn ${drawn.get(n.key) ?? 0} times`),
    ...[...drawn.keys()]
      .filter((k) => !keys.has(k))
      .map((k) => `${name}: item key ${k} is no manifest node`),
  ];
}

describe('board invariants (every frame of every render)', () => {
  it('draws no two generated items on top of each other (an aggregate holds what it contains)', () => {
    const clashes: string[] = [];
    for (const { name, board } of boards) {
      for (const frame of board.frames) {
        const items = frame.items.filter((i) => i.kind !== 'container');
        items.forEach((a, i) =>
          items.slice(i + 1).forEach((b) => {
            if (overlap(a, b))
              clashes.push(
                `${name}/${frame.id}: "${a.text.slice(0, 30)}" over "${b.text.slice(0, 30)}"`,
              );
          }),
        );
      }
    }
    expect(clashes).toEqual([]);
  });

  it('writes no escaped markup into any data-content: a line break is a <br> and nothing else', () => {
    const bad: string[] = [];
    for (const { name, board } of boards) {
      for (const frame of board.frames) {
        for (const m of renderFrameSvg(frame).matchAll(/ data-content="([^"]*)"/g)) {
          const value = decodeOnce(m[1]!);
          if (hasStrayMarkup(value)) bad.push(`${name}/${frame.id}: ${value.slice(0, 60)}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('draws every manifest node of a frame as exactly one item carrying its key', () => {
    const problems = boards.flatMap(({ name, board }) => keyProblems(name, board));
    expect(problems.slice(0, 10)).toEqual([]);
  });
});
