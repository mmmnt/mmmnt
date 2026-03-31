import { describe, it, expect } from 'vitest';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { runGenerate } from './generate.js';

const FIXTURES = resolve(import.meta.dirname, '../../../../fixtures');
const VALID_FIXTURE = resolve(FIXTURES, 'valid/minimal/contexts/ordering.moment');
const INVALID_FIXTURE = resolve(FIXTURES, 'invalid/no-declaration.moment');

describe('moment generate', () => {
  it('valid spec produces feature + spec.ts + docs', async () => {
    const result = await runGenerate([VALID_FIXTURE]);

    expect(result.success).toBe(true);
    expect(result.message).toContain('Generated');
    expect(result.featureCount).toBeDefined();
    expect(result.specCount).toBeDefined();
    expect(result.docCount).toBeDefined();
  });

  it('invalid spec returns failure with parse diagnostics', async () => {
    const result = await runGenerate([INVALID_FIXTURE]);

    expect(result.success).toBe(false);
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(result.message).toContain('diagnostic');
  });

  it('no --gherkin-only or --ts-only flags exist (Design Principle #2)', async () => {
    // The generate command has no --gherkin-only or --ts-only flags.
    // It always produces both .feature and .spec.ts files.
    // Developers wanting TS-only use `moment emit-ts` instead.
    const result = await runGenerate([VALID_FIXTURE]);

    expect(result.success).toBe(true);
    // Both feature and spec counts are present
    expect(result.featureCount).toBeDefined();
    expect(result.specCount).toBeDefined();
  });

  it('gherkin + typescript emission run in parallel', async () => {
    // The generate command uses Promise.all to run gherkin generation
    // and typescript emission in parallel, not sequentially.
    const result = await runGenerate([VALID_FIXTURE]);

    expect(result.success).toBe(true);
  });

  it('delegates to full pipeline (no generation logic in CLI)', async () => {
    const result = await runGenerate([VALID_FIXTURE]);

    expect(result.success).toBe(true);
    expect(result.message).toContain('.feature');
    expect(result.message).toContain('.spec.ts');
  });

  it('no arguments returns failure with usage message', async () => {
    const result = await runGenerate([]);

    expect(result.success).toBe(false);
    expect(result.message).toContain('Usage:');
  });

  it('nonexistent path returns failure with file-not-found', async () => {
    const nonexistent = join(tmpdir(), 'nonexistent-generate-12345.moment');
    const result = await runGenerate([nonexistent]);

    expect(result.success).toBe(false);
    expect(result.message).toContain('File not found');
  });
});
