/**
 * Grammar backward compatibility sweep — saga `on` mapping + moment sequence.
 *
 * Every real spec written before the saga `on` extension and the
 * MomentDefinition.sequence field must still parse successfully, and the new
 * fields must be purely additive: `states` keeps its historical shape and
 * `sequence` indexes stay within contextEntries/branches bounds.
 *
 * Swept sources: repo fixtures (valid/**, including unified/vet-clinic),
 * examples/ticketwave, and — when the sibling checkout exists — all of
 * howie's .moment files.
 */
import { MomentParser } from '../../src/index.js';
import type { IntermediateRepresentation } from '../../src/index.js';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';

const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const FIXTURES_VALID = resolve(REPO_ROOT, 'fixtures/valid');
const EXAMPLES = resolve(REPO_ROOT, 'examples');
const HOWIE_MOMENTS = resolve(REPO_ROOT, '..', 'howie/moments');

function collectMomentFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...collectMomentFiles(full));
    } else if (entry.endsWith('.moment')) {
      results.push(full);
    }
  }
  return results.sort();
}

function assertAdditiveFieldInvariants(ir: IntermediateRepresentation): void {
  // Saga compat: `states` keeps its flat shape; `transitions` mirrors it.
  for (const ctx of ir.contexts) {
    for (const saga of ctx.sagas) {
      expect(saga.states.length).toBeGreaterThanOrEqual(1);
      expect(saga.transitions).toBeDefined();
      expect(saga.transitions).toHaveLength(saga.states.length - 1);
      saga.transitions!.forEach((t, i) => {
        expect(t.from).toBe(saga.states[i]);
        expect(t.to).toBe(saga.states[i + 1]);
      });
    }
  }
  // Sequence compat: emitted on every moment, one item per child, indexes in
  // bounds and each child referenced exactly once.
  for (const flow of ir.flows) {
    for (const moment of flow.moments) {
      const branchCount = moment.branches?.length ?? 0;
      expect(moment.sequence).toBeDefined();
      expect(moment.sequence).toHaveLength(moment.contextEntries.length + branchCount);
      const entryIndexes = moment
        .sequence!.filter((s) => s.kind === 'entry')
        .map((s) => s.index)
        .sort((a, b) => a - b);
      const branchIndexes = moment
        .sequence!.filter((s) => s.kind === 'branch')
        .map((s) => s.index)
        .sort((a, b) => a - b);
      expect(entryIndexes).toEqual(moment.contextEntries.map((_, i) => i));
      expect(branchIndexes).toEqual(Array.from({ length: branchCount }, (_, i) => i));
    }
  }
}

describe('Grammar backward compatibility (saga `on` + sequence, additive only)', () => {
  let parser: MomentParser;

  beforeAll(() => {
    parser = new MomentParser();
  });

  const suites: [name: string, dir: string][] = [
    ['repo fixtures (valid, incl. vet-clinic)', FIXTURES_VALID],
    ['examples (ticketwave)', EXAMPLES],
    ['howie moments (sibling checkout)', HOWIE_MOMENTS],
  ];

  for (const [name, dir] of suites) {
    const files = collectMomentFiles(dir);
    const define = files.length > 0 ? describe : describe.skip;
    define(name, () => {
      it.each(files.map((f) => [f.slice(REPO_ROOT.length + 1), f]))(
        'parses %s with unchanged success and consistent additive fields',
        async (_label, file) => {
          const content = readFileSync(file, 'utf-8');
          const result = await parser.parseContent(content, file);
          expect(result.success).toBe(true);
          expect(result.ir).toBeDefined();
          assertAdditiveFieldInvariants(result.ir!);
        },
      );
    });
  }
});
