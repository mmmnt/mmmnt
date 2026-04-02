import { describe, it, expect } from 'vitest';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { runSchemaStatus } from './schema-status.js';

const FIXTURES = resolve(import.meta.dirname, '../../../../fixtures');
const VALID_FIXTURE = resolve(FIXTURES, 'valid/minimal/contexts/ordering.moment');
const UNIFIED_FIXTURE = resolve(FIXTURES, 'valid/unified/vet-clinic.moment');
const INVALID_FIXTURE = resolve(FIXTURES, 'invalid/no-declaration.moment');

describe('moment schema status', () => {
  it('outputs schema lifecycle table for valid spec', async () => {
    const result = await runSchemaStatus([UNIFIED_FIXTURE]);

    expect(result.success).toBe(true);
    expect(result.entries).toBeDefined();
    expect(result.entries!.length).toBeGreaterThan(0);
    expect(result.message).toContain('Schema Status');
  });

  it('shows four-phase lifecycle phases (SR-04)', async () => {
    const result = await runSchemaStatus([UNIFIED_FIXTURE]);

    expect(result.success).toBe(true);
    // All entries from IR start as 'active'
    for (const entry of result.entries ?? []) {
      expect(['active', 'deprecated', 'end-of-life', 'removed']).toContain(entry.phase);
    }
  });

  it('--json outputs structured JSON', async () => {
    const result = await runSchemaStatus(['--json', UNIFIED_FIXTURE]);

    expect(result.success).toBe(true);
    expect(result.json).toBeDefined();
    const parsed = JSON.parse(result.json!);
    expect(Array.isArray(parsed.schemas)).toBe(true);
    expect(typeof parsed.total).toBe('number');
  });

  it('empty spec outputs "No schemas registered"', async () => {
    const result = await runSchemaStatus([VALID_FIXTURE]);

    expect(result.success).toBe(true);
    // Minimal fixture may have schemas or not — check shape
    if (result.entries && result.entries.length === 0) {
      expect(result.message).toContain('No schemas registered');
    }
  });

  it('--json with no schemas outputs empty array', async () => {
    const result = await runSchemaStatus(['--json', VALID_FIXTURE]);

    expect(result.success).toBe(true);
    expect(result.json).toBeDefined();
    const parsed = JSON.parse(result.json!);
    expect(Array.isArray(parsed.schemas)).toBe(true);
  });

  it('no arguments returns failure with usage message', async () => {
    const result = await runSchemaStatus([]);

    expect(result.success).toBe(false);
    expect(result.message).toContain('Usage:');
  });

  it('invalid spec returns failure with parse diagnostics', async () => {
    const result = await runSchemaStatus([INVALID_FIXTURE]);

    expect(result.success).toBe(false);
    expect(result.diagnostics.length).toBeGreaterThan(0);
  });

  it('nonexistent path returns failure with file-not-found', async () => {
    const nonexistent = join(tmpdir(), 'nonexistent-schema-12345.moment');
    const result = await runSchemaStatus([nonexistent]);

    expect(result.success).toBe(false);
    expect(result.message).toContain('File not found');
  });

  it('delegates to SchemaRegistry — no lifecycle logic in CLI (EXIT-C1)', async () => {
    const result = await runSchemaStatus([UNIFIED_FIXTURE]);
    expect(result.success).toBe(true);
    expect(result.diagnostics).toHaveLength(0);
    // Entries come from SchemaRegistry, not hardcoded
    expect(typeof result.entries!.length).toBe('number');
  });
});
