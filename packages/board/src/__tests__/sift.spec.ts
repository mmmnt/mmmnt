import { describe, it, expect, beforeAll } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { IntermediateRepresentation } from '@mmmnt/core';
import { boardFiles } from '../files.js';
import { projectBoard } from '../project-board.js';
import type { BoardProjection } from '../types.js';
import { ROOT, SIFT_MODEL, loadIr, numbered } from './helpers.js';

const GOLDEN = resolve(ROOT, 'packages/board/fixtures/golden');
// The Sift manifest's description line is not valid YAML for the manifest reader (an unquoted colon),
// so the context order is read from its `contexts:` list directly.
const manifestText = readFileSync(resolve(SIFT_MODEL, 'manifest.yaml'), 'utf-8');
const order = [...(manifestText.split('flows:')[0] ?? '').matchAll(/^ {2}- name: (\w+)$/gm)].map(
  (m) => m[1]!,
);

let sift: IntermediateRepresentation;
let board: BoardProjection;
beforeAll(async () => {
  sift = await loadIr(SIFT_MODEL);
  board = projectBoard(sift, { contextOrder: order });
});

/** The digest of every file of a render: a layout change is a visible diff in the golden file. */
function digest(projection: BoardProjection): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, text] of boardFiles(projection)) {
    out[name] = createHash('sha256').update(text).digest('hex');
  }
  return out;
}

function matchGolden(name: string, projection: BoardProjection): void {
  const path = resolve(GOLDEN, `${name}.json`);
  const actual = `${JSON.stringify(digest(projection), null, 2)}\n`;
  if (process.env.UPDATE_GOLDEN === '1' || !existsSync(path)) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, actual);
  }
  expect(actual).toBe(readFileSync(path, 'utf-8'));
}

describe('the Sift model on the board (ADR-048 D5)', () => {
  it('numbers its threads T1 to T15 from the flow names and its contexts C1 to C5 from the manifest', () => {
    const threads = board.manifest.frames.filter((f) => f.kind === 'thread').map((f) => f.number);
    expect(threads).toEqual(Array.from({ length: 15 }, (_, i) => `T${i + 1}`));
    const contexts = board.manifest.frames.filter((f) => f.kind === 'context');
    expect(contexts.map((f) => [f.number, f.numberSource])).toEqual([
      ['C1', 'manifest'],
      ['C2', 'manifest'],
      ['C3', 'manifest'],
      ['C4', 'manifest'],
      ['C5', 'manifest'],
    ]);
    expect(contexts[0]?.title).toMatch(/^C1 Enablement/);
  });

  it('takes the context order from the load order without a manifest, and says so', () => {
    const without = projectBoard(sift);
    expect(without.notices.join(' ')).toMatch(/load order/);
    expect(without.manifest.frames.find((f) => f.id === 'context-C1')?.numberSource).toBe(
      'load-order',
    );
  });

  it('keeps the id of a continued moment and draws it as its own column', () => {
    const t10 = board.frames.find((f) => f.id === 'thread-T10')!;
    expect(t10.items.filter((i) => i.text.startsWith('T10.M1 - ')).length).toBeGreaterThanOrEqual(
      2,
    );
  });

  it('carries every (kind, name, context) of the model in the manifest', () => {
    const have = new Set(board.manifest.nodes.map((n) => `${n.kind}|${n.name}|${n.context}`));
    const want: string[] = [];
    for (const ctx of sift.contexts) {
      const add = (kind: string, name: string): number => want.push(`${kind}|${name}|${ctx.name}`);
      add('context', ctx.name);
      ctx.aggregates.forEach((a) => {
        add('aggregate', a.name);
        a.commands.forEach((c) => add('command', c.name));
        a.events.forEach((e) => add('event', e.name));
        a.invariants.forEach((i) => add('invariant', i.id));
      });
      ctx.commands.forEach((c) => add('command', c.name));
      ctx.events.forEach((e) => add('event', e.name));
      ctx.policies.forEach((p) => add('policy', p.name));
      ctx.sagas.forEach((s) => add('saga', s.name));
      ctx.domainServices.forEach((s) => add('service', s.name));
      (ctx.projections ?? []).forEach((p) => add('projection', p.name));
      (ctx.queries ?? []).forEach((q) => add('query', q.name));
      (ctx.rules ?? []).forEach((r) => add('rule', r.id));
    }
    expect(want.length).toBeGreaterThan(300);
    expect(want.filter((k) => !have.has(k))).toEqual([]);
    for (const flow of sift.flows) {
      expect(board.manifest.nodes.some((n) => n.kind === 'flow' && n.name === flow.name)).toBe(
        true,
      );
    }
  });

  it('draws a refusal in the BRANCH row for the placed commands that have preconditions', () => {
    const refusals = board.manifest.nodes.filter(
      (n) => n.kind === 'refusal' && n.role === 'placement',
    );
    expect(refusals.length).toBeGreaterThan(50);
  });

  it('is byte-stable: the golden render of the Sift model', () => {
    matchGolden('sift', board);
  });

  it('is byte-stable: the golden render of TicketWave', async () => {
    const tw = await loadIr('examples/ticketwave/spec/ticketwave.moment');
    matchGolden('ticketwave', projectBoard(numbered(tw)));
  });
});
