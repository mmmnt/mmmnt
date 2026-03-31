import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import * as git from 'isomorphic-git';
import * as fs from 'node:fs';
import { LocalGitRemoteManager } from '../infrastructure/local-git-remote-manager.js';

describe('LocalGitRemoteManager', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'grm-test-'));
    await git.init({ fs, dir: tmpDir });
    await git.setConfig({ fs, dir: tmpDir, path: 'user.name', value: 'Test' });
    await git.setConfig({ fs, dir: tmpDir, path: 'user.email', value: 'test@test.com' });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeAndCommit(path: string, content: string, message: string): Promise<string> {
    const fullPath = join(tmpDir, path);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, content);
    return git.add({ fs, dir: tmpDir, filepath: path }).then(() =>
      git.commit({
        fs,
        dir: tmpDir,
        message,
        author: { name: 'Test', email: 'test@test.com' },
      }),
    );
  }

  it('createBranch() creates a new branch at HEAD', async () => {
    await writeAndCommit('README.md', 'hello', 'initial');

    const manager = new LocalGitRemoteManager(tmpDir);
    const result = await manager.createBranch('feature/test');

    expect(result.name).toBe('feature/test');
    expect(result.oid).toBeTruthy();

    const branches = await git.listBranches({ fs, dir: tmpDir });
    expect(branches).toContain('feature/test');
  });

  it('createBranch() creates branch from specific ref', async () => {
    const firstOid = await writeAndCommit('README.md', 'v1', 'first');
    await writeAndCommit('README.md', 'v2', 'second');

    const manager = new LocalGitRemoteManager(tmpDir);
    const result = await manager.createBranch('hotfix/v1', firstOid);

    expect(result.oid).toBe(firstOid);
  });

  it('checkout() switches branches', async () => {
    await writeAndCommit('README.md', 'hello', 'initial');

    const manager = new LocalGitRemoteManager(tmpDir);
    await manager.createBranch('develop');
    await manager.checkout('develop');

    const current = await manager.currentBranch();
    expect(current).toBe('develop');
  });

  it('currentBranch() returns current branch name', async () => {
    await writeAndCommit('README.md', 'hello', 'initial');

    const manager = new LocalGitRemoteManager(tmpDir);
    const branch = await manager.currentBranch();

    expect(branch).toBe('master');
  });
});
