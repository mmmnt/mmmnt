import { resolve } from 'node:path';
import { loadSpecification } from '@mmmnt/core';
import type { IntermediateRepresentation } from '@mmmnt/core';

export const ROOT = resolve(import.meta.dirname, '../../../..');

/** Load a model beneath the repository root (a project directory or one `.moment` file). */
export async function loadIr(relative: string): Promise<IntermediateRepresentation> {
  const loaded = await loadSpecification(resolve(ROOT, relative));
  if (!loaded.success || !loaded.ir) throw new Error(`${relative} does not load`);
  return loaded.ir;
}
