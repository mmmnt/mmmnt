import { describe, it, expect, afterEach } from 'vitest';
import { resolve, join } from 'node:path';
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { importSift } from '../import.js';

const SIFT_FIXTURE = resolve(__dirname, '../../../../../fixtures/valid/sift/domain');

function parseContent(result: Awaited<ReturnType<typeof importSift>>): Record<string, unknown> {
  return JSON.parse((result.content[0] as { text: string }).text);
}

describe('importSift', () => {
  const tempDirs: string[] = [];

  function makeTempDir(): string {
    const dir = join(tmpdir(), `mcp-test-import-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(dir, { recursive: true });
    tempDirs.push(dir);
    return dir;
  }

  afterEach(() => {
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  it('imports from a valid .domain/ directory with JSONL files', async () => {
    const outDir = makeTempDir();
    const result = await importSift({ domainDir: SIFT_FIXTURE, outputDir: outDir });
    expect(result.isError).toBeUndefined();
    const data = parseContent(result);
    expect(data.success).toBe(true);
    expect(typeof data.filesWritten).toBe('number');
    expect((data.filesWritten as number)).toBeGreaterThan(0);
    expect((data.eventsProcessed as number)).toBeGreaterThan(0);

    // Verify fingerprint was written
    expect(existsSync(join(outDir, '.moment', '.upstream-fingerprint.json'))).toBe(true);
  });

  it('returns error for a nonexistent directory', async () => {
    const result = await importSift({ domainDir: '/tmp/nonexistent-domain-xyz' });
    expect(result.isError).toBe(true);
    const data = parseContent(result);
    expect(data.errorCode).toBeDefined();
  });

  it('returns error when domain directory exists but has no JSONL files', async () => {
    const emptyDir = makeTempDir();
    const result = await importSift({ domainDir: emptyDir });
    expect(result.isError).toBe(true);
    const data = parseContent(result);
    expect(data.errorCode).toBe('IMPORT_FAILED');
  });

  it('returns error when domain directory has empty JSONL files', async () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, 'empty.jsonl'), '');
    const result = await importSift({ domainDir: dir });
    expect(result.isError).toBe(true);
    const data = parseContent(result);
    expect(data.errorCode).toBe('IMPORT_FAILED');
  });
});
