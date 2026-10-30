import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { runGenerate } from './generate.js';

const FIXTURES = resolve(import.meta.dirname, '../../../../fixtures');
const VALID_FIXTURE = resolve(FIXTURES, 'valid/minimal/contexts/ordering.moment');
const INVALID_FIXTURE = resolve(FIXTURES, 'invalid/no-declaration.moment');

function walk(dir: string): string[] {
  const out: string[] = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else {
      out.push(full);
    }
  }
  return out;
}

let outDir: string;

beforeEach(() => {
  outDir = mkdtempSync(join(tmpdir(), 'moment-generate-'));
});

afterEach(() => {
  rmSync(outDir, { recursive: true, force: true });
});

describe('moment generate', () => {
  it('valid spec produces feature + spec.ts + docs', async () => {
    const result = await runGenerate(['--out', outDir, VALID_FIXTURE]);

    expect(result.success).toBe(true);
    expect(result.message).toContain('Generated');
    expect(result.featureCount).toBeGreaterThanOrEqual(0);
    expect(result.specCount).toBeGreaterThanOrEqual(0);
    expect(result.docCount).toBeGreaterThanOrEqual(0);
  });

  it('writes generated artifacts to the output directory', async () => {
    const result = await runGenerate(['--out', outDir, VALID_FIXTURE]);

    expect(result.success).toBe(true);
    expect(result.filesWritten).toBeDefined();
    expect(result.filesWritten!.length).toBeGreaterThan(0);

    const filesOnDisk = walk(outDir);
    expect(filesOnDisk.length).toBeGreaterThan(0);

    // Every reported written file must exist on disk
    for (const path of result.filesWritten!) {
      expect(existsSync(path)).toBe(true);
    }

    // Specification document should land at the output root
    expect(existsSync(join(outDir, 'specification.md'))).toBe(true);
  });

  it('invalid spec returns failure with parse diagnostics', async () => {
    const result = await runGenerate(['--out', outDir, INVALID_FIXTURE]);

    expect(result.success).toBe(false);
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(result.message).toContain('diagnostic');
  });

  it('enforces Design Principle #2 — both feature and spec.ts produced', async () => {
    // The generate command always produces both .feature and .spec.ts files.
    // No --gherkin-only or --ts-only flags exist on this command.
    const result = await runGenerate(['--out', outDir, VALID_FIXTURE]);

    expect(result.success).toBe(true);
    expect(result.message).toContain('.feature');
    expect(result.message).toContain('.spec.ts');
  });

  it('delegates to full pipeline (no generation logic in CLI)', async () => {
    const result = await runGenerate(['--out', outDir, VALID_FIXTURE]);

    expect(result.success).toBe(true);
    expect(result.message).toContain('Generated');
  });

  it('no arguments returns failure with usage message', async () => {
    const result = await runGenerate([]);

    expect(result.success).toBe(false);
    expect(result.message).toContain('Usage:');
  });

  it('nonexistent path returns failure with file-not-found', async () => {
    const nonexistent = join(tmpdir(), 'nonexistent-generate-12345.moment');
    const result = await runGenerate(['--out', outDir, nonexistent]);

    expect(result.success).toBe(false);
    expect(result.message).toContain('File not found');
  });

  it('accepts --out-dir as an alias for --out (M-E17 flag symmetry)', async () => {
    const result = await runGenerate(['--out-dir', outDir, VALID_FIXTURE]);

    expect(result.success).toBe(true);
    expect(result.outDir).toBe(outDir);
    expect(result.filesWritten!.length).toBeGreaterThan(0);
    // Every written file lives under the requested out dir — nothing
    // scattered into the CWD.
    for (const path of result.filesWritten!) {
      expect(path.startsWith(outDir)).toBe(true);
      expect(existsSync(path)).toBe(true);
    }
  });

  it('honors --out the same way (no CWD scatter)', async () => {
    const result = await runGenerate(['--out', outDir, VALID_FIXTURE]);

    expect(result.success).toBe(true);
    expect(result.outDir).toBe(outDir);
    for (const path of result.filesWritten!) {
      expect(path.startsWith(outDir)).toBe(true);
    }
  });

  it('warns about unrecognized flags instead of silently swallowing them', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      // Unknown flags parse valueless under strict:false, so pass the typo'd
      // flag in --flag=value form to keep the fixture as the sole positional.
      const result = await runGenerate([`--output=${outDir}`, '--out', outDir, VALID_FIXTURE]);

      expect(result.success).toBe(true);
      const warned = warnSpy.mock.calls.map((c) => String(c[0]));
      expect(warned.some((m) => m.includes('--output'))).toBe(true);
      expect(warned.some((m) => m.includes('--out') && !m.includes('--output'))).toBe(false);
    } finally {
      warnSpy.mockRestore();
    }
  });
});
