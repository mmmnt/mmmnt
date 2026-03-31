/**
 * GitArtifactWriter — Write interface for Moment artifacts (ADR-024)
 *
 * Commits artifacts and index to the git object store.
 * Consumers compose this with GitArtifactStore for full read/write.
 */

import type { MomentArtifactIndex } from './artifact-index.js';

export interface CommitResult {
  readonly oid: string;
  readonly message: string;
}

export interface GitArtifactWriter {
  /** Stage and write an artifact file to the working tree */
  writeArtifact(path: string, content: string): Promise<void>;

  /** Write the semantic index to .moment/index.json */
  writeIndex(index: MomentArtifactIndex): Promise<void>;

  /** Stage all pending changes and create a commit */
  commitChanges(message: string): Promise<CommitResult>;

  /** Remove an artifact from the working tree and stage the deletion */
  removeArtifact(path: string): Promise<void>;
}
