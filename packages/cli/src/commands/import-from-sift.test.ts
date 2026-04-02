import { describe, it, expect, afterEach } from 'vitest';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdirSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { runImportFromSift } from './import-from-sift.js';

const FIXTURES = resolve(import.meta.dirname, '../../../../fixtures');
const SIFT_FIXTURE = resolve(FIXTURES, 'valid/sift/ordering.sift.json');

const tmpBase = join(tmpdir(), 'mmnt-import-test-' + Date.now());

afterEach(() => {
  try { rmSync(tmpBase, { recursive: true, force: true }); } catch { /* */ }
});

describe('moment import --from-sift', () => {
  it('imports valid Sift spec and creates .moment files (EXIT-B1)', async () => {
    const outDir = join(tmpBase, 'out1');
    mkdirSync(outDir, { recursive: true });

    const result = await runImportFromSift([SIFT_FIXTURE, '--output-dir', outDir]);

    expect(result.success).toBe(true);
    expect(result.filesWritten).toBeGreaterThan(0);
    expect(result.message).toContain('Imported');
  });

  it('writes .upstream-fingerprint.json (EXIT-B2)', async () => {
    const outDir = join(tmpBase, 'out2');
    mkdirSync(outDir, { recursive: true });

    await runImportFromSift([SIFT_FIXTURE, '--output-dir', outDir]);

    const fpPath = join(outDir, '.moment', '.upstream-fingerprint.json');
    expect(existsSync(fpPath)).toBe(true);
    const fp = JSON.parse(readFileSync(fpPath, 'utf-8'));
    expect(fp.specificationId).toBe('ordering-service');
    expect(fp.contentHash).toBeTruthy();
    expect(fp.importedAt).toBeTruthy();
    expect(typeof fp.boundedContextCount).toBe('number');
    expect(typeof fp.aggregateCount).toBe('number');
    expect(typeof fp.domainEventCount).toBe('number');
  });

  it('outputs import summary with element counts (EXIT-B3)', async () => {
    const outDir = join(tmpBase, 'out3');
    mkdirSync(outDir, { recursive: true });

    const result = await runImportFromSift([SIFT_FIXTURE, '--output-dir', outDir]);

    expect(result.success).toBe(true);
    expect(result.message).toContain('context');
    expect(result.message).toContain('file');
  });

  it('--json outputs structured JSON', async () => {
    const outDir = join(tmpBase, 'out4');
    mkdirSync(outDir, { recursive: true });

    const result = await runImportFromSift(['--json', SIFT_FIXTURE, '--output-dir', outDir]);

    expect(result.success).toBe(true);
    expect(result.json).toBeDefined();
    const parsed = JSON.parse(result.json!);
    expect(typeof parsed.contexts).toBe('number');
    expect(typeof parsed.flows).toBe('number');
    expect(typeof parsed.filesWritten).toBe('number');
  });

  it('no arguments returns usage message', async () => {
    const result = await runImportFromSift([]);

    expect(result.success).toBe(false);
    expect(result.message).toContain('Usage:');
  });

  it('nonexistent file returns file-not-found (EXIT-B4)', async () => {
    const result = await runImportFromSift([join(tmpdir(), 'nonexistent.sift.json')]);

    expect(result.success).toBe(false);
    expect(result.message).toContain('File not found');
  });

  it('invalid JSON returns error', async () => {
    const badPath = join(tmpBase, 'bad.json');
    mkdirSync(dirname(badPath), { recursive: true });
    const { writeFileSync } = await import('node:fs');
    writeFileSync(badPath, 'not json {{{');

    const result = await runImportFromSift([badPath]);

    expect(result.success).toBe(false);
    expect(result.message).toContain('Invalid JSON');
  });

  it('import is idempotent — re-running overwrites cleanly (EXIT-C4)', async () => {
    const outDir = join(tmpBase, 'out5');
    mkdirSync(outDir, { recursive: true });

    const result1 = await runImportFromSift([SIFT_FIXTURE, '--output-dir', outDir]);
    const result2 = await runImportFromSift([SIFT_FIXTURE, '--output-dir', outDir]);

    expect(result1.success).toBe(true);
    expect(result2.success).toBe(true);
    expect(result2.filesWritten).toBe(result1.filesWritten);
  });
});

function dirname(p: string): string {
  return p.split('/').slice(0, -1).join('/');
}
