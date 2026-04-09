import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { runEmitTs } from './emit-ts.js';

const FIXTURES = resolve(import.meta.dirname, '../../../../fixtures');
const VALID_FIXTURE = resolve(FIXTURES, 'valid/minimal/contexts/ordering.moment');
const INVALID_FIXTURE = resolve(FIXTURES, 'invalid/no-declaration.moment');

function walk(dir: string): string[] {
  const out: string[] = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else {
      out.push(full);
    }
  }
  return out;
}

let outDir: string;

beforeEach(() => {
  outDir = mkdtempSync(join(tmpdir(), 'moment-emit-ts-'));
});

afterEach(() => {
  rmSync(outDir, { recursive: true, force: true });
});

describe('moment emit-ts', () => {
  it('valid spec produces TypeScript + scaffold files', async () => {
    const result = await runEmitTs(['--out', outDir, VALID_FIXTURE]);

    expect(result.success).toBe(true);
    expect(result.message).toContain('Emitted');
    expect(result.tsFileCount).toBeGreaterThan(0);
    expect(result.scaffoldFileCount).toBeGreaterThanOrEqual(0);
  });

  it('writes TypeScript and scaffold files to the output directory', async () => {
    const result = await runEmitTs(['--out', outDir, VALID_FIXTURE]);

    expect(result.success).toBe(true);
    expect(result.filesWritten).toBeDefined();
    expect(result.filesWritten!.length).toBeGreaterThan(0);

    const filesOnDisk = walk(outDir);
    expect(filesOnDisk.length).toBeGreaterThan(0);

    for (const path of result.filesWritten!) {
      expect(existsSync(path)).toBe(true);
    }
  });

  it('does NOT produce .feature or specification.md files', async () => {
    const result = await runEmitTs(['--dry-run', VALID_FIXTURE]);

    expect(result.success).toBe(true);
    expect(result.dryRun).toBe(true);
    expect(result.fileList).toBeDefined();
    const fileList = result.fileList ?? [];
    expect(fileList.some((file) => file.endsWith('.feature'))).toBe(false);
    expect(fileList.some((file) => file.endsWith('specification.md'))).toBe(false);
  });

  it('--dry-run outputs file list without writing (TG-05)', async () => {
    const result = await runEmitTs(['--dry-run', '--out', outDir, VALID_FIXTURE]);

    expect(result.success).toBe(true);
    expect(result.dryRun).toBe(true);
    expect(result.message).toContain('Dry run');
    expect(result.fileList).toBeDefined();
    // Dry run must not touch disk
    expect(walk(outDir)).toEqual([]);
  });

  it('delegates to TypeScriptEmitter + TestScaffoldEmitter', async () => {
    const result = await runEmitTs(['--out', outDir, VALID_FIXTURE]);

    expect(result.success).toBe(true);
    expect(result.tsFileCount).toBeDefined();
    expect(result.scaffoldFileCount).toBeDefined();
  });

  it('no arguments returns failure with usage message', async () => {
    const result = await runEmitTs([]);

    expect(result.success).toBe(false);
    expect(result.message).toContain('Usage:');
  });

  it('invalid spec returns failure with parse diagnostics', async () => {
    const result = await runEmitTs(['--out', outDir, INVALID_FIXTURE]);

    expect(result.success).toBe(false);
    expect(result.diagnostics.length).toBeGreaterThan(0);
  });

  it('nonexistent path returns failure with file-not-found', async () => {
    const nonexistent = join(tmpdir(), 'nonexistent-emit-ts-12345.moment');
    const result = await runEmitTs(['--out', outDir, nonexistent]);

    expect(result.success).toBe(false);
    expect(result.message).toContain('File not found');
  });
});
