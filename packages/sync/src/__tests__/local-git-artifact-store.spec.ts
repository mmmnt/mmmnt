import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import * as git from 'isomorphic-git';
import * as fs from 'node:fs';
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

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'gas-test-'));
    await git.init({ fs, dir: tmpDir });
    await git.setConfig({ fs, dir: tmpDir, path: 'user.name', value: 'Test' });
    await git.setConfig({ fs, dir: tmpDir, path: 'user.email', value: 'test@test.com' });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeFile(path: string, content: string): void {
    const fullPath = join(tmpDir, path);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, content);
  }

  async function commitAll(message = 'test commit'): Promise<void> {
    await git.add({ fs, dir: tmpDir, filepath: '.' });
    await git.commit({
      fs,
      dir: tmpDir,
      message,
      author: { name: 'Test', email: 'test@test.com' },
    });
  }

  it('getIndex() parses valid .moment/index.json from git', async () => {
    const index = createValidIndex();
    writeFile('.moment/index.json', JSON.stringify(index));
    await commitAll();

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
    writeFile('README.md', 'hello');
    await commitAll();

    const store = new LocalGitArtifactStore(tmpDir);

    await expect(store.getIndex()).rejects.toThrow('Artifact not found');
  });

  it('readArtifact() returns file content from git (GAS-02)', async () => {
    writeFile('.moment/contexts/ordering.moment', 'context Ordering {}');
    writeFile('.moment/index.json', JSON.stringify(createValidIndex()));
    await commitAll();

    const store = new LocalGitArtifactStore(tmpDir);
    const content = await store.readArtifact('.moment/contexts/ordering.moment');

    expect(content).toBe('context Ordering {}');
  });

  it('readArtifact() throws on missing file (GAS-02)', async () => {
    writeFile('README.md', 'hello');
    await commitAll();

    const store = new LocalGitArtifactStore(tmpDir);

    await expect(store.readArtifact('.moment/contexts/nonexistent.moment')).rejects.toThrow(
      'Artifact not found',
    );
  });

  it('queryByContext() filters by contextName (GAS-03)', async () => {
    const index = createValidIndex();
    writeFile('.moment/index.json', JSON.stringify(index));
    await commitAll();

    const store = new LocalGitArtifactStore(tmpDir);
    const ordering = await store.queryByContext('ordering');

    expect(ordering).toHaveLength(2);
    expect(ordering.every((a) => a.contextName === 'ordering')).toBe(true);

    const shipping = await store.queryByContext('shipping');
    expect(shipping).toHaveLength(1);
    expect(shipping[0].contextName).toBe('shipping');

    const empty = await store.queryByContext('nonexistent');
    expect(empty).toHaveLength(0);
  });

  it('readArtifacts() batch reads multiple files from git', async () => {
    writeFile('.moment/contexts/ordering.moment', 'context Ordering {}');
    writeFile('.moment/generated/ordering.ts', 'export interface Order {}');
    writeFile('.moment/index.json', JSON.stringify(createValidIndex()));
    await commitAll();

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
    writeFile(
      '.moment/index.json',
      JSON.stringify({
        version: 2,
        generatedAt: '',
        specHash: '',
        contexts: [],
        flows: [],
        artifacts: [],
        decisions: [],
      }),
    );
    await commitAll();

    const store = new LocalGitArtifactStore(tmpDir);

    await expect(store.getIndex()).rejects.toThrow('Unsupported artifact index version: 2');
  });

  it('listArtifacts() returns committed files matching glob', async () => {
    writeFile('.moment/contexts/ordering.moment', 'context Ordering {}');
    writeFile('.moment/contexts/shipping.moment', 'context Shipping {}');
    writeFile('.moment/generated/ordering.ts', 'export interface Order {}');
    writeFile('.moment/index.json', JSON.stringify(createValidIndex()));
    await commitAll();

    const store = new LocalGitArtifactStore(tmpDir);

    const allFiles = await store.listArtifacts('*');
    expect(allFiles.length).toBe(3);
    expect(allFiles).not.toContain('.moment/index.json');

    const momentFiles = await store.listArtifacts('.moment/contexts/*.moment');
    expect(momentFiles).toHaveLength(2);
    expect(momentFiles.every((f) => f.endsWith('.moment'))).toBe(true);

    const tsFiles = await store.listArtifacts('.moment/generated/*.ts');
    expect(tsFiles).toHaveLength(1);
  });

  it('getIndex() caches the index after first read', async () => {
    const index = createValidIndex();
    writeFile('.moment/index.json', JSON.stringify(index));
    await commitAll();

    const store = new LocalGitArtifactStore(tmpDir);
    const first = await store.getIndex();
    const second = await store.getIndex();

    expect(first).toBe(second);
  });

  it('readArtifact() rejects absolute paths', async () => {
    writeFile('README.md', 'hello');
    await commitAll();

    const store = new LocalGitArtifactStore(tmpDir);
    await expect(store.readArtifact('/etc/passwd')).rejects.toThrow(
      'Absolute paths are not allowed',
    );
  });

  it('readArtifact() rejects path traversal', async () => {
    writeFile('README.md', 'hello');
    await commitAll();

    const store = new LocalGitArtifactStore(tmpDir);
    await expect(store.readArtifact('../../../etc/passwd')).rejects.toThrow(
      'Path traversal detected',
    );
  });

  it('getIndex() validates required fields', async () => {
    writeFile(
      '.moment/index.json',
      JSON.stringify({ version: 1, generatedAt: 'x', specHash: 'y' }),
    );
    await commitAll();

    const store = new LocalGitArtifactStore(tmpDir);
    await expect(store.getIndex()).rejects.toThrow('missing required field: contexts');
  });

  it('reads from a specific ref', async () => {
    writeFile('.moment/contexts/ordering.moment', 'v1 content');
    writeFile('.moment/index.json', JSON.stringify(createValidIndex()));
    await commitAll('first commit');

    const firstCommit = await git.resolveRef({ fs, dir: tmpDir, ref: 'HEAD' });

    writeFile('.moment/contexts/ordering.moment', 'v2 content');
    await commitAll('second commit');

    const storeAtHead = new LocalGitArtifactStore(tmpDir, 'HEAD');
    const headContent = await storeAtHead.readArtifact('.moment/contexts/ordering.moment');
    expect(headContent).toBe('v2 content');

    const storeAtFirst = new LocalGitArtifactStore(tmpDir, firstCommit);
    const firstContent = await storeAtFirst.readArtifact('.moment/contexts/ordering.moment');
    expect(firstContent).toBe('v1 content');
  });
});
