/**
 * GitRemoteManager — Remote operations for Moment artifact repos (ADR-024)
 *
 * Handles clone, push, pull, and branch management.
 * Auth is provided via onAuth callback (GitHub App installation token).
 */

export interface GitAuth {
  readonly username: string;
  readonly password: string;
}

export interface CloneOptions {
  readonly url: string;
  readonly dir: string;
  readonly ref?: string;
  readonly depth?: number;
  readonly onAuth: () => GitAuth;
}

export interface PushOptions {
  readonly remote?: string;
  readonly ref?: string;
  readonly onAuth: () => GitAuth;
  readonly force?: boolean;
}

export interface PullOptions {
  readonly remote?: string;
  readonly ref?: string;
  readonly onAuth: () => GitAuth;
  readonly author: { readonly name: string; readonly email: string };
}

export interface BranchResult {
  readonly name: string;
  readonly oid: string;
}

export interface GitRemoteManager {
  /** Clone a remote repository to a local directory */
  clone(options: CloneOptions): Promise<void>;

  /** Push local commits to a remote */
  push(options: PushOptions): Promise<void>;

  /** Pull remote changes and merge */
  pull(options: PullOptions): Promise<void>;

  /** Create a new branch from current HEAD or a specific ref */
  createBranch(name: string, ref?: string): Promise<BranchResult>;

  /** Switch to a branch */
  checkout(ref: string): Promise<void>;

  /** Get the current branch name */
  currentBranch(): Promise<string | undefined>;

  /** List remote branches */
  listRemoteBranches(remote?: string): Promise<readonly string[]>;
}
