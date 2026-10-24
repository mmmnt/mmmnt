/**
 * Local git operations for sync decisions (ADR-039 §4): who is deciding, and a
 * commit of the .domain/ sync logs alone. Local only: no remote, no network.
 */

import * as git from 'isomorphic-git';
import * as fs from 'node:fs';

export interface RepoIdentity {
  readonly root: string;
  readonly name: string;
  readonly email: string;
  /** The local commit the working tree sits on: the implementation a decision was made against. */
  readonly head: string;
}

async function configValue(dir: string, path: string): Promise<string | undefined> {
  const value: unknown = await git.getConfig({ fs, dir, path });
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

/** The repo holding `path`, with its configured identity; a refusal message when any is missing. */
export async function resolveRepoIdentity(path: string): Promise<RepoIdentity | string> {
  let root: string;
  try {
    root = await git.findRoot({ fs, filepath: fs.realpathSync(path) });
  } catch {
    return `Error: ${path} is not inside a git repository — sync decisions are committed locally`;
  }

  const email = await configValue(root, 'user.email');
  if (email === undefined) {
    return `Error: the repository at ${root} has no user.email — set it with \`git config user.email <you>\``;
  }
  const name = await configValue(root, 'user.name');
  if (name === undefined) {
    return `Error: the repository at ${root} has no user.name — set it with \`git config user.name <you>\``;
  }

  try {
    const head = await git.resolveRef({ fs, dir: root, ref: 'HEAD' });
    return { root, name, email, head };
  } catch {
    return `Error: the repository at ${root} has no commits — commit the implementation first`;
  }
}
