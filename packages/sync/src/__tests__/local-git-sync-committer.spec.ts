import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import * as git from 'isomorphic-git';
import { resolveRepoIdentity } from '../infrastructure/local-git-sync-committer.js';

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
