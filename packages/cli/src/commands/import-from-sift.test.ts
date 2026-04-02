import { describe, it, expect, afterEach } from 'vitest';
import { resolve, join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdirSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { runImportFromSift } from './import-from-sift.js';

const FIXTURES = resolve(import.meta.dirname, '../../../../fixtures');
const SIFT_DOMAIN_DIR = resolve(FIXTURES, 'valid/sift/domain');

const tmpBase = join(tmpdir(), 'mmnt-import-test-' + Date.now());

afterEach(() => {
  try { rmSync(tmpBase, { recursive: true, force: true }); } catch { /* */ }
});

describe('moment import --from-sift', () => {
  it('reads .domain/ JSONL files and creates .moment files (EXIT-B1)', async () => {
    const outDir = join(tmpBase, 'out1');
    mkdirSync(outDir, { recursive: true });

    const result = await runImportFromSift([SIFT_DOMAIN_DIR, '--output-dir', outDir]);

    expect(result.success).toBe(true);
    expect(result.filesWritten).toBeGreaterThan(0);
    expect(result.eventsProcessed).toBeGreaterThan(0);
    expect(result.message).toContain('Imported');

    // Verify .moment file created under .moment/contexts/
    const contextFile = join(outDir, '.moment', 'contexts', 'reception.moment');
    expect(existsSync(contextFile)).toBe(true);
    const content = readFileSync(contextFile, 'utf-8');
    expect(content).toContain('context "Reception"');
    expect(content).toContain('aggregate "PatientIntake"');
  });

  it('writes .upstream-fingerprint.json with sift envelope (EXIT-B2)', async () => {
    const outDir = join(tmpBase, 'out2');
    mkdirSync(outDir, { recursive: true });

    await runImportFromSift([SIFT_DOMAIN_DIR, '--output-dir', outDir]);

    const fpPath = join(outDir, '.moment', '.upstream-fingerprint.json');
    expect(existsSync(fpPath)).toBe(true);
    const fp = JSON.parse(readFileSync(fpPath, 'utf-8'));
    expect(fp.sift).toBeDefined();
    expect(fp.sift.contentHash).toBeTruthy();
    expect(fp.sift.importedAt).toBeTruthy();
    expect(typeof fp.sift.boundedContextCount).toBe('number');
    expect(typeof fp.sift.aggregateCount).toBe('number');
    expect(typeof fp.sift.domainEventCount).toBe('number');
  });

  it('reports event count and JSONL files read (EXIT-B3)', async () => {
    const outDir = join(tmpBase, 'out3');
    mkdirSync(outDir, { recursive: true });

    const result = await runImportFromSift([SIFT_DOMAIN_DIR, '--output-dir', outDir]);

    expect(result.success).toBe(true);
    expect(result.message).toContain('events');
    expect(result.message).toContain('JSONL');
  });

  it('--json outputs structured summary', async () => {
    const outDir = join(tmpBase, 'out4');
    mkdirSync(outDir, { recursive: true });

    const result = await runImportFromSift(['--json', SIFT_DOMAIN_DIR, '--output-dir', outDir]);

    expect(result.success).toBe(true);
    expect(result.json).toBeDefined();
    const parsed = JSON.parse(result.json!);
    expect(typeof parsed.contexts).toBe('number');
    expect(typeof parsed.eventsProcessed).toBe('number');
    expect(typeof parsed.jsonlFilesRead).toBe('number');
  });

  it('no arguments returns usage message', async () => {
    const result = await runImportFromSift([]);

    expect(result.success).toBe(false);
    expect(result.message).toContain('Usage:');
  });

  it('nonexistent directory returns error (EXIT-B4)', async () => {
    const result = await runImportFromSift([join(tmpdir(), 'nonexistent-domain-dir')]);

    expect(result.success).toBe(false);
    expect(result.message).toContain('not found');
  });

  it('empty directory with no .jsonl files returns error', async () => {
    const emptyDir = join(tmpBase, 'empty-domain');
    mkdirSync(emptyDir, { recursive: true });

    const result = await runImportFromSift([emptyDir]);

    expect(result.success).toBe(false);
    expect(result.message).toContain('No');
  });

  it('invalid JSONL content returns error', async () => {
    const badDir = join(tmpBase, 'bad-domain');
    mkdirSync(badDir, { recursive: true });
    writeFileSync(join(badDir, 'bad.jsonl'), 'not json {{{');

    const result = await runImportFromSift([badDir]);

    expect(result.success).toBe(false);
  });

  it('fingerprint unchanged on re-run with same content (EXIT-C4)', async () => {
    const outDir = join(tmpBase, 'out5');
    mkdirSync(outDir, { recursive: true });

    await runImportFromSift([SIFT_DOMAIN_DIR, '--output-dir', outDir]);
    const fp1 = readFileSync(join(outDir, '.moment', '.upstream-fingerprint.json'), 'utf-8');

    await runImportFromSift([SIFT_DOMAIN_DIR, '--output-dir', outDir]);
    const fp2 = readFileSync(join(outDir, '.moment', '.upstream-fingerprint.json'), 'utf-8');

    expect(JSON.parse(fp1).sift.contentHash).toBe(JSON.parse(fp2).sift.contentHash);
    expect(JSON.parse(fp1).sift.importedAt).toBe(JSON.parse(fp2).sift.importedAt);
  });

  it('replays events from all 4 context JSONL files', async () => {
    const outDir = join(tmpBase, 'out6');
    mkdirSync(outDir, { recursive: true });

    const result = await runImportFromSift([SIFT_DOMAIN_DIR, '--output-dir', outDir]);

    expect(result.success).toBe(true);
    // 4 JSONL files: reception (11), clinical (28), billing (9), records (8) = 56 events
    expect(result.eventsProcessed).toBeGreaterThan(40);

    // All 4 contexts should have .moment files
    expect(existsSync(join(outDir, '.moment', 'contexts', 'reception.moment'))).toBe(true);
    expect(existsSync(join(outDir, '.moment', 'contexts', 'clinical.moment'))).toBe(true);
    expect(existsSync(join(outDir, '.moment', 'contexts', 'billing.moment'))).toBe(true);
    expect(existsSync(join(outDir, '.moment', 'contexts', 'records.moment'))).toBe(true);
  });
});
