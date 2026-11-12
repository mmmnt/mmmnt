import { describe, it, expect, beforeAll } from 'vitest';
import { resolve } from 'node:path';
import { loadSpecification } from '@mmmnt/core';
import type { IntermediateRepresentation } from '@mmmnt/core';
import { projectBoard } from '../project-board.js';

const FIXTURES = resolve(import.meta.dirname, '../../../../fixtures/valid');

export async function loadIr(name: string): Promise<IntermediateRepresentation> {
  const loaded = await loadSpecification(resolve(FIXTURES, name));
  if (!loaded.success) throw new Error(`fixture ${name} does not load`);
  return loaded.ir;
}

let ir: IntermediateRepresentation;
beforeAll(async () => {
  ir = await loadIr('process-constructs');
});

describe('the manifest lists the model nodes of a context', () => {
  it('names a command with its kind and context', () => {
    const { manifest } = projectBoard(ir);
    expect(manifest.nodes).toContainEqual(
      expect.objectContaining({ kind: 'command', name: 'CancelBooking', context: 'Ticketing' }),
    );
  });
});
