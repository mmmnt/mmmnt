import { describe, it, expect } from 'vitest';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { runSyncAccept } from './sync-accept.js';

const FIXTURES = resolve(import.meta.dirname, '../../../../fixtures');
const VALID_FIXTURE = resolve(FIXTURES, 'valid/minimal/contexts/ordering.moment');

describe('moment sync accept', () => {
  it('no arguments returns usage message', async () => {
    const result = await runSyncAccept([]);
    expect(result.success).toBe(false);
    expect(result.message).toContain('Usage:');
  });

  it('returns "not yet fully implemented" for any file argument', async () => {
    const result = await runSyncAccept(['--all', VALID_FIXTURE]);
    expect(result.success).toBe(false);
    expect(result.message).toContain('not yet fully implemented');
    expect(result.message).toContain('not persisted');
  });

  it('returns "not yet fully implemented" for specific proposal IDs', async () => {
    const result = await runSyncAccept([VALID_FIXTURE, 'prop-001']);
    expect(result.success).toBe(false);
    expect(result.message).toContain('not yet fully implemented');
  });

  it('returns "not yet fully implemented" even for nonexistent paths', async () => {
    // The guard fires after the file-path check but before parse. A
    // nonexistent path hits the "file not found" branch first — that's
    // fine, it's a cheaper error that makes more sense to the user.
    const nonexistent = join(tmpdir(), 'nonexistent-sync-accept-12345.moment');
    const result = await runSyncAccept([nonexistent]);
    expect(result.success).toBe(false);
    // Either "File not found" (existing check) or "not yet fully
    // implemented" (guard) — both are correct failures.
    expect(result.message).toMatch(/File not found|not yet fully implemented/);
  });

  it('returns "not yet fully implemented" with --json', async () => {
    const result = await runSyncAccept(['--all', '--json', VALID_FIXTURE]);
    expect(result.success).toBe(false);
    expect(result.message).toContain('not yet fully implemented');
  });
});
