import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runBoard } from './board.js';

const FIXTURES = resolve(import.meta.dirname, '../../../../fixtures');
const PROJECT = resolve(FIXTURES, 'valid/process-constructs');
const INVALID = resolve(FIXTURES, 'invalid/no-declaration.moment');

let out: string;
beforeEach(() => {
  out = mkdtempSync(join(tmpdir(), 'moment-board-'));
});
afterEach(() => rmSync(out, { recursive: true, force: true }));

describe('moment board', () => {
  it('writes one svg per frame and the manifest', async () => {
    const result = await runBoard([PROJECT, '--out', out]);

    expect(result.success).toBe(true);
    const files = readdirSync(out);
    expect(files).toContain('manifest.json');
    expect(files).toContain('context-Ticketing.svg');
    expect(files).toContain('thread-Checkout.svg');
    const manifest = JSON.parse(readFileSync(join(out, 'manifest.json'), 'utf-8')) as {
      manifestVersion: number;
    };
    expect(manifest.manifestVersion).toBe(1);
  });

  it('writes the same bytes on a second run', async () => {
    const other = mkdtempSync(join(tmpdir(), 'moment-board-'));
    await runBoard([PROJECT, '--out', out]);
    await runBoard([PROJECT, '--out', other]);
    for (const f of readdirSync(out)) {
      expect(readFileSync(join(other, f), 'utf-8')).toBe(readFileSync(join(out, f), 'utf-8'));
    }
    rmSync(other, { recursive: true, force: true });
  });

  it('writes only the named frame and the manifest with --frame', async () => {
    await runBoard([PROJECT, '--out', out, '--frame', 'context-map']);
    expect(readdirSync(out).sort()).toEqual(['context-map.svg', 'manifest.json']);
  });

  it('writes nothing for a model that does not parse, and fails', async () => {
    const result = await runBoard([INVALID, '--out', out]);
    expect(result.success).toBe(false);
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(readdirSync(out)).toEqual([]);
  });

  it('requires --out and a path', async () => {
    expect((await runBoard([PROJECT])).success).toBe(false);
    expect((await runBoard(['--out', out])).success).toBe(false);
    expect(existsSync(join(out, 'manifest.json'))).toBe(false);
  });
});
