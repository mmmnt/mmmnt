import { describe, it, expect } from 'vitest';
import { readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadSpecification } from '@mmmnt/core';
import type { IntermediateRepresentation } from '@mmmnt/core';
import { sweepIr } from '../coverage.js';
import { projectBoard } from '../project-board.js';
import { ROOT, loadIr } from './helpers.js';

/** Every model of the valid corpus that loads on its own: a project directory, or one file. */
async function corpus(): Promise<{ name: string; ir: IntermediateRepresentation }[]> {
  const dir = resolve(ROOT, 'fixtures/valid');
  const out: { name: string; ir: IntermediateRepresentation }[] = [];
  for (const entry of readdirSync(dir)) {
    const path = resolve(dir, entry);
    const candidates =
      statSync(path).isDirectory() && readdirSync(path).includes('contexts') ? [path] : [];
    if (candidates.length === 0 && statSync(path).isFile()) candidates.push(path);
    if (candidates.length === 0) {
      readdirSync(path)
        .filter((f) => f.endsWith('.moment'))
        .forEach((f) => candidates.push(resolve(path, f)));
    }
    for (const c of candidates) {
      const loaded = await loadSpecification(c);
      if (loaded.success && loaded.ir) out.push({ name: c.replace(`${ROOT}/`, ''), ir: loaded.ir });
    }
  }
  return out;
}

describe('closure: every IR property is carried or unrendered with a reason (ADR-047 D5)', () => {
  it(
    'leaves no property of the valid corpus, TicketWave included, uncovered',
    { timeout: 60_000 },
    async () => {
      const models = [
        ...(await corpus()),
        { name: 'ticketwave', ir: await loadIr('examples/ticketwave/spec/ticketwave.moment') },
      ];
      expect(models.length).toBeGreaterThanOrEqual(8);
      for (const { name, ir } of models) {
        expect({ name, uncovered: sweepIr(ir).uncovered }).toEqual({ name, uncovered: [] });
        expect(projectBoard(ir).frames.length).toBeGreaterThan(0);
      }
    },
  );

  it('finds a property the table does not know', async () => {
    const ir = await loadIr('fixtures/valid/process-constructs');
    const grown = structuredClone(ir) as unknown as { contexts: Record<string, unknown>[] };
    grown.contexts[0]!.newConstruct = [{ name: 'X' }];
    expect(sweepIr(grown as unknown as IntermediateRepresentation).uncovered).toContain(
      'contexts[].newConstruct',
    );
  });

  it('lists the unrendered subtrees in the manifest with their reasons', async () => {
    const ir = await loadIr('examples/ticketwave/spec/ticketwave.moment');
    const { unrendered } = projectBoard(ir).manifest;
    expect(unrendered).toContainEqual(expect.objectContaining({ path: '*.fields*' }));
    expect(unrendered.every((u) => u.reason.length > 0)).toBe(true);
  });
});
