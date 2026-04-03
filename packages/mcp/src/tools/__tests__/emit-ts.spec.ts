import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { emitTs } from '../emit-ts.js';

const VALID_FIXTURE = resolve(__dirname, '../../../../../fixtures/valid/unified/vet-clinic.moment');
const INVALID_FIXTURE = resolve(__dirname, '../../../../../fixtures/invalid/no-declaration.moment');

function parseContent(result: Awaited<ReturnType<typeof emitTs>>): Record<string, unknown> {
  return JSON.parse((result.content[0] as { text: string }).text);
}

describe('emitTs', () => {
  it('returns success with file counts for a valid spec', async () => {
    const result = await emitTs({ filePath: VALID_FIXTURE, dryRun: true });
    expect(result.isError).toBeUndefined();
    const data = parseContent(result);
    expect(data.success).toBe(true);
    expect(typeof data.tsFileCount).toBe('number');
    expect((data.tsFileCount as number)).toBeGreaterThan(0);
    expect(typeof data.scaffoldFileCount).toBe('number');
  });

  it('includes fileList when dryRun is true', async () => {
    const result = await emitTs({ filePath: VALID_FIXTURE, dryRun: true });
    const data = parseContent(result);
    expect(Array.isArray(data.fileList)).toBe(true);
    expect((data.fileList as string[]).length).toBeGreaterThan(0);
  });

  it('omits fileList when dryRun is false', async () => {
    const result = await emitTs({ filePath: VALID_FIXTURE, dryRun: false });
    const data = parseContent(result);
    expect(data.success).toBe(true);
    // fileList is undefined (not included) when not dry run
    expect(data.fileList).toBeUndefined();
  });

  it('returns PARSE_FAILED error for an invalid spec', async () => {
    const result = await emitTs({ filePath: INVALID_FIXTURE });
    expect(result.isError).toBe(true);
    const data = parseContent(result);
    expect(data.errorCode).toBe('PARSE_FAILED');
  });

  it('returns TOOL_ERROR for a nonexistent file', async () => {
    const result = await emitTs({ filePath: '/tmp/nonexistent.moment' });
    expect(result.isError).toBe(true);
    const data = parseContent(result);
    expect(data.errorCode).toBe('TOOL_ERROR');
  });
});
