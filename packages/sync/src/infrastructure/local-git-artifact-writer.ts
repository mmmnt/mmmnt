/**
 * LocalGitArtifactWriter — Writes artifacts to the local git working tree (ADR-024)
 *
 * Uses isomorphic-git to stage and commit artifacts.
 */

import * as git from 'isomorphic-git';
import * as fs from 'node:fs';
import { writeFile, mkdir, unlink } from 'node:fs/promises';
import { resolve, dirname, isAbsolute } from 'node:path';
import type { GitArtifactWriter, CommitResult } from './git-artifact-writer.js';
import type { MomentArtifactIndex } from './artifact-index.js';

const INDEX_PATH = '.moment/index.json';

export interface AuthorConfig {
  readonly name: string;
  readonly email: string;
}

export class LocalGitArtifactWriter implements GitArtifactWriter {
  private readonly dir: string;
  private readonly author: AuthorConfig;

  constructor(repoRoot: string, author: AuthorConfig) {
    this.dir = resolve(repoRoot);
    this.author = author;
  }

  async writeArtifact(path: string, content: string): Promise<void> {
    this.assertSafePath(path);

    const fullPath = resolve(this.dir, path);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, content, 'utf-8');
    await git.add({ fs, dir: this.dir, filepath: path });
  }

  async writeIndex(index: MomentArtifactIndex): Promise<void> {
    const fullPath = resolve(this.dir, INDEX_PATH);
    await mkdir(dirname(fullPath), { recursive: true });
    const json = JSON.stringify(index, null, 2) + '\n';
    await writeFile(fullPath, json, 'utf-8');
    await git.add({ fs, dir: this.dir, filepath: INDEX_PATH });
  }

  async commitChanges(message: string): Promise<CommitResult> {
    const oid = await git.commit({
      fs,
      dir: this.dir,
      message,
      author: this.author,
    });

    return { oid, message };
  }

  async removeArtifact(path: string): Promise<void> {
    this.assertSafePath(path);

    const fullPath = resolve(this.dir, path);
    await unlink(fullPath).catch(() => {});
    await git.remove({ fs, dir: this.dir, filepath: path });
  }

  private assertSafePath(path: string): void {
    if (isAbsolute(path)) {
      throw new Error(`Absolute paths are not allowed: ${path}`);
    }
    if (path.includes('..')) {
      throw new Error(`Path traversal detected: ${path}`);
    }
  }
}
