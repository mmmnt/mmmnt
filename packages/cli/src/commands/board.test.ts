import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runBoard } from './board.js';

const FIXTURES = resolve(import.meta.dirname, '../../../../fixtures');
const PROJECT = resolve(FIXTURES, 'valid/process-constructs');
const INVALID = resolve(FIXTURES, 'invalid/no-declaration.moment');

let work: string;
let out: string;
let model: string;

/** A copy of the process-constructs project whose flows carry `N<i> - ` ids, as a board needs. */
function numberedCopy(): string {
  const dir = join(work, 'model');
  cpSync(PROJECT, dir, { recursive: true });
  const flows = join(dir, 'flows');
  readdirSync(flows)
    .sort()
    .forEach((file, i) => {
      const path = join(flows, file);
      writeFileSync(path, readFileSync(path, 'utf-8').replace(/^flow "/m, `flow "N${i + 1} - `));
    });
  return dir;
}

beforeEach(() => {
  work = mkdtempSync(join(tmpdir(), 'moment-board-'));
  out = join(work, 'out');
  model = numberedCopy();
});
afterEach(() => rmSync(work, { recursive: true, force: true }));

describe('moment board', () => {
  it('writes board.svg, one svg per frame and the manifest', async () => {
    const result = await runBoard([model, '--out', out]);

    expect(result.success).toBe(true);
    const files = readdirSync(out);
    for (const f of [
      'board.svg',
      'manifest.json',
      'legend.svg',
      'context-C1.svg',
      'thread-N1.svg',
    ]) {
      expect(files).toContain(f);
    }
    const manifest = JSON.parse(readFileSync(join(out, 'manifest.json'), 'utf-8')) as {
      manifestVersion: number;
      frames: { id: string }[];
    };
    expect(manifest.manifestVersion).toBe(1);
    expect(manifest.frames.map((f) => f.id)).toContain('thread-N1');
  });

  it('reads the context order from manifest.yaml', async () => {
    writeFileSync(
      join(model, 'manifest.yaml'),
      'name: pc\nversion: 0.1.0\ncontexts:\n  - name: Ordering\n    path: contexts/ticketwave.moment\n  - name: Ticketing\n    path: contexts/ticketing.moment\nflows: []\n',
    );
    const result = await runBoard([model, '--out', out]);
    expect(result.success).toBe(true);
    const frames = result.projection!.manifest.frames;
    expect(frames).toContainEqual(
      expect.objectContaining({
        id: 'context-C1',
        title: 'C1 Ordering - Core',
        numberSource: 'manifest',
      }),
    );
  });

  it('says when context numbers follow the load order', async () => {
    const result = await runBoard([model, '--out', out]);
    expect(result.notices?.join(' ')).toMatch(/load order/);
  });

  it('writes the same bytes on a second run', async () => {
    const other = join(work, 'other');
    await runBoard([model, '--out', out]);
    await runBoard([model, '--out', other]);
    for (const f of readdirSync(out)) {
      expect(readFileSync(join(other, f), 'utf-8')).toBe(readFileSync(join(out, f), 'utf-8'));
    }
  });

  it('writes only the named frame and the manifest with --frame', async () => {
    await runBoard([model, '--out', out, '--frame', 'context-map']);
    expect(readdirSync(out).sort()).toEqual(['context-map.svg', 'manifest.json']);
  });

  it('writes nothing for an unnumbered flow, naming it, and fails', async () => {
    const result = await runBoard([PROJECT, '--out', out]);
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/Customer cancels/);
    expect(existsSync(out)).toBe(false);
  });

  it('writes nothing for a model that does not parse, and fails', async () => {
    const result = await runBoard([INVALID, '--out', out]);
    expect(result.success).toBe(false);
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(existsSync(out)).toBe(false);
  });

  it('reads a pointers file, and fails on a pointer that names no node', async () => {
    const good = join(work, 'good.json');
    writeFileSync(
      good,
      JSON.stringify({
        pointers: [{ momentId: 'N1.M1', kind: 'command', name: 'CancelBooking', pointer: 'S:9' }],
      }),
    );
    const ok = await runBoard([model, '--out', out, '--pointers', good]);
    expect(ok.success).toBe(true);
    expect(readFileSync(join(out, 'thread-N1.svg'), 'utf-8')).toContain('S:9');

    const stale = join(work, 'stale.json');
    writeFileSync(
      stale,
      JSON.stringify({ pointers: [{ kind: 'command', name: 'Nope', pointer: 'S:1' }] }),
    );
    const bad = await runBoard([model, '--out', join(work, 'out2'), '--pointers', stale]);
    expect(bad.success).toBe(false);
    expect(bad.message).toMatch(/Nope/);
    expect(existsSync(join(work, 'out2'))).toBe(false);
  });

  it('requires --out and a path', async () => {
    expect((await runBoard([model])).success).toBe(false);
    expect((await runBoard(['--out', out])).success).toBe(false);
  });
});
