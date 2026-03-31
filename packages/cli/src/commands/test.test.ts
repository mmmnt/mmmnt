import { describe, it, expect } from 'vitest';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { runTest } from './test.js';

const FIXTURES = resolve(import.meta.dirname, '../../../../fixtures');
const VALID_FIXTURE = resolve(FIXTURES, 'valid/minimal/contexts/ordering.moment');
const INVALID_FIXTURE = resolve(FIXTURES, 'invalid/no-declaration.moment');

describe('moment test', () => {
  it('returns success when all tests pass', async () => {
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

  it('delegates to TestRunner and returns structured result', async () => {
    const result = await runTest([VALID_FIXTURE]);

    expect(result.success).toBe(true);
    expect(result.testResult).toBeDefined();
    expect(result.testResult!.suitesRun).toBeGreaterThanOrEqual(0);
    expect(result.testResult!.testsPassed).toBeGreaterThanOrEqual(0);
    expect(result.testResult!.traceabilityMap).toBeDefined();
  });

  it('output includes total, pass/fail counts and suite count', async () => {
    const result = await runTest([VALID_FIXTURE]);

    expect(result.message).toMatch(/\d+ total/);
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
