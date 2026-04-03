import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { validate } from '../validate.js';

const VALID_FIXTURE = resolve(__dirname, '../../../../../fixtures/valid/unified/vet-clinic.moment');
const INVALID_FIXTURE = resolve(__dirname, '../../../../../fixtures/invalid/no-declaration.moment');

function parseContent(result: Awaited<ReturnType<typeof validate>>): Record<string, unknown> {
  return JSON.parse((result.content[0] as { text: string }).text);
}

describe('validate', () => {
  it('returns success with context and flow counts for a valid file', async () => {
    const result = await validate({ filePath: VALID_FIXTURE });
    expect(result.isError).toBeUndefined();
    const data = parseContent(result);
    expect(data.success).toBe(true);
    expect(typeof data.contextCount).toBe('number');
    expect((data.contextCount as number)).toBeGreaterThan(0);
    expect(typeof data.flowCount).toBe('number');
  });

  it('returns success:false with diagnostics for an invalid file', async () => {
    const result = await validate({ filePath: INVALID_FIXTURE });
    expect(result.isError).toBeUndefined();
    const data = parseContent(result);
    expect(data.success).toBe(false);
    expect(Array.isArray(data.diagnostics)).toBe(true);
    expect((data.diagnostics as unknown[]).length).toBeGreaterThan(0);
  });

  it('returns TOOL_ERROR for a nonexistent file', async () => {
    const result = await validate({ filePath: '/tmp/does-not-exist.moment' });
    expect(result.isError).toBe(true);
    const data = parseContent(result);
    expect(data.errorCode).toBe('TOOL_ERROR');
    expect(data.message).toContain('File not found');
  });
});
