import { describe, it, expect, afterEach } from 'vitest';
import { resolve, join } from 'node:path';
import { mkdirSync, writeFileSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { status } from '../status.js';

const VALID_FIXTURE = resolve(__dirname, '../../../../../fixtures/valid/unified/vet-clinic.moment');
const INVALID_FIXTURE = resolve(__dirname, '../../../../../fixtures/invalid/no-declaration.moment');

function parseContent(result: Awaited<ReturnType<typeof status>>): Record<string, unknown> {
  return JSON.parse((result.content[0] as { text: string }).text);
}

describe('status', () => {
  const tempDirs: string[] = [];

  function makeTempDir(): string {
    const dir = join(tmpdir(), `mcp-test-status-${Date.now()}-${Math.random().toString(36).slice(2)}`);
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

  it('returns sections array with Specification/Schema/Upstream for a valid spec', async () => {
    const result = await status({ filePath: VALID_FIXTURE });
    expect(result.isError).toBeUndefined();
    const data = parseContent(result);
    expect(data.success).toBe(true);
    const sections = data.sections as Array<{ label: string; state: string; summary: string }>;
    expect(Array.isArray(sections)).toBe(true);

    const labels = sections.map((s) => s.label);
    expect(labels).toContain('Specification');
    expect(labels).toContain('Upstream Source');

    const specSection = sections.find((s) => s.label === 'Specification');
    expect(specSection!.state).toBe('ok');
  });

  it('returns Specification section with error state for an invalid spec', async () => {
    const result = await status({ filePath: INVALID_FIXTURE });
    expect(result.isError).toBeUndefined();
    const data = parseContent(result);
    const sections = data.sections as Array<{ label: string; state: string; summary: string }>;
    const specSection = sections.find((s) => s.label === 'Specification');
    expect(specSection).toBeDefined();
    expect(specSection!.state).toBe('error');
  });

  it('returns TOOL_ERROR for a nonexistent file', async () => {
    const result = await status({ filePath: '/tmp/no-such-file.moment' });
    expect(result.isError).toBe(true);
  });

  it('reports Upstream Source as drift when .domain/ exists but no fingerprint', async () => {
    const tempDir = makeTempDir();
    const specPath = join(tempDir, 'test.moment');
    copyFileSync(VALID_FIXTURE, specPath);

    // Create .domain/ dir without a fingerprint
    mkdirSync(join(tempDir, '.domain'), { recursive: true });

    const result = await status({ filePath: specPath });
    expect(result.isError).toBeUndefined();
    const data = parseContent(result);
    const sections = data.sections as Array<{ label: string; state: string; summary: string }>;
    const upstream = sections.find((s) => s.label === 'Upstream Source');
    expect(upstream).toBeDefined();
    expect(upstream!.state).toBe('drift');
    expect(upstream!.summary).toContain('no fingerprint');
  });

  it('reports Upstream Source ok when fingerprint exists', async () => {
    const tempDir = makeTempDir();
    const specPath = join(tempDir, 'test.moment');
    copyFileSync(VALID_FIXTURE, specPath);

    // Create .domain/ and .moment/.upstream-fingerprint.json
    mkdirSync(join(tempDir, '.domain'), { recursive: true });
    mkdirSync(join(tempDir, '.moment'), { recursive: true });
    writeFileSync(
      join(tempDir, '.moment', '.upstream-fingerprint.json'),
      JSON.stringify({
        sift: {
          specificationId: 'test-spec',
          contentHash: 'abc123',
          importedAt: '2025-06-01T00:00:00Z',
          boundedContextCount: 3,
        },
      }),
    );

    const result = await status({ filePath: specPath });
    expect(result.isError).toBeUndefined();
    const data = parseContent(result);
    const sections = data.sections as Array<{ label: string; state: string; summary: string }>;
    const upstream = sections.find((s) => s.label === 'Upstream Source');
    expect(upstream).toBeDefined();
    expect(upstream!.state).toBe('ok');
    expect(upstream!.summary).toContain('Last import');
    expect(upstream!.summary).toContain('3 contexts');
  });

  it('reports Upstream Source warning when fingerprint is unreadable', async () => {
    const tempDir = makeTempDir();
    const specPath = join(tempDir, 'test.moment');
    copyFileSync(VALID_FIXTURE, specPath);

    mkdirSync(join(tempDir, '.domain'), { recursive: true });
    mkdirSync(join(tempDir, '.moment'), { recursive: true });
    writeFileSync(join(tempDir, '.moment', '.upstream-fingerprint.json'), 'not json {{{');

    const result = await status({ filePath: specPath });
    expect(result.isError).toBeUndefined();
    const data = parseContent(result);
    const sections = data.sections as Array<{ label: string; state: string; summary: string }>;
    const upstream = sections.find((s) => s.label === 'Upstream Source');
    expect(upstream).toBeDefined();
    expect(upstream!.state).toBe('warning');
    expect(upstream!.summary).toContain('unreadable');
  });

  it('includes Schema Lifecycle section for a valid spec', async () => {
    const result = await status({ filePath: VALID_FIXTURE });
    const data = parseContent(result);
    const sections = data.sections as Array<{ label: string; state: string; summary: string }>;
    const schema = sections.find((s) => s.label === 'Schema Lifecycle');
    expect(schema).toBeDefined();
    expect(['ok', 'warning']).toContain(schema!.state);
  });

  it('includes Implementation Sync section for a valid spec', async () => {
    const result = await status({ filePath: VALID_FIXTURE });
    const data = parseContent(result);
    const sections = data.sections as Array<{ label: string; state: string; summary: string }>;
    const sync = sections.find((s) => s.label === 'Implementation Sync');
    expect(sync).toBeDefined();
  });

  it('sets hasDrift to true when there are error or drift sections', async () => {
    const result = await status({ filePath: INVALID_FIXTURE });
    const data = parseContent(result);
    const sections = data.sections as Array<{ label: string; state: string }>;
    const hasErrorOrDrift = sections.some((s) => s.state === 'drift' || s.state === 'error');
    expect(data.hasDrift).toBe(hasErrorOrDrift);
  });
});
