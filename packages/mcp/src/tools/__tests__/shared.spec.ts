import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { okResult, errorResult, wrapTool, loadModel, projectDirOf } from '../shared.js';

describe('okResult', () => {
  it('produces a CallToolResult with JSON text content', () => {
    const result = okResult({ success: true, count: 3 });
    expect(result.isError).toBeUndefined();
    expect(result.content).toHaveLength(1);
    expect(result.content[0]).toEqual({
      type: 'text',
      text: JSON.stringify({ success: true, count: 3 }, null, 2),
    });
  });

  it('handles null and array values', () => {
    const result = okResult([1, 2, null]);
    const parsed = JSON.parse((result.content[0] as { text: string }).text);
    expect(parsed).toEqual([1, 2, null]);
  });
});

describe('errorResult', () => {
  it('produces isError: true with errorCode and message', () => {
    const result = errorResult('FILE_NOT_FOUND', 'File missing');
    expect(result.isError).toBe(true);
    expect(result.content).toHaveLength(1);
    const parsed = JSON.parse((result.content[0] as { text: string }).text);
    expect(parsed.errorCode).toBe('FILE_NOT_FOUND');
    expect(parsed.message).toBe('File missing');
  });

  it('nests context under a context key', () => {
    const result = errorResult('BAD', 'oops', { extra: 42 });
    const parsed = JSON.parse((result.content[0] as { text: string }).text);
    expect(parsed.context.extra).toBe(42);
    expect(parsed.errorCode).toBe('BAD');
    expect(parsed.message).toBe('oops');
  });
});

describe('wrapTool', () => {
  it('returns the inner function result on success', async () => {
    const inner = async (_p: { x: number }) => okResult({ ok: true });
    const wrapped = wrapTool(inner);
    const result = await wrapped({ x: 1 });
    expect(result.isError).toBeUndefined();
  });

  it('catches thrown errors and returns an errorResult', async () => {
    const inner = async (_p: { x: number }): ReturnType<typeof okResult> => {
      throw new Error('boom');
    };
    const wrapped = wrapTool(inner);
    const result = await wrapped({ x: 1 });
    expect(result.isError).toBe(true);
    const parsed = JSON.parse((result.content[0] as { text: string }).text);
    expect(parsed.errorCode).toBe('TOOL_ERROR');
    expect(parsed.message).toBe('boom');
  });

  it('handles non-Error thrown values', async () => {
    const inner = async (_p: unknown): ReturnType<typeof okResult> => {
      throw 'string-error';
    };
    const wrapped = wrapTool(inner);
    const result = await wrapped({});
    expect(result.isError).toBe(true);
    const parsed = JSON.parse((result.content[0] as { text: string }).text);
    expect(parsed.message).toBe('string-error');
  });
});

describe('loadModel', () => {
  const FIXTURES = resolve(__dirname, '../../../../../fixtures/valid');

  it('loads a single .moment file', async () => {
    const result = await loadModel(resolve(FIXTURES, 'unified/vet-clinic.moment'));
    expect(result.success).toBe(true);
    expect(result.isProject).toBe(false);
    expect(result.files).toEqual([resolve(FIXTURES, 'unified/vet-clinic.moment')]);
  });

  it('loads a model directory as one project (ADR-038 project mode)', async () => {
    const dir = resolve(FIXTURES, 'model-completeness');
    const result = await loadModel(dir);
    expect(result.success).toBe(true);
    expect(result.isProject).toBe(true);
    expect(result.files.length).toBeGreaterThan(1);
    expect(result.path).toBe(dir);
  });

  it('throws for a path that does not exist', async () => {
    await expect(loadModel('/tmp/nonexistent-file-abc123.moment')).rejects.toThrow(
      'File not found',
    );
  });
});

describe('projectDirOf', () => {
  it("is a model directory itself, or a file's parent", () => {
    const dir = resolve(__dirname, '../../../../../fixtures/valid/model-completeness');
    expect(projectDirOf(dir)).toBe(dir);
    expect(projectDirOf(resolve(dir, 'flows/recall.moment'))).toBe(resolve(dir, 'flows'));
  });
});
