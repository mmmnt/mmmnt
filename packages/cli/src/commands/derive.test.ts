import { describe, it, expect } from 'vitest';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { runDerive } from './derive.js';

const FIXTURES = resolve(import.meta.dirname, '../../../../fixtures');
const VALID_FIXTURE = resolve(FIXTURES, 'valid/minimal/contexts/ordering.moment');
const INVALID_FIXTURE = resolve(FIXTURES, 'invalid/no-declaration.moment');

describe('moment derive', () => {
  it('valid spec returns success with topology summary', async () => {
    const result = await runDerive([VALID_FIXTURE]);

    expect(result.success).toBe(true);
    expect(result.message).toContain('Derived topology');
    expect(result.message).toContain('suite');
    expect(result.topology).toBeDefined();
  });

  it('invalid spec returns failure with parse diagnostics', async () => {
    const result = await runDerive([INVALID_FIXTURE]);

    expect(result.success).toBe(false);
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(result.message).toContain('diagnostic');
  });

  it('--json outputs full TestSuiteTopology as JSON', async () => {
    const result = await runDerive(['--json', VALID_FIXTURE]);

    expect(result.success).toBe(true);
    expect(result.json).toBeDefined();
    const parsed = JSON.parse(result.json!);
    expect(parsed).toHaveProperty('suites');
    expect(parsed).toHaveProperty('metadata');
  });

  it('delegates to MomentParser + deriveTopology', async () => {
    const result = await runDerive([VALID_FIXTURE]);

    expect(result.success).toBe(true);
    expect(result.topology).toBeDefined();
    expect(result.topology!.suites).toBeDefined();
    expect(result.topology!.metadata).toBeDefined();
  });

  it('no arguments returns failure with usage message', async () => {
    const result = await runDerive([]);

    expect(result.success).toBe(false);
    expect(result.message).toContain('Usage:');
  });

  it('nonexistent path returns failure with file-not-found', async () => {
    const nonexistent = join(tmpdir(), 'nonexistent-derive-12345.moment');
    const result = await runDerive([nonexistent]);

    expect(result.success).toBe(false);
    expect(result.message).toContain('File not found');
  });
});
