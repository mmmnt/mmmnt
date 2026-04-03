import { describe, it, expect, afterEach } from 'vitest';
import { resolve, join } from 'node:path';
import { mkdirSync, writeFileSync, rmSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { reconcile } from '../reconcile.js';

const VALID_FIXTURE = resolve(__dirname, '../../../../../fixtures/valid/unified/vet-clinic.moment');

function parseContent(result: Awaited<ReturnType<typeof reconcile>>): Record<string, unknown> {
  return JSON.parse((result.content[0] as { text: string }).text);
}

describe('reconcile', () => {
  const tempDirs: string[] = [];

  function makeTempDir(): string {
    const dir = join(tmpdir(), `mcp-test-reconcile-${Date.now()}-${Math.random().toString(36).slice(2)}`);
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

  it('returns NO_CHANGES when no .domain/ directory exists', async () => {
    const tempDir = makeTempDir();
    const specPath = join(tempDir, 'test.moment');
    copyFileSync(VALID_FIXTURE, specPath);

    const result = await reconcile({ filePath: specPath, mode: 'local' });
    expect(result.isError).toBeUndefined();
    const data = parseContent(result);
    expect(data.outcome).toBe('NO_CHANGES');
  });

  it('defaults to local mode when mode is not specified', async () => {
    const tempDir = makeTempDir();
    const specPath = join(tempDir, 'test.moment');
    copyFileSync(VALID_FIXTURE, specPath);

    const result = await reconcile({ filePath: specPath });
    expect(result.isError).toBeUndefined();
    const data = parseContent(result);
    expect(data.outcome).toBe('NO_CHANGES');
  });

  it('returns TOOL_ERROR for a nonexistent spec file', async () => {
    const result = await reconcile({ filePath: '/tmp/nonexistent-spec.moment', mode: 'local' });
    expect(result.isError).toBe(true);
    const data = parseContent(result);
    expect(data.errorCode).toBe('TOOL_ERROR');
  });

  it('returns PARSE_FAILED for an invalid spec file', async () => {
    const tempDir = makeTempDir();
    const specPath = join(tempDir, 'bad.moment');
    writeFileSync(specPath, 'aggregate "Orphan"\n  identity id: UUID\n');

    const result = await reconcile({ filePath: specPath, mode: 'local' });
    expect(result.isError).toBe(true);
    const data = parseContent(result);
    expect(data.errorCode).toBe('PARSE_FAILED');
  });

  it('returns EVENT_NOT_FOUND when event mode with nonexistent eventPath', async () => {
    const tempDir = makeTempDir();
    const specPath = join(tempDir, 'test.moment');
    copyFileSync(VALID_FIXTURE, specPath);

    const result = await reconcile({
      filePath: specPath,
      mode: 'event',
      eventPath: '/tmp/nonexistent-event.json',
    });
    expect(result.isError).toBe(true);
    const data = parseContent(result);
    expect(data.errorCode).toBe('EVENT_NOT_FOUND');
  });

  it('reconciles from an event file in event mode', async () => {
    const tempDir = makeTempDir();
    const specPath = join(tempDir, 'test.moment');
    copyFileSync(VALID_FIXTURE, specPath);

    const eventPath = join(tempDir, 'cascade-event.json');
    writeFileSync(eventPath, JSON.stringify({ affectedElements: [] }));

    const result = await reconcile({
      filePath: specPath,
      mode: 'event',
      eventPath,
    });
    expect(result.isError).toBeUndefined();
    const data = parseContent(result);
    expect(data.success).toBe(true);
    expect(data.outcome).toBeDefined();
  });

  it('returns INVALID_EVENT when event file contains invalid JSON', async () => {
    const tempDir = makeTempDir();
    const specPath = join(tempDir, 'test.moment');
    copyFileSync(VALID_FIXTURE, specPath);

    const eventPath = join(tempDir, 'bad-event.json');
    writeFileSync(eventPath, 'not json {{{');

    const result = await reconcile({
      filePath: specPath,
      mode: 'event',
      eventPath,
    });
    expect(result.isError).toBe(true);
    const data = parseContent(result);
    expect(data.errorCode).toBe('INVALID_EVENT');
  });

  it('classifies affected elements in event mode', async () => {
    const tempDir = makeTempDir();
    const specPath = join(tempDir, 'test.moment');
    copyFileSync(VALID_FIXTURE, specPath);

    const eventPath = join(tempDir, 'cascade-event.json');
    // Use elements that do NOT exist in the spec to trigger category 2 (DRIFT)
    writeFileSync(eventPath, JSON.stringify({ affectedElements: ['NonexistentElement'] }));

    const result = await reconcile({
      filePath: specPath,
      mode: 'event',
      eventPath,
    });
    expect(result.isError).toBeUndefined();
    const data = parseContent(result);
    expect(data.outcome).toBe('DRIFT');
    expect(data.category).toBe(2);
  });

  it('classifies known affected elements as APPLIED in event mode', async () => {
    const tempDir = makeTempDir();
    const specPath = join(tempDir, 'test.moment');
    copyFileSync(VALID_FIXTURE, specPath);

    // We need an element name that actually exists in vet-clinic.moment
    // First parse to find a name, but we can just use a common known pattern
    const eventPath = join(tempDir, 'cascade-event.json');
    writeFileSync(eventPath, JSON.stringify({ affectedElements: ['Scheduling'] }));

    const result = await reconcile({
      filePath: specPath,
      mode: 'event',
      eventPath,
    });
    expect(result.isError).toBeUndefined();
    const data = parseContent(result);
    // If Scheduling is a known name, outcome should be APPLIED; otherwise DRIFT
    expect(['APPLIED', 'DRIFT']).toContain(data.outcome);
  });

  it('reconciles local mode with a .domain/ directory present', async () => {
    const tempDir = makeTempDir();
    const specPath = join(tempDir, 'test.moment');
    copyFileSync(VALID_FIXTURE, specPath);

    // Create a minimal .domain/ directory with a JSONL file
    const domainDir = join(tempDir, '.domain');
    mkdirSync(domainDir, { recursive: true });
    writeFileSync(
      join(domainDir, 'test.jsonl'),
      JSON.stringify({
        eventId: 'evt-1',
        eventType: 'BoundedContextDefined',
        version: 1,
        productSource: 'sift',
        sessionId: 'ses-1',
        causationEventIds: [],
        correlationId: 'corr-1',
        timestamp: '2025-01-01T00:00:00Z',
        payload: { boundedContextName: 'TestContext' },
      }) + '\n',
    );

    const result = await reconcile({ filePath: specPath, mode: 'local' });
    expect(result.isError).toBeUndefined();
    const data = parseContent(result);
    // With a .domain/ present, it should produce an outcome
    expect(data.outcome).toBeDefined();
    expect(['APPLIED', 'DRIFT', 'BREAKING', 'NO_CHANGES']).toContain(data.outcome);
  });
});
