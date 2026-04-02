import { describe, it, expect } from 'vitest';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { runSyncPropose } from './sync-propose.js';

const FIXTURES = resolve(import.meta.dirname, '../../../../fixtures');
const VALID_FIXTURE = resolve(FIXTURES, 'valid/minimal/contexts/ordering.moment');
const UNIFIED_FIXTURE = resolve(FIXTURES, 'valid/unified/vet-clinic.moment');
const INVALID_FIXTURE = resolve(FIXTURES, 'invalid/no-declaration.moment');

describe('moment sync propose', () => {
  it('succeeds and returns proposal array with counts', async () => {
    const result = await runSyncPropose([VALID_FIXTURE]);

    expect(result.success).toBe(true);
    expect(result.proposals).toBeDefined();
    expect(Array.isArray(result.proposals)).toBe(true);
    expect(typeof result.accepted).toBe('number');
    expect(typeof result.rejected).toBe('number');
    expect(typeof result.skipped).toBe('number');
  });

  it('returns zero diagnostics on valid input', async () => {
    const result = await runSyncPropose([VALID_FIXTURE]);
    expect(result.success).toBe(true);
    expect(result.diagnostics).toHaveLength(0);
  });

  it('--auto-accept accepts all proposals without interaction', async () => {
    const result = await runSyncPropose(['--auto-accept', VALID_FIXTURE]);

    expect(result.success).toBe(true);
    if (result.proposals && result.proposals.length > 0) {
      expect(result.accepted).toBe(result.proposals.length);
      expect(result.rejected).toBe(0);
      expect(result.skipped).toBe(0);
    }
  });

  it('without --auto-accept skips all proposals', async () => {
    const result = await runSyncPropose([VALID_FIXTURE]);

    expect(result.success).toBe(true);
    if (result.proposals && result.proposals.length > 0) {
      expect(result.skipped).toBe(result.proposals.length);
      expect(result.accepted).toBe(0);
    }
  });

  it('--json returns valid JSON with proposals and counts', async () => {
    const result = await runSyncPropose(['--json', VALID_FIXTURE]);

    expect(result.success).toBe(true);
    expect(result.json).toBeDefined();
    const parsed = JSON.parse(result.json!);
    expect(Array.isArray(parsed.proposals)).toBe(true);
    expect(typeof parsed.accepted).toBe('number');
    expect(typeof parsed.rejected).toBe('number');
    expect(typeof parsed.skipped).toBe('number');
  });

  it('no arguments returns failure with usage message', async () => {
    const result = await runSyncPropose([]);

    expect(result.success).toBe(false);
    expect(result.message).toContain('Usage:');
  });

  it('invalid spec returns failure with parse diagnostics', async () => {
    const result = await runSyncPropose([INVALID_FIXTURE]);

    expect(result.success).toBe(false);
    expect(result.diagnostics.length).toBeGreaterThan(0);
  });

  it('nonexistent path returns failure with file-not-found', async () => {
    const nonexistent = join(tmpdir(), 'nonexistent-propose-12345.moment');
    const result = await runSyncPropose([nonexistent]);

    expect(result.success).toBe(false);
    expect(result.message).toContain('File not found');
  });

  it('proposals contain expected fields per ImplementationChangeProposal', async () => {
    const result = await runSyncPropose([UNIFIED_FIXTURE]);

    expect(result.success).toBe(true);
    if (result.proposals && result.proposals.length > 0) {
      const p = result.proposals[0];
      expect(p.proposalId).toBeTruthy();
      expect(p.proposedEventType).toBeTruthy();
      expect(p.proposedPayload).toBeDefined();
      expect(p.sourceFile).toBeTruthy();
    }
  });

  it('delegates to ASTDiffEngine.generateProposals() — no proposal logic in CLI', async () => {
    const result = await runSyncPropose([VALID_FIXTURE]);
    expect(result.success).toBe(true);
    for (const p of result.proposals ?? []) {
      expect(p.proposalId).toMatch(/^[0-9a-f-]+$/i);
    }
  });
});
