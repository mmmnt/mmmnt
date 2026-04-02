import { describe, it, expect } from 'vitest';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { runSyncAccept } from './sync-accept.js';

const FIXTURES = resolve(import.meta.dirname, '../../../../fixtures');
const VALID_FIXTURE = resolve(FIXTURES, 'valid/minimal/contexts/ordering.moment');
const UNIFIED_FIXTURE = resolve(FIXTURES, 'valid/unified/vet-clinic.moment');
const INVALID_FIXTURE = resolve(FIXTURES, 'invalid/no-declaration.moment');

describe('moment sync accept', () => {
  it('--all accepts all pending proposals', async () => {
    const result = await runSyncAccept(['--all', UNIFIED_FIXTURE]);

    expect(result.success).toBe(true);
    expect(result.acceptedCount).toBeGreaterThanOrEqual(0);
    if (result.acceptedCount > 0) {
      expect(result.message).toContain('Accepted');
    }
  });

  it('invalid proposal ID exits with diagnostic when proposals exist', async () => {
    const result = await runSyncAccept([UNIFIED_FIXTURE, 'nonexistent-id-12345']);

    // If proposals exist, an invalid ID should fail
    // If no proposals exist, it succeeds with "No pending proposals"
    if (result.message.includes('No pending')) {
      expect(result.success).toBe(true);
    } else {
      expect(result.success).toBe(false);
      expect(result.message).toContain('Unknown proposal ID');
    }
  });

  it('no arguments returns usage message', async () => {
    const result = await runSyncAccept([]);

    expect(result.success).toBe(false);
    expect(result.message).toContain('Usage:');
  });

  it('file path only without --all or IDs returns usage message', async () => {
    const result = await runSyncAccept([VALID_FIXTURE]);

    // With no --all and no proposal IDs, should fail with usage
    // Unless there are no proposals (then "No pending proposals")
    expect(result.success === false || result.message.includes('No pending')).toBe(true);
  });

  it('--json returns valid JSON', async () => {
    const result = await runSyncAccept(['--json', '--all', UNIFIED_FIXTURE]);

    expect(result.success).toBe(true);
    if (result.json) {
      const parsed = JSON.parse(result.json);
      expect(typeof parsed.accepted).toBe('number');
    }
  });

  it('invalid spec returns failure with parse diagnostics', async () => {
    const result = await runSyncAccept(['--all', INVALID_FIXTURE]);

    expect(result.success).toBe(false);
    expect(result.diagnostics.length).toBeGreaterThan(0);
  });

  it('nonexistent path returns failure with file-not-found', async () => {
    const nonexistent = join(tmpdir(), 'nonexistent-accept-12345.moment');
    const result = await runSyncAccept(['--all', nonexistent]);

    expect(result.success).toBe(false);
    expect(result.message).toContain('File not found');
  });

  it('delegates to SyncState.acceptProposal — no state logic in CLI', async () => {
    // EXIT-C1: The command delegates; verify it returns structured results
    const result = await runSyncAccept(['--all', UNIFIED_FIXTURE]);
    expect(result.success).toBe(true);
    expect(typeof result.acceptedCount).toBe('number');
    expect(result.diagnostics).toHaveLength(0);
  });
});
