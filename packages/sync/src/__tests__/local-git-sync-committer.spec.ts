import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import * as git from 'isomorphic-git';
import {
  commitPathsOnly,
  resolveRepoIdentity,
} from '../infrastructure/local-git-sync-committer.js';

async function seed(dir: string): Promise<string> {
  writeFileSync(join(dir, 'README.md'), 'seed\n');
  await git.add({ fs, dir, filepath: 'README.md' });
  return git.commit({ fs, dir, message: 'seed', author: { name: 'Seed', email: 'seed@x.com' } });
}

describe('resolveRepoIdentity', () => {
  let dir: string;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'sync-identity-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns the repo root, the repo's user.name and user.email, and HEAD", async () => {
    await git.init({ fs, dir });
    await git.setConfig({ fs, dir, path: 'user.name', value: 'Dev' });
    await git.setConfig({ fs, dir, path: 'user.email', value: 'dev@example.com' });
    const head = await seed(dir);
    mkdirSync(join(dir, 'model', '.domain'), { recursive: true });

    const identity = await resolveRepoIdentity(join(dir, 'model', '.domain'));

    expect(identity).toEqual({
      root: fs.realpathSync(dir),
      name: 'Dev',
      email: 'dev@example.com',
      head,
    });
  });

  it('refuses a path outside any git repository', async () => {
    expect(await resolveRepoIdentity(dir)).toContain('not inside a git repository');
  });

  it('refuses a repo with no user.email', async () => {
    await git.init({ fs, dir });
    await git.setConfig({ fs, dir, path: 'user.name', value: 'Dev' });
    await seed(dir);

    expect(await resolveRepoIdentity(dir)).toContain('user.email');
  });

  it('refuses a repo with no user.name', async () => {
    await git.init({ fs, dir });
    await git.setConfig({ fs, dir, path: 'user.email', value: 'dev@example.com' });
    await seed(dir);

    expect(await resolveRepoIdentity(dir)).toContain('user.name');
  });

  it('refuses a repo with no commits', async () => {
    await git.init({ fs, dir });
    await git.setConfig({ fs, dir, path: 'user.name', value: 'Dev' });
    await git.setConfig({ fs, dir, path: 'user.email', value: 'dev@example.com' });

    expect(await resolveRepoIdentity(dir)).toContain('no commits');
  });
});

describe('commitPathsOnly', () => {
  let dir: string;
  let seedOid: string;
  const author = { name: 'Dev', email: 'dev@example.com' };

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'sync-commit-'));
    await git.init({ fs, dir });
    seedOid = await seed(dir);
    mkdirSync(join(dir, 'model', '.domain'), { recursive: true });
    writeFileSync(join(dir, 'model', '.domain', 'sync-state.jsonl'), '{"a":1}\n');
    writeFileSync(join(dir, 'model', '.domain', 'push-flow-saga.jsonl'), '{"b":1}\n');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const logs = ['model/.domain/sync-state.jsonl', 'model/.domain/push-flow-saga.jsonl'];

  it('commits the named paths on top of HEAD with the given author and message', async () => {
    const oid = await commitPathsOnly({
      root: dir,
      paths: logs,
      message: 'chore(sync): x',
      author,
    });

    const { commit } = await git.readCommit({ fs, dir, oid });
    expect(commit.parent).toEqual([seedOid]);
    expect(commit.message).toBe('chore(sync): x\n');
    expect(commit.author).toMatchObject(author);
    expect(await git.resolveRef({ fs, dir, ref: 'HEAD' })).toBe(oid);
    const files = await git.listFiles({ fs, dir, ref: oid });
    expect(files.sort()).toEqual(['README.md', ...logs].sort());
  });

  it('leaves an unrelated modified file unstaged and uncommitted', async () => {
    writeFileSync(join(dir, 'README.md'), 'edited by the developer\n');

    const oid = await commitPathsOnly({ root: dir, paths: logs, message: 'm', author });

    const { blob } = await git.readBlob({ fs, dir, oid, filepath: 'README.md' });
    expect(Buffer.from(blob).toString()).toBe('seed\n');
    expect(await git.status({ fs, dir, filepath: 'README.md' })).toBe('*modified');
  });

  it('leaves an unrelated staged file staged but out of the commit', async () => {
    writeFileSync(join(dir, 'staged.ts'), 'export {};\n');
    await git.add({ fs, dir, filepath: 'staged.ts' });

    const oid = await commitPathsOnly({ root: dir, paths: logs, message: 'm', author });

    expect(await git.listFiles({ fs, dir, ref: oid })).not.toContain('staged.ts');
    expect(await git.status({ fs, dir, filepath: 'staged.ts' })).toBe('added');
  });

  it('leaves the committed paths clean in the index', async () => {
    await commitPathsOnly({ root: dir, paths: logs, message: 'm', author });

    for (const filepath of logs) {
      expect(await git.status({ fs, dir, filepath })).toBe('unmodified');
    }
  });

  it('commits a later change to a path already in HEAD', async () => {
    await commitPathsOnly({ root: dir, paths: logs, message: 'first', author });
    fs.appendFileSync(join(dir, logs[0]), '{"a":2}\n');

    const oid = await commitPathsOnly({ root: dir, paths: [logs[0]], message: 'second', author });

    const { blob } = await git.readBlob({ fs, dir, oid, filepath: logs[0] });
    expect(Buffer.from(blob).toString()).toBe('{"a":1}\n{"a":2}\n');
    expect(await git.listFiles({ fs, dir, ref: oid })).toContain(logs[1]);
  });
});
