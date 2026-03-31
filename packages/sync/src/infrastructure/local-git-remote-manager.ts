/**
 * LocalGitRemoteManager — Remote operations via isomorphic-git (ADR-024)
 *
 * Handles clone, push, pull, branch management with GitHub auth.
 * Auth uses onAuth callback for GitHub App installation tokens.
 */

import * as git from 'isomorphic-git';
import * as fs from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import type {
  GitRemoteManager,
  CloneOptions,
  PushOptions,
  PullOptions,
  BranchResult,
} from './git-remote-manager.js';

function loadHttp(): git.HttpClient {
  const req = createRequire(import.meta.url);
  return req('isomorphic-git/http/node/index.cjs') as git.HttpClient;
}

export class LocalGitRemoteManager implements GitRemoteManager {
  private readonly dir: string;

  constructor(repoRoot: string) {
    this.dir = resolve(repoRoot);
  }

  async clone(options: CloneOptions): Promise<void> {
    const http = loadHttp();
    await git.clone({
      fs,
      http,
      dir: options.dir,
      url: options.url,
      ref: options.ref,
      depth: options.depth,
      singleBranch: !!options.ref,
      onAuth: options.onAuth,
    });
  }

  async push(options: PushOptions): Promise<void> {
    const http = loadHttp();
    await git.push({
      fs,
      http,
      dir: this.dir,
      remote: options.remote ?? 'origin',
      ref: options.ref,
      force: options.force ?? false,
      onAuth: options.onAuth,
    });
  }

  async pull(options: PullOptions): Promise<void> {
    const http = loadHttp();
    await git.pull({
      fs,
      http,
      dir: this.dir,
      remote: options.remote ?? 'origin',
      ref: options.ref,
      author: options.author,
      onAuth: options.onAuth,
    });
  }

  async createBranch(name: string, ref?: string): Promise<BranchResult> {
    if (ref) {
      await git.branch({ fs, dir: this.dir, ref: name, object: ref });
    } else {
      await git.branch({ fs, dir: this.dir, ref: name });
    }

    const oid = await git.resolveRef({ fs, dir: this.dir, ref: name });
    return { name, oid };
  }

  async checkout(ref: string): Promise<void> {
    await git.checkout({ fs, dir: this.dir, ref });
  }

  async currentBranch(): Promise<string | undefined> {
    const branch = await git.currentBranch({ fs, dir: this.dir });
    return branch ?? undefined;
  }

  async listRemoteBranches(remote = 'origin'): Promise<readonly string[]> {
    return git.listBranches({ fs, dir: this.dir, remote });
  }
}
