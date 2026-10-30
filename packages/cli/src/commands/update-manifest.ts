/**
 * Shared helper: update manifest after successful .moment file processing.
 *
 * Called by any CLI command that parses a .moment file. Ensures the
 * manifest stays in sync with the project's actual state.
 */

import { ManifestUpdater } from '@mmmnt/core';
import type { IntermediateRepresentation } from '@mmmnt/core';
import { findProjectRoot } from './project-fs.js';
import { isDirectory } from '../lib/load-specification.js';

export function updateManifestFromIr(filePath: string, ir: IntermediateRepresentation): void {
  // The manifest records per-file state; a directory run as one project (ADR-037 §8) has none to record.
  if (isDirectory(filePath)) return;
  const projectDir = findProjectRoot(filePath);
  if (!projectDir) return;

  const updater = new ManifestUpdater();
  const contextNames = ir.contexts.map((c) => c.name);
  const flowNames = ir.flows.map((f) => f.name);

  updater.updateFromParsedFile(projectDir, filePath, contextNames, flowNames);
}
