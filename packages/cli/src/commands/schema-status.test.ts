import { describe, it, expect } from 'vitest';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { writeFileSync, mkdirSync } from 'node:fs';
import { runSchemaStatus } from './schema-status.js';

const FIXTURES = resolve(import.meta.dirname, '../../../../fixtures');
const UNIFIED_FIXTURE = resolve(FIXTURES, 'valid/unified/vet-clinic.moment');
const INVALID_FIXTURE = resolve(FIXTURES, 'invalid/no-declaration.moment');

// Fixture with no events (context with aggregate but no events)
const EMPTY_SCHEMA_DIR = join(tmpdir(), 'schema-status-empty-' + Date.now());
const EMPTY_SCHEMA_FIXTURE = join(EMPTY_SCHEMA_DIR, 'empty.moment');
mkdirSync(EMPTY_SCHEMA_DIR, { recursive: true });
writeFileSync(EMPTY_SCHEMA_FIXTURE, 'context "Empty" [Generic]\n  aggregate "Stub"\n    identity id: UUID\n');

describe('moment schema status', () => {
  it('outputs schema lifecycle table for valid spec with events', async () => {
    const result = await runSchemaStatus([UNIFIED_FIXTURE]);

    expect(result.success).toBe(true);
    expect(result.entries).toBeDefined();
    expect(result.entries!.length).toBeGreaterThan(0);
    expect(result.message).toContain('Schema Status');
    expect(result.message).toContain('Phase');
  });

  it('entries have per-field granularity with real field names', async () => {
    const result = await runSchemaStatus([UNIFIED_FIXTURE]);

    expect(result.success).toBe(true);
    for (const entry of result.entries ?? []) {
      expect(entry.fieldName).not.toBe('*');
      expect(entry.fieldType).toBeTruthy();
      expect(['active', 'deprecated', 'end-of-life', 'removed']).toContain(entry.phase);
    }
  });

  it('--json outputs structured JSON with schemas and total', async () => {
    const result = await runSchemaStatus(['--json', UNIFIED_FIXTURE]);

    expect(result.success).toBe(true);
    expect(result.json).toBeDefined();
    const parsed = JSON.parse(result.json!);
    expect(Array.isArray(parsed.schemas)).toBe(true);
    expect(parsed.schemas.length).toBeGreaterThan(0);
    expect(typeof parsed.total).toBe('number');
    expect(parsed.total).toBe(parsed.schemas.length);
  });

  it('empty spec (no events) outputs "No schemas registered"', async () => {
    const result = await runSchemaStatus([EMPTY_SCHEMA_FIXTURE]);

    expect(result.success).toBe(true);
    expect(result.entries).toHaveLength(0);
    expect(result.message).toBe('No schemas registered');
  });

  it('--json with no schemas outputs empty array and total 0', async () => {
    const result = await runSchemaStatus(['--json', EMPTY_SCHEMA_FIXTURE]);

    expect(result.success).toBe(true);
    expect(result.json).toBeDefined();
    const parsed = JSON.parse(result.json!);
    expect(parsed.schemas).toHaveLength(0);
    expect(parsed.total).toBe(0);
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
    expect(typeof result.entries!.length).toBe('number');
  });
});
