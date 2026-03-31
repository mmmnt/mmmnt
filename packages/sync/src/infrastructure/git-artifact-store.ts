/**
 * GitArtifactStore — Retrieval abstraction for Moment artifacts (ADR-024)
 *
 * All artifact reads go through this interface.
 * Two implementations: LocalGitArtifactStore (CLI) and RemoteGitArtifactStore (Cloud, future).
 */

import type { MomentArtifactIndex, ArtifactIndexEntry } from './artifact-index.js';

export interface GitArtifactStore {
  /** Get the artifact index for the repository (GAS-01) */
  getIndex(): Promise<MomentArtifactIndex>;

  /** Read a single artifact by path (GAS-02) */
  readArtifact(path: string): Promise<string>;

  /** Read multiple artifacts by path (batch) */
  readArtifacts(paths: readonly string[]): Promise<ReadonlyMap<string, string>>;

  /** List artifacts matching a glob pattern */
  listArtifacts(pattern: string): Promise<readonly string[]>;

  /** Query artifacts by context name (GAS-03) */
  queryByContext(contextName: string): Promise<readonly ArtifactIndexEntry[]>;
}
