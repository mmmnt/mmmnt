/**
 * Shared helpers for project path resolution and writing generated files.
 *
 * The CLI emitters (TypeScriptEmitter, TestScaffoldEmitter, GherkinGenerator,
 * SpecificationDocumentGenerator) return in-memory Map<string, string> outputs
 * with project-relative paths. These helpers resolve a base directory
 * (project root from `.manifest.yaml` or cwd) and write files to disk.
 */

import { dirname, join, parse as parsePath, resolve, isAbsolute } from 'node:path';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

/**
 * Walk up from `filePath` until a `.manifest.yaml` is found. Returns the
 * directory containing the manifest, or undefined if none is found.
 */
export function findProjectRoot(filePath: string): string | undefined {
  let dir = dirname(resolve(filePath));
  const { root } = parsePath(dir);
  while (dir !== root) {
    if (existsSync(join(dir, '.manifest.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

/**
 * Resolve the base directory used to root generated files.
 *
 * Preference order:
 *   1. `explicitOut` if provided (resolved against cwd)
 *   2. Nearest `.manifest.yaml` walking up from `sourceFilePath`
 *   3. `process.cwd()`
 */
export function resolveOutputBaseDir(sourceFilePath: string, explicitOut?: string): string {
  if (explicitOut && explicitOut.length > 0) {
    return isAbsolute(explicitOut) ? explicitOut : resolve(explicitOut);
  }
  return findProjectRoot(sourceFilePath) ?? process.cwd();
}

/**
 * Write each entry in `files` to disk under `baseDir`. Keys are treated as
 * project-relative POSIX paths; directories are created as needed.
 * Returns the list of absolute paths written.
 */
export function writeOutputFiles(files: Map<string, string>, baseDir: string): string[] {
  const written: string[] = [];
  for (const [relativePath, content] of files) {
    const absolutePath = join(baseDir, relativePath);
    mkdirSync(dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, content, 'utf-8');
    written.push(absolutePath);
  }
  return written;
}
