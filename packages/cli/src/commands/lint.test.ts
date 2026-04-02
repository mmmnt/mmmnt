import { describe, it, expect } from 'vitest';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { runLint } from './lint.js';

const FIXTURES = resolve(import.meta.dirname, '../../../../fixtures');
const VALID_FIXTURE = resolve(FIXTURES, 'valid/minimal/contexts/ordering.moment');
const UNIFIED_FIXTURE = resolve(FIXTURES, 'valid/unified/vet-clinic.moment');
const INVALID_FIXTURE = resolve(FIXTURES, 'invalid/no-declaration.moment');

describe('moment lint', () => {
  it('clean spec with no issues exits 0', async () => {
    const result = await runLint([VALID_FIXTURE]);

    expect(result.success).toBe(true);
    // May have drift warnings (no actual files) but no errors
    const errors = result.issues.filter((i) => i.severity === 'error');
    expect(errors).toHaveLength(0);
  });

  it('parse errors produce non-zero exit', async () => {
    const result = await runLint([INVALID_FIXTURE]);

    expect(result.success).toBe(false);
    const parseErrors = result.issues.filter((i) => i.source === 'parse' && i.severity === 'error');
    expect(parseErrors.length).toBeGreaterThan(0);
  });

  it('deprecated fields produce schema warnings (exit 0)', async () => {
    const result = await runLint([UNIFIED_FIXTURE]);

    expect(result.success).toBe(true);
    const schemaWarnings = result.issues.filter((i) => i.source === 'schema');
    expect(schemaWarnings.length).toBeGreaterThan(0);
    expect(schemaWarnings[0].severity).toBe('warning');
    expect(schemaWarnings[0].message).toContain('deprecated');
  });

  it('--json outputs structured LintReport', async () => {
    const result = await runLint(['--json', UNIFIED_FIXTURE]);

    expect(result.success).toBe(true);
    expect(result.json).toBeDefined();
    const parsed = JSON.parse(result.json!);
    expect(Array.isArray(parsed.issues)).toBe(true);
    expect(typeof parsed.errors).toBe('number');
    expect(typeof parsed.warnings).toBe('number');
  });

  it('--json with parse errors also outputs structured JSON', async () => {
    const result = await runLint(['--json', INVALID_FIXTURE]);

    expect(result.success).toBe(false);
    expect(result.json).toBeDefined();
    const parsed = JSON.parse(result.json!);
    expect(parsed.errors).toBeGreaterThan(0);
  });

  it('no arguments returns usage message', async () => {
    const result = await runLint([]);

    expect(result.success).toBe(false);
    expect(result.message).toContain('Usage:');
  });

  it('nonexistent path returns file-not-found', async () => {
    const nonexistent = join(tmpdir(), 'nonexistent-lint-12345.moment');
    const result = await runLint([nonexistent]);

    expect(result.success).toBe(false);
    expect(result.message).toContain('File not found');
  });

  it('collects but does not implement diagnostics (EXIT-C1)', async () => {
    const result = await runLint([UNIFIED_FIXTURE]);
    expect(result.success).toBe(true);
    // Every issue has a source — no generic "lint" source
    for (const issue of result.issues) {
      expect(['parse', 'drift', 'schema', 'codex']).toContain(issue.source);
    }
  });

  it('violations never block — only parse errors cause non-zero exit (EXIT-C3)', async () => {
    // Unified fixture has deprecated fields (schema warnings) + likely drift
    // But should still exit 0
    const result = await runLint([UNIFIED_FIXTURE]);
    expect(result.success).toBe(true);
    const warnings = result.issues.filter((i) => i.severity === 'warning');
    expect(warnings.length).toBeGreaterThan(0);
  });
});
