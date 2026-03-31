import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { LocalGitArtifactStore } from '../infrastructure/local-git-artifact-store.js';
import type { MomentArtifactIndex } from '../infrastructure/artifact-index.js';

function createValidIndex(overrides?: Partial<MomentArtifactIndex>): MomentArtifactIndex {
  return {
    version: 1,
    generatedAt: '2026-03-31T00:00:00.000Z',
    specHash: 'abc123',
    contexts: [
      {
        name: 'ordering',
        specPath: '.moment/contexts/ordering.moment',
        generatedPaths: ['.moment/generated/ordering.ts'],
        keywords: ['order', 'placed', 'confirmed'],
      },
    ],
    flows: [
      {
        name: 'place-order',
        contextName: 'ordering',
        specPath: '.moment/contexts/ordering.moment',
        steps: 3,
      },
    ],
    artifacts: [
      {
        path: '.moment/contexts/ordering.moment',
        type: 'spec',
        contextName: 'ordering',
      },
      {
        path: '.moment/generated/ordering.ts',
        type: 'typescript',
        contextName: 'ordering',
        generatedFrom: '.moment/contexts/ordering.moment',
      },
      {
        path: '.moment/generated/shipping.ts',
        type: 'typescript',
        contextName: 'shipping',
        generatedFrom: '.moment/contexts/shipping.moment',
      },
    ],
    decisions: [
      {
        code: 'SR-01',
        summary: 'Schema immutability',
        sourcePath: '.moment/contexts/ordering.moment',
        lineNumber: 10,
      },
    ],
    ...overrides,
  };
}

describe('LocalGitArtifactStore', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'gas-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeIndex(index: MomentArtifactIndex): void {
    const momentDir = join(tmpDir, '.moment');
    mkdirSync(momentDir, { recursive: true });
    writeFileSync(join(momentDir, 'index.json'), JSON.stringify(index));
  }

  function writeArtifact(path: string, content: string): void {
    const fullPath = join(tmpDir, path);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, content);
  }

  it('getIndex() parses valid .moment/index.json and returns MomentArtifactIndex', async () => {
    const index = createValidIndex();
    writeIndex(index);

    const store = new LocalGitArtifactStore(tmpDir);
    const result = await store.getIndex();

    expect(result.version).toBe(1);
    expect(result.specHash).toBe('abc123');
    expect(result.contexts).toHaveLength(1);
    expect(result.contexts[0].name).toBe('ordering');
    expect(result.flows).toHaveLength(1);
    expect(result.artifacts).toHaveLength(3);
    expect(result.decisions).toHaveLength(1);
  });

  it('getIndex() throws on missing index file (GAS-01)', async () => {
    const store = new LocalGitArtifactStore(tmpDir);

    await expect(store.getIndex()).rejects.toThrow('Artifact index not found');
  });

  it('readArtifact() returns file content and throws on missing file (GAS-02)', async () => {
    writeArtifact('.moment/contexts/ordering.moment', 'context Ordering {}');

    const store = new LocalGitArtifactStore(tmpDir);
    const content = await store.readArtifact('.moment/contexts/ordering.moment');

    expect(content).toBe('context Ordering {}');

    await expect(store.readArtifact('.moment/contexts/nonexistent.moment')).rejects.toThrow(
      'Artifact not found',
    );
  });

  it('queryByContext() filters ArtifactIndexEntry by contextName (GAS-03)', async () => {
    const index = createValidIndex();
    writeIndex(index);

    const store = new LocalGitArtifactStore(tmpDir);
    const orderingArtifacts = await store.queryByContext('ordering');

    expect(orderingArtifacts).toHaveLength(2);
    expect(orderingArtifacts.every((a) => a.contextName === 'ordering')).toBe(true);

    const shippingArtifacts = await store.queryByContext('shipping');
    expect(shippingArtifacts).toHaveLength(1);
    expect(shippingArtifacts[0].contextName).toBe('shipping');

    const emptyArtifacts = await store.queryByContext('nonexistent');
    expect(emptyArtifacts).toHaveLength(0);
  });

  it('readArtifacts() batch reads multiple files into Map', async () => {
    writeArtifact('.moment/contexts/ordering.moment', 'context Ordering {}');
    writeArtifact('.moment/generated/ordering.ts', 'export interface Order {}');

    const store = new LocalGitArtifactStore(tmpDir);
    const result = await store.readArtifacts([
      '.moment/contexts/ordering.moment',
      '.moment/generated/ordering.ts',
    ]);

    expect(result.size).toBe(2);
    expect(result.get('.moment/contexts/ordering.moment')).toBe('context Ordering {}');
    expect(result.get('.moment/generated/ordering.ts')).toBe('export interface Order {}');
  });

  it('Index version validation rejects version !== 1 (GAS-04)', async () => {
    const momentDir = join(tmpDir, '.moment');
    mkdirSync(momentDir, { recursive: true });
    writeFileSync(
      join(momentDir, 'index.json'),
      JSON.stringify({ version: 2, generatedAt: '', specHash: '' }),
    );

    const store = new LocalGitArtifactStore(tmpDir);

    await expect(store.getIndex()).rejects.toThrow('Unsupported artifact index version: 2');
  });

  it('listArtifacts() returns files matching glob pattern', async () => {
    writeArtifact('.moment/contexts/ordering.moment', 'context Ordering {}');
    writeArtifact('.moment/contexts/shipping.moment', 'context Shipping {}');
    writeArtifact('.moment/generated/ordering.ts', 'export interface Order {}');

    const store = new LocalGitArtifactStore(tmpDir);

    const allFiles = await store.listArtifacts('*');
    expect(allFiles.length).toBe(3);

    const momentFiles = await store.listArtifacts('.moment/contexts/*.moment');
    expect(momentFiles).toHaveLength(2);
    expect(momentFiles.every((f) => f.endsWith('.moment'))).toBe(true);

    const tsFiles = await store.listArtifacts('.moment/generated/*.ts');
    expect(tsFiles).toHaveLength(1);
  });

  it('readArtifact() rejects absolute paths', async () => {
    const store = new LocalGitArtifactStore(tmpDir);
    await expect(store.readArtifact('/etc/passwd')).rejects.toThrow(
      'Absolute paths are not allowed',
    );
  });

  it('readArtifact() rejects path traversal', async () => {
    const store = new LocalGitArtifactStore(tmpDir);
    await expect(store.readArtifact('../../../etc/passwd')).rejects.toThrow(
      'Path traversal detected',
    );
  });

  it('getIndex() validates required fields', async () => {
    const momentDir = join(tmpDir, '.moment');
    mkdirSync(momentDir, { recursive: true });
    writeFileSync(
      join(momentDir, 'index.json'),
      JSON.stringify({ version: 1, generatedAt: 'x', specHash: 'y' }),
    );

    const store = new LocalGitArtifactStore(tmpDir);
    await expect(store.getIndex()).rejects.toThrow('missing required field: contexts');
  });

  it('listArtifacts() excludes .moment/index.json', async () => {
    const index = createValidIndex();
    writeIndex(index);
    writeArtifact('.moment/contexts/ordering.moment', 'context Ordering {}');

    const store = new LocalGitArtifactStore(tmpDir);
    const all = await store.listArtifacts('*');

    expect(all).not.toContain('.moment/index.json');
    expect(all).toContain('.moment/contexts/ordering.moment');
  });

  it('getIndex() caches the index after first read', async () => {
    const index = createValidIndex();
    writeIndex(index);

    const store = new LocalGitArtifactStore(tmpDir);
    const first = await store.getIndex();
    const second = await store.getIndex();

    expect(first).toBe(second);
  });
});
