/**
 * LocalGitArtifactStore — CLI-context implementation of GitArtifactStore (ADR-024)
 *
 * Reads artifacts working-tree-first: the developer's on-disk state is the
 * source of truth for drift comparison. Falls back to the git object store
 * (resolveRef → readBlob at HEAD) only when the file is absent from the
 * working tree — e.g. deleted-but-committed artifacts. This also makes the
 * store fully functional in non-git directories.
 */

import * as git from 'isomorphic-git';
import * as fs from 'node:fs';
import { resolve, isAbsolute, join } from 'node:path';
import type { GitArtifactStore } from './git-artifact-store.js';
import type { MomentArtifactIndex, ArtifactIndexEntry } from './artifact-index.js';

const INDEX_PATH = '.moment/index.json';

function assertField(obj: Record<string, unknown>, field: string, type: 'string' | 'array'): void {
  const value = obj[field];
  if (type === 'string' && typeof value !== 'string') {
    throw new Error(`Artifact index missing required field: ${field}`);
  }
  if (type === 'array' && !Array.isArray(value)) {
    throw new Error(`Artifact index missing required field: ${field}`);
  }
}

function validateIndex(parsed: unknown): asserts parsed is MomentArtifactIndex {
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Artifact index is not an object');
  }

  const obj = parsed as Record<string, unknown>;

  // GAS-04: Version gate
  if (obj.version !== 1) {
    throw new Error(`Unsupported artifact index version: ${obj.version ?? 'unknown'}`);
  }

  assertField(obj, 'generatedAt', 'string');
  assertField(obj, 'specHash', 'string');
  assertField(obj, 'contexts', 'array');
  assertField(obj, 'flows', 'array');
  assertField(obj, 'artifacts', 'array');
  assertField(obj, 'decisions', 'array');
}

export class LocalGitArtifactStore implements GitArtifactStore {
  private readonly dir: string;
  private readonly ref: string;
  private cachedIndex: MomentArtifactIndex | undefined;

  constructor(repoRoot: string, ref = 'HEAD') {
    this.dir = resolve(repoRoot);
    this.ref = ref;
  }

  /** GAS-01: Returns valid MomentArtifactIndex or throws */
  async getIndex(): Promise<MomentArtifactIndex> {
    if (this.cachedIndex) return this.cachedIndex;

    const raw = await this.readBlobAsString(INDEX_PATH);
    const parsed: unknown = JSON.parse(raw);

    validateIndex(parsed);

    this.cachedIndex = parsed;
    return this.cachedIndex;
  }

  /** GAS-02: Returns file content as string, throws on missing file */
  async readArtifact(path: string): Promise<string> {
    this.assertSafePath(path);
    return this.readBlobAsString(path);
  }

  async readArtifacts(paths: readonly string[]): Promise<ReadonlyMap<string, string>> {
    const result = new Map<string, string>();

    for (const path of paths) {
      const content = await this.readArtifact(path);
      result.set(path, content);
    }

    return result;
  }

  async listArtifacts(pattern: string): Promise<readonly string[]> {
    const allFiles = await this.listAllFiles();
    const momentFiles = allFiles.filter((f) => f.startsWith('.moment/') && f !== INDEX_PATH);

    if (pattern === '*') return momentFiles;

    const escaped = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*\*/g, '{{GLOBSTAR}}')
      .replace(/\*/g, '[^/]*')
      .replace(/{{GLOBSTAR}}/g, '.*');
    const regex = new RegExp(`^${escaped}$`);

    return momentFiles.filter((p) => regex.test(p));
  }

  /** GAS-03: Filters ArtifactIndexEntry by contextName */
  async queryByContext(contextName: string): Promise<readonly ArtifactIndexEntry[]> {
    const index = await this.getIndex();
    return index.artifacts.filter((a) => a.contextName === contextName);
  }

  private assertSafePath(path: string): void {
    if (isAbsolute(path)) {
      throw new Error(`Absolute paths are not allowed: ${path}`);
    }
    if (path.includes('..')) {
      throw new Error(`Path traversal detected: ${path}`);
    }
  }

  private async readBlobAsString(filepath: string): Promise<string> {
    // Working tree first (HEAD only): on-disk state is what drift comparison
    // should see. Explicit refs are historical reads and stay git-first.
    if (this.ref === 'HEAD') {
      const onDisk = join(this.dir, filepath);
      try {
        return fs.readFileSync(onDisk, 'utf-8');
      } catch {
        // Fall through to the git object store.
      }
    }

    try {
      const commitOid = await git.resolveRef({ fs, dir: this.dir, ref: this.ref });
      const { blob } = await git.readBlob({
        fs,
        dir: this.dir,
        oid: commitOid,
        filepath,
      });
      return Buffer.from(blob).toString('utf-8');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (
        message.includes('Could not find') ||
        message.includes('NotFoundError') ||
        message.includes('ENOENT')
      ) {
        throw new Error(`Artifact not found: ${filepath}`);
      }
      throw err;
    }
  }

  /** Working-tree listing (HEAD only) with git-tree fallback. */
  private async listAllFiles(): Promise<readonly string[]> {
    if (this.ref !== 'HEAD') {
      return git.listFiles({ fs, dir: this.dir, ref: this.ref });
    }

    const collected: string[] = [];
    const walk = (rel: string): void => {
      const abs = join(this.dir, rel);
      for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
        if (entry.name === '.git' || entry.name === 'node_modules') continue;
        const childRel = rel === '' ? entry.name : `${rel}/${entry.name}`;
        if (entry.isDirectory()) walk(childRel);
        else collected.push(childRel);
      }
    };

    try {
      walk('');
      return collected;
    } catch {
      // Working tree unreadable — fall back to the committed tree.
      return git.listFiles({ fs, dir: this.dir, ref: this.ref });
    }
  }
}
