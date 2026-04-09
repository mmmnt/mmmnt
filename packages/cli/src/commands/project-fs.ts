/**
 * Shared helpers for project path resolution and writing generated files.
 *
 * The CLI emitters (TypeScriptEmitter, TestScaffoldEmitter, GherkinGenerator,
 * SpecificationDocumentGenerator) return in-memory Map<string, string> outputs
 * with project-relative paths. These helpers resolve a base directory
 * (project root from `.manifest.yaml` or cwd) and write files to disk.
 */

import { dirname, join, parse as parsePath, resolve, isAbsolute, sep } from 'node:path';
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
 * Assert that `candidatePath` resolves to a location inside `baseDir`.
 * Uses a path-separator boundary check so that `/base-other/foo` is not
 * treated as being inside `/base`.
 */
function assertPathWithin(candidatePath: string, baseDir: string): void {
  const resolvedBase = resolve(baseDir);
  const resolvedCandidate = resolve(candidatePath);
  const baseWithSep = resolvedBase.endsWith(sep) ? resolvedBase : resolvedBase + sep;
  if (resolvedCandidate !== resolvedBase && !resolvedCandidate.startsWith(baseWithSep)) {
    throw new Error(
      `Path traversal detected: ${candidatePath} escapes output directory ${baseDir}`,
    );
  }
}

/**
 * Write each entry in `files` to disk under `baseDir`. Keys are treated as
 * project-relative POSIX paths; directories are created as needed.
 *
 * Rejects absolute paths and any relative path whose resolved location falls
 * outside `baseDir` (defense in depth against path traversal via
 * user-controlled names in .moment specs). Returns absolute paths written.
 */
export function writeOutputFiles(files: Map<string, string>, baseDir: string): string[] {
  const resolvedBase = resolve(baseDir);
  const written: string[] = [];
  for (const [relativePath, content] of files) {
    if (isAbsolute(relativePath)) {
      throw new Error(
        `Refusing to write absolute path '${relativePath}' — emitter outputs must be project-relative`,
      );
    }
    const absolutePath = join(resolvedBase, relativePath);
    assertPathWithin(absolutePath, resolvedBase);
    mkdirSync(dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, content, 'utf-8');
    written.push(absolutePath);
  }
  return written;
}
