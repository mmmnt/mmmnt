import { describe, it, expect } from 'vitest';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { runParse, formatDiagnostic } from './parse.js';
import type { Diagnostic } from '@mmmnt/core';

const FIXTURES = resolve(import.meta.dirname, '../../../../fixtures');
const VALID_FIXTURE = resolve(FIXTURES, 'valid/minimal/contexts/ordering.moment');
const INVALID_FIXTURE = resolve(FIXTURES, 'invalid/no-declaration.moment');

describe('moment parse', () => {
  it('valid .moment file returns success with IR summary', async () => {
    const result = await runParse([VALID_FIXTURE]);

    expect(result.success).toBe(true);
    expect(result.message).toContain('Parsed successfully');
    expect(result.contextCount).toBeGreaterThanOrEqual(0);
  });

  it('invalid .moment file returns failure with diagnostics', async () => {
    const result = await runParse([INVALID_FIXTURE]);

    expect(result.success).toBe(false);
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(result.message).toContain('diagnostic');
  });

  it('no arguments returns failure with usage message', async () => {
    const result = await runParse([]);

    expect(result.success).toBe(false);
    expect(result.message).toContain('Usage:');
  });

  it('nonexistent path returns failure with file-not-found', async () => {
    const nonexistent = join(tmpdir(), 'nonexistent-moment-file-12345.moment');
    const result = await runParse([nonexistent]);

    expect(result.success).toBe(false);
    expect(result.message).toContain('File not found');
  });

  it('delegates to MomentParser (no grammar/AST logic in CLI)', async () => {
    const result = await runParse([VALID_FIXTURE]);

    expect(result.success).toBe(true);
    expect(result.contextCount).toBeDefined();
    expect(result.flowCount).toBeDefined();
  });

  it('diagnostics formatted with source location (file:line:col)', () => {
    const diagnostic: Diagnostic = {
      severity: 'error',
      message: 'Unexpected token',
      source: { file: 'test.moment', line: 5, column: 10 },
    };

    const formatted = formatDiagnostic(diagnostic);

    expect(formatted).toContain('test.moment:5:10');
    expect(formatted).toContain('error');
    expect(formatted).toContain('Unexpected token');
  });

  it('formatDiagnostic uses fallback file when source is missing', () => {
    const diagnostic: Diagnostic = {
      severity: 'warning',
      message: 'Missing declaration',
    };

    const formatted = formatDiagnostic(diagnostic, 'fallback.moment');
    expect(formatted).toContain('fallback.moment');
    expect(formatted).toContain('warning');
  });
});
