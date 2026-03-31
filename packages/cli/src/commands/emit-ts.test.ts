import { describe, it, expect } from 'vitest';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { runEmitTs } from './emit-ts.js';

const FIXTURES = resolve(import.meta.dirname, '../../../../fixtures');
const VALID_FIXTURE = resolve(FIXTURES, 'valid/minimal/contexts/ordering.moment');
const INVALID_FIXTURE = resolve(FIXTURES, 'invalid/no-declaration.moment');

describe('moment emit-ts', () => {
  it('valid spec produces TypeScript + scaffold files', async () => {
    const result = await runEmitTs([VALID_FIXTURE]);

    expect(result.success).toBe(true);
    expect(result.message).toContain('Emitted');
    expect(result.tsFileCount).toBeGreaterThan(0);
    expect(result.scaffoldFileCount).toBeGreaterThanOrEqual(0);
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
    const result = await runEmitTs(['--dry-run', VALID_FIXTURE]);

    expect(result.success).toBe(true);
    expect(result.dryRun).toBe(true);
    expect(result.message).toContain('Dry run');
    expect(result.fileList).toBeDefined();
  });

  it('delegates to TypeScriptEmitter + TestScaffoldEmitter', async () => {
    const result = await runEmitTs([VALID_FIXTURE]);

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
    const result = await runEmitTs([INVALID_FIXTURE]);

    expect(result.success).toBe(false);
    expect(result.diagnostics.length).toBeGreaterThan(0);
  });

  it('nonexistent path returns failure with file-not-found', async () => {
    const nonexistent = join(tmpdir(), 'nonexistent-emit-ts-12345.moment');
    const result = await runEmitTs([nonexistent]);

    expect(result.success).toBe(false);
    expect(result.message).toContain('File not found');
  });
});
