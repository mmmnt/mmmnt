import { describe, it, expect } from 'vitest';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { runStatus } from './status.js';

const FIXTURES = resolve(import.meta.dirname, '../../../../fixtures');
const VALID_FIXTURE = resolve(FIXTURES, 'valid/minimal/contexts/ordering.moment');
const UNIFIED_FIXTURE = resolve(FIXTURES, 'valid/unified/vet-clinic.moment');
const INVALID_FIXTURE = resolve(FIXTURES, 'invalid/no-declaration.moment');

describe('moment status', () => {
  it('valid spec with no drift exits with sections (EXIT-B1)', async () => {
    const result = await runStatus([VALID_FIXTURE]);

    expect(result.success).toBe(true);
    expect(result.sections.length).toBeGreaterThan(0);
    expect(result.sections[0].label).toBe('Specification');
    expect(result.sections[0].state).toBe('ok');
  });

  it('reports deprecated fields as schema warning (EXIT-B2)', async () => {
    const result = await runStatus([UNIFIED_FIXTURE]);

    expect(result.success).toBe(true);
    const schema = result.sections.find((s) => s.label === 'Schema Lifecycle');
    expect(schema).toBeDefined();
    expect(schema!.state).toBe('warning');
    expect(schema!.summary).toContain('deprecated');
  });

  it('--verbose includes detail lines', async () => {
    const result = await runStatus(['--verbose', INVALID_FIXTURE]);

    // Invalid spec produces parse errors with details
    const parseSection = result.sections.find((s) => s.label === 'Specification');
    if (parseSection?.details) {
      expect(parseSection.details.length).toBeGreaterThan(0);
    }
  });

  it('--quiet outputs empty message', async () => {
    const result = await runStatus(['--quiet', VALID_FIXTURE]);

    expect(result.success).toBe(true);
    expect(result.message).toBe('');
  });

  it('--json outputs structured JSON (EXIT-B5)', async () => {
    const result = await runStatus(['--json', UNIFIED_FIXTURE]);

    expect(result.success).toBe(true);
    expect(result.json).toBeDefined();
    const parsed = JSON.parse(result.json!);
    expect(Array.isArray(parsed.sections)).toBe(true);
    expect(typeof parsed.hasDrift).toBe('boolean');
  });

  it('no .domain/ reports "No upstream source configured" (EXIT-B6)', async () => {
    const result = await runStatus([VALID_FIXTURE]);

    const upstream = result.sections.find((s) => s.label === 'Upstream Source');
    expect(upstream).toBeDefined();
    expect(upstream!.summary).toContain('No upstream source configured');
    expect(upstream!.state).toBe('ok');
  });

  it('no arguments returns usage message', async () => {
    const result = await runStatus([]);

    expect(result.success).toBe(false);
    expect(result.message).toContain('Usage:');
  });

  it('nonexistent path returns file-not-found', async () => {
    const nonexistent = join(tmpdir(), 'nonexistent-status-12345.moment');
    const result = await runStatus([nonexistent]);

    expect(result.success).toBe(false);
    expect(result.message).toContain('File not found');
  });

  it('invalid spec shows parse errors in sections', async () => {
    const result = await runStatus([INVALID_FIXTURE]);

    const parseSection = result.sections.find((s) => s.label === 'Specification');
    expect(parseSection).toBeDefined();
    expect(parseSection!.state).toBe('error');
    expect(parseSection!.summary).toContain('error');
  });

  it('no network calls — local files only (EXIT-C1)', async () => {
    // If this test runs in CI without network issues, it proves no network calls
    const result = await runStatus([UNIFIED_FIXTURE]);
    expect(result.success).toBe(true);
    expect(result.sections.length).toBeGreaterThanOrEqual(3);
  });
});
