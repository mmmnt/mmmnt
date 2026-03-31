import { describe, it, expect } from 'vitest';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { runTest } from './test.js';

const FIXTURES = resolve(import.meta.dirname, '../../../../fixtures');
const VALID_FIXTURE = resolve(FIXTURES, 'valid/minimal/contexts/ordering.moment');
const INVALID_FIXTURE = resolve(FIXTURES, 'invalid/no-declaration.moment');

describe('moment test', () => {
  it('runs all derived test suites, exits 0 on all pass', async () => {
    const result = await runTest([VALID_FIXTURE]);

    expect(result.success).toBe(true);
    expect(result.message).toContain('passed');
    expect(result.testResult).toBeDefined();
  });

  it('no arguments returns failure with usage message', async () => {
    const result = await runTest([]);

    expect(result.success).toBe(false);
    expect(result.message).toContain('Usage:');
  });

  it('delegates to TestRunner (no test execution logic in CLI)', async () => {
    const result = await runTest([VALID_FIXTURE]);

    expect(result.success).toBe(true);
    expect(result.testResult).toBeDefined();
    expect(result.testResult!.suitesRun).toBeGreaterThanOrEqual(0);
  });

  it('output includes suite/case counts and pass/fail', async () => {
    const result = await runTest([VALID_FIXTURE]);

    expect(result.message).toMatch(/\d+ passed/);
    expect(result.message).toMatch(/\d+ failed/);
    expect(result.message).toMatch(/\d+ suite/);
  });

  it('invalid spec returns failure with parse diagnostics', async () => {
    const result = await runTest([INVALID_FIXTURE]);

    expect(result.success).toBe(false);
    expect(result.diagnostics.length).toBeGreaterThan(0);
  });

  it('nonexistent path returns failure with file-not-found', async () => {
    const nonexistent = join(tmpdir(), 'nonexistent-test-12345.moment');
    const result = await runTest([nonexistent]);

    expect(result.success).toBe(false);
    expect(result.message).toContain('File not found');
  });
});
