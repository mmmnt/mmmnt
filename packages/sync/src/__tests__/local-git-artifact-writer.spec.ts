import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import * as git from 'isomorphic-git';
import * as fs from 'node:fs';
import { LocalGitArtifactWriter } from '../infrastructure/local-git-artifact-writer.js';
import { LocalGitArtifactStore } from '../infrastructure/local-git-artifact-store.js';
import type { MomentArtifactIndex } from '../infrastructure/artifact-index.js';

const AUTHOR = { name: 'Test', email: 'test@test.com' };

describe('LocalGitArtifactWriter', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'gaw-test-'));
    await git.init({ fs, dir: tmpDir });
    await git.setConfig({ fs, dir: tmpDir, path: 'user.name', value: 'Test' });
    await git.setConfig({ fs, dir: tmpDir, path: 'user.email', value: 'test@test.com' });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writeArtifact() writes file and stages it', async () => {
    const writer = new LocalGitArtifactWriter(tmpDir, AUTHOR);

    await writer.writeArtifact('.moment/contexts/ordering.moment', 'context Ordering {}');

    const content = readFileSync(join(tmpDir, '.moment/contexts/ordering.moment'), 'utf-8');
    expect(content).toBe('context Ordering {}');

    const status = await git.status({
      fs,
      dir: tmpDir,
      filepath: '.moment/contexts/ordering.moment',
    });
    expect(status).toBe('added');
  });

  it('writeIndex() writes .moment/index.json and stages it', async () => {
    const writer = new LocalGitArtifactWriter(tmpDir, AUTHOR);

    const index: MomentArtifactIndex = {
      version: 1,
      generatedAt: '2026-03-31T00:00:00.000Z',
      specHash: 'abc123',
      contexts: [],
      flows: [],
      artifacts: [],
      decisions: [],
    };

    await writer.writeIndex(index);

    const raw = readFileSync(join(tmpDir, '.moment/index.json'), 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed.version).toBe(1);
    expect(parsed.specHash).toBe('abc123');

    const status = await git.status({ fs, dir: tmpDir, filepath: '.moment/index.json' });
    expect(status).toBe('added');
  });

  it('commitChanges() creates a git commit', async () => {
    const writer = new LocalGitArtifactWriter(tmpDir, AUTHOR);

    await writer.writeArtifact('.moment/test.moment', 'test content');
    const result = await writer.commitChanges('test: add artifact');

    expect(result.oid).toBeTruthy();
    expect(result.message).toBe('test: add artifact');

    const log = await git.log({ fs, dir: tmpDir, depth: 1 });
    expect(log[0].commit.message).toBe('test: add artifact\n');
  });

  it('written artifacts are readable via LocalGitArtifactStore', async () => {
    const writer = new LocalGitArtifactWriter(tmpDir, AUTHOR);

    const index: MomentArtifactIndex = {
      version: 1,
      generatedAt: '2026-03-31T00:00:00.000Z',
      specHash: 'round-trip',
      contexts: [],
      flows: [],
      artifacts: [{ path: '.moment/test.ts', type: 'typescript' }],
      decisions: [],
    };

    await writer.writeIndex(index);
    await writer.writeArtifact('.moment/test.ts', 'export const x = 1;');
    await writer.commitChanges('feat: round-trip test');

    const store = new LocalGitArtifactStore(tmpDir);
    const readIndex = await store.getIndex();
    expect(readIndex.specHash).toBe('round-trip');

    const content = await store.readArtifact('.moment/test.ts');
    expect(content).toBe('export const x = 1;');
  });

  it('removeArtifact() deletes file and stages removal', async () => {
    const writer = new LocalGitArtifactWriter(tmpDir, AUTHOR);

    await writer.writeArtifact('.moment/to-remove.ts', 'delete me');
    await writer.commitChanges('add file');

    await writer.removeArtifact('.moment/to-remove.ts');

    expect(existsSync(join(tmpDir, '.moment/to-remove.ts'))).toBe(false);
  });

  it('rejects absolute paths', async () => {
    const writer = new LocalGitArtifactWriter(tmpDir, AUTHOR);
    await expect(writer.writeArtifact('/etc/passwd', 'bad')).rejects.toThrow(
      'Absolute paths are not allowed',
    );
  });

  it('rejects path traversal', async () => {
    const writer = new LocalGitArtifactWriter(tmpDir, AUTHOR);
    await expect(writer.writeArtifact('../../etc/passwd', 'bad')).rejects.toThrow(
      'Path traversal detected',
    );
  });
});
