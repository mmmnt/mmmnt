/**
 * Shared helper: update manifest after successful .moment file processing.
 *
 * Called by any CLI command that parses a .moment file. Ensures the
 * manifest stays in sync with the project's actual state.
 */

import { dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { ManifestUpdater } from '@mmmnt/core';
import type { IntermediateRepresentation } from '@mmmnt/core';

export function updateManifestFromIr(filePath: string, ir: IntermediateRepresentation): void {
  const projectDir = findProjectRoot(filePath);
  if (!projectDir) return;

  const updater = new ManifestUpdater();
  const contextNames = ir.contexts.map((c) => c.name);
  const flowNames = ir.flows.map((f) => f.name);

  updater.updateFromParsedFile(projectDir, filePath, contextNames, flowNames);
}

function findProjectRoot(filePath: string): string | undefined {
  let dir = dirname(filePath);
  const root = '/';
  while (dir !== root) {
    if (existsSync(dir + '/.manifest.yaml')) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}
