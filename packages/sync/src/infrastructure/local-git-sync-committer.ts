/**
 * Local git operations for sync decisions (ADR-039 §4): who is deciding, and a
 * commit of the .domain/ sync logs alone. Local only: no remote, no network.
 */

import * as git from 'isomorphic-git';
import * as fs from 'node:fs';
import { join } from 'node:path';

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

export interface CommitPathsInput {
  readonly root: string;
  /** Paths relative to `root`, `/`-separated. */
  readonly paths: readonly string[];
  readonly message: string;
  readonly author: { readonly name: string; readonly email: string };
}

interface TreeEntry {
  readonly mode: string;
  readonly path: string;
  readonly oid: string;
  readonly type: 'blob' | 'tree' | 'commit';
}

async function treeWith(
  dir: string,
  treeOid: string | undefined,
  segments: readonly string[],
  blobOid: string,
): Promise<string> {
  const entries: TreeEntry[] = treeOid ? (await git.readTree({ fs, dir, oid: treeOid })).tree : [];
  const [name, ...rest] = segments;
  const existing = entries.find((entry) => entry.path === name);
  const entry: TreeEntry =
    rest.length === 0
      ? {
          mode: existing?.type === 'blob' ? existing.mode : '100644',
          path: name,
          oid: blobOid,
          type: 'blob',
        }
      : {
          mode: '040000',
          path: name,
          oid: await treeWith(
            dir,
            existing?.type === 'tree' ? existing.oid : undefined,
            rest,
            blobOid,
          ),
          type: 'tree',
        };
  return git.writeTree({ fs, dir, tree: [...entries.filter((e) => e.path !== name), entry] });
}

/**
 * Commit exactly `paths` on top of HEAD, as `git commit --only` would: the
 * commit's tree is HEAD's with those files replaced, so nothing else the
 * developer has modified or staged enters it. Those paths are then staged so
 * the index agrees with the new HEAD. Returns the commit oid.
 */
export async function commitPathsOnly(input: CommitPathsInput): Promise<string> {
  const { root: dir, paths, message, author } = input;
  const head = await git.resolveRef({ fs, dir, ref: 'HEAD' }).catch(() => undefined);
  let tree = head ? (await git.readCommit({ fs, dir, oid: head })).commit.tree : undefined;

  for (const path of paths) {
    const blob = await git.writeBlob({ fs, dir, blob: fs.readFileSync(join(dir, path)) });
    tree = await treeWith(dir, tree, path.split('/'), blob);
  }
  if (tree === undefined) throw new Error('Nothing to commit: no paths given and no HEAD');

  const oid = await git.commit({ fs, dir, message, author, tree, parent: head ? [head] : [] });
  for (const filepath of paths) await git.add({ fs, dir, filepath });
  return oid;
}
