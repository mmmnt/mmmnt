export type {
  MomentArtifactIndex,
  ContextIndexEntry,
  FlowIndexEntry,
  ArtifactIndexEntry,
  ArtifactType,
  DecisionIndexEntry,
} from './artifact-index.js';

export type { GitArtifactStore } from './git-artifact-store.js';

export type { GitArtifactWriter, CommitResult } from './git-artifact-writer.js';

export type {
  GitRemoteManager,
  GitAuth,
  CloneOptions,
  PushOptions,
  PullOptions,
  BranchResult,
} from './git-remote-manager.js';

export { LocalGitArtifactStore } from './local-git-artifact-store.js';
export { LocalGitArtifactWriter } from './local-git-artifact-writer.js';
export type { AuthorConfig } from './local-git-artifact-writer.js';
export { LocalGitRemoteManager } from './local-git-remote-manager.js';
