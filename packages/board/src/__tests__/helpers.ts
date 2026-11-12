import { resolve } from 'node:path';
import { loadSpecification } from '@mmmnt/core';
import type { IntermediateRepresentation } from '@mmmnt/core';

export const ROOT = resolve(import.meta.dirname, '../../../..');
export const SIFT_MODEL = '/Volumes/Storage/development/projects/complai/sift/model';

/** Load a model (a project directory or one `.moment` file); an absolute path is used as it is. */
export async function loadIr(path: string): Promise<IntermediateRepresentation> {
  const loaded = await loadSpecification(resolve(ROOT, path));
  if (!loaded.success || !loaded.ir) throw new Error(`${path} does not load`);
  return loaded.ir;
}

/** The same model with each flow numbered `N<i> - name`, for fixtures written before flows carried an id. */
export function numbered(ir: IntermediateRepresentation): IntermediateRepresentation {
  return { ...ir, flows: ir.flows.map((f, i) => ({ ...f, name: `N${i + 1} - ${f.name}` })) };
}
