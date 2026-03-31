/**
 * LocalGitArtifactStore — CLI-context implementation of GitArtifactStore (ADR-024)
 *
 * Reads artifacts from the local git working tree using fs.readFileSync.
 * Index is read from .moment/index.json on disk.
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, relative, join } from 'node:path';
import type { GitArtifactStore } from './git-artifact-store.js';
import type { MomentArtifactIndex, ArtifactIndexEntry } from './artifact-index.js';

const INDEX_PATH = '.moment/index.json';

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

    if (!existsSync(indexPath)) {
      throw new Error(`Artifact index not found: ${indexPath}`);
    }

    const raw = readFileSync(indexPath, 'utf-8');
    const parsed: unknown = JSON.parse(raw);

    // GAS-04: Version gate
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('version' in parsed) ||
      (parsed as { version: unknown }).version !== 1
    ) {
      throw new Error(
        `Unsupported artifact index version: ${typeof parsed === 'object' && parsed !== null && 'version' in parsed ? (parsed as { version: unknown }).version : 'unknown'}`,
      );
    }

    this.cachedIndex = parsed as MomentArtifactIndex;
    return this.cachedIndex;
  }

  /** GAS-02: Returns file content as string, throws on missing file */
  async readArtifact(path: string): Promise<string> {
    const fullPath = resolve(this.repoRoot, path);

    if (!existsSync(fullPath)) {
      throw new Error(`Artifact not found: ${path}`);
    }

    return readFileSync(fullPath, 'utf-8');
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
    if (!existsSync(momentDir)) return [];

    const files = walkDir(momentDir);
    const relativePaths = files.map((f) => relative(this.repoRoot, f));

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
}

function walkDir(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      results.push(...walkDir(fullPath));
    } else {
      results.push(fullPath);
    }
  }
  return results;
}
