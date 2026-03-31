/**
 * LocalGitArtifactStore — CLI-context implementation of GitArtifactStore (ADR-024)
 *
 * Reads artifacts from the local git working tree.
 * Index is read from .moment/index.json on disk.
 */

import { readFile, readdir, lstat, access } from 'node:fs/promises';
import { resolve, relative, join, dirname, isAbsolute } from 'node:path';
import type { GitArtifactStore } from './git-artifact-store.js';
import type { MomentArtifactIndex, ArtifactIndexEntry } from './artifact-index.js';

const INDEX_PATH = '.moment/index.json';

function toPosix(p: string): string {
  return p.split('\\').join('/');
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

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
  private readonly repoRoot: string;
  private cachedIndex: MomentArtifactIndex | undefined;

  constructor(repoRoot: string) {
    this.repoRoot = resolve(repoRoot);
  }

  /** GAS-01: Returns valid MomentArtifactIndex or throws */
  async getIndex(): Promise<MomentArtifactIndex> {
    if (this.cachedIndex) return this.cachedIndex;

    const indexPath = resolve(this.repoRoot, INDEX_PATH);

    if (!(await exists(indexPath))) {
      throw new Error(`Artifact index not found: ${indexPath}`);
    }

    const raw = await readFile(indexPath, 'utf-8');
    const parsed: unknown = JSON.parse(raw);

    validateIndex(parsed);

    this.cachedIndex = parsed;
    return this.cachedIndex;
  }

  /** GAS-02: Returns file content as string, throws on missing file */
  async readArtifact(path: string): Promise<string> {
    this.assertSafePath(path);

    const fullPath = resolve(this.repoRoot, path);

    if (!(await exists(fullPath))) {
      throw new Error(`Artifact not found: ${path}`);
    }

    return readFile(fullPath, 'utf-8');
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
    const momentDir = resolve(this.repoRoot, '.moment');
    if (!(await exists(momentDir))) return [];

    const files = await walkDir(momentDir);
    const relativePaths = files
      .map((f) => toPosix(relative(this.repoRoot, f)))
      .filter((p) => p !== INDEX_PATH);

    if (pattern === '*') return relativePaths;

    const escaped = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*\*/g, '{{GLOBSTAR}}')
      .replace(/\*/g, '[^/]*')
      .replace(/{{GLOBSTAR}}/g, '.*');
    const regex = new RegExp(`^${escaped}$`);

    return relativePaths.filter((p) => regex.test(p));
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
    const resolved = resolve(this.repoRoot, path);
    if (!resolved.startsWith(this.repoRoot)) {
      throw new Error(`Path traversal detected: ${path}`);
    }
  }
}

async function walkDir(dir: string): Promise<string[]> {
  const results: string[] = [];
  for (const entry of await readdir(dir)) {
    const fullPath = join(dir, entry);
    const stat = await lstat(fullPath);
    if (stat.isSymbolicLink()) continue;
    if (stat.isDirectory()) {
      results.push(...(await walkDir(fullPath)));
    } else {
      results.push(fullPath);
    }
  }
  return results;
}
