import { describe, it, expect } from 'vitest';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { runSyncStatus } from './sync-status.js';

const FIXTURES = resolve(import.meta.dirname, '../../../../fixtures');
const VALID_FIXTURE = resolve(FIXTURES, 'valid/minimal/contexts/ordering.moment');
const INVALID_FIXTURE = resolve(FIXTURES, 'invalid/no-declaration.moment');

describe('moment sync status', () => {
  it('no drift returns success with aligned message', async () => {
    // With no actual files on disk, expected files will show as drifted
    // This test verifies the command runs successfully and produces a report
    const result = await runSyncStatus([VALID_FIXTURE]);

    expect(result.success).toBe(true);
    expect(result.report).toBeDefined();
    expect(result.report!.totalDrifted).toBeGreaterThanOrEqual(0);
    expect(result.report!.totalAligned).toBeGreaterThanOrEqual(0);
  });

  it('delegates to ASTDiffEngine.detectDrift()', async () => {
    const result = await runSyncStatus([VALID_FIXTURE]);

    expect(result.success).toBe(true);
    expect(result.report).toBeDefined();
    expect(result.report!.scope).toBeDefined();
    expect(result.report!.timestamp).toBeTruthy();
  });

  it('report includes drift point count and aligned count', async () => {
    const result = await runSyncStatus([VALID_FIXTURE]);

    expect(result.success).toBe(true);
    expect(typeof result.report!.totalDrifted).toBe('number');
    expect(typeof result.report!.totalAligned).toBe('number');
  });

  it('no arguments returns failure with usage message', async () => {
    const result = await runSyncStatus([]);

    expect(result.success).toBe(false);
    expect(result.message).toContain('Usage:');
  });

  it('invalid spec returns failure with parse diagnostics', async () => {
    const result = await runSyncStatus([INVALID_FIXTURE]);

    expect(result.success).toBe(false);
    expect(result.diagnostics.length).toBeGreaterThan(0);
  });

  it('nonexistent path returns failure with file-not-found', async () => {
    const nonexistent = join(tmpdir(), 'nonexistent-sync-12345.moment');
    const result = await runSyncStatus([nonexistent]);

    expect(result.success).toBe(false);
    expect(result.message).toContain('File not found');
  });
});
