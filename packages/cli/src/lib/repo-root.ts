/**
 * resolveRepoRoot — project root discovery for artifact-store operations.
 *
 * The spec file's directory is NOT the project root when specs live under
 * .moment/ (the documented convention). Walk upward from the spec file and
 * prefer, in order: the nearest directory containing .manifest.yaml, the
 * nearest directory containing .git, else the spec file's own directory.
 */

import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

export function resolveRepoRoot(specPath: string): string {
  const start = dirname(specPath);

  let manifestRoot: string | undefined;
  let gitRoot: string | undefined;

  let dir = start;
  for (;;) {
    if (manifestRoot === undefined && existsSync(join(dir, '.manifest.yaml'))) {
      manifestRoot = dir;
    }
    if (gitRoot === undefined && existsSync(join(dir, '.git'))) {
      gitRoot = dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return manifestRoot ?? gitRoot ?? start;
}
