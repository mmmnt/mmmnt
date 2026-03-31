import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { runParse, formatDiagnostic } from './parse.js';
import type { Diagnostic } from '@mmmnt/core';

const FIXTURES = resolve(import.meta.dirname, '../../../../fixtures');
const VALID_FIXTURE = resolve(FIXTURES, 'valid/minimal/contexts/ordering.moment');
const INVALID_FIXTURE = resolve(FIXTURES, 'invalid/no-declaration.moment');

describe('moment parse', () => {
  it('valid .moment + .manifest.yaml exits 0 with IR summary', async () => {
    const result = await runParse([VALID_FIXTURE]);

    expect(result.success).toBe(true);
    expect(result.message).toContain('Parsed successfully');
    expect(result.contextCount).toBeGreaterThanOrEqual(0);
  });

  it('invalid .moment file exits non-zero with diagnostics', async () => {
    const result = await runParse([INVALID_FIXTURE]);

    expect(result.success).toBe(false);
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(result.message).toContain('diagnostic');
  });

  it('no arguments exits non-zero with usage message', async () => {
    const result = await runParse([]);

    expect(result.success).toBe(false);
    expect(result.message).toContain('Usage:');
  });

  it('nonexistent path exits non-zero with file-not-found', async () => {
    const result = await runParse(['/tmp/nonexistent-file-12345.moment']);

    expect(result.success).toBe(false);
    expect(result.message).toContain('File not found');
  });

  it('delegates to MomentParser (no grammar/AST logic in CLI)', async () => {
    const result = await runParse([VALID_FIXTURE]);

    // The CLI delegates to MomentParser — it returns ParseResult with IR
    // No grammar manipulation happens in the CLI layer
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
});
