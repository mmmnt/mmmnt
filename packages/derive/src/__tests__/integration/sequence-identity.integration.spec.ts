/**
 * M-S12 — sequence-aware walking must be a no-op on every real spec.
 *
 * Today's grammar cannot produce interleaved entry/branch order (`when`
 * blocks greedily consume trailing nodes), so the textual sequence the
 * parser records always equals the legacy hardcoded iteration orders. This
 * test pins that: deriving artifacts from the real ticketwave spec WITH the
 * parsed sequence and with the sequence STRIPPED must produce identical
 * output. If a future grammar change makes interleaving representable, this
 * test will fail on the first spec that uses it — which is the desired
 * signal that the legacy fallback orders and the sequence have diverged.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MomentParser } from '@mmmnt/core';
import type { IntermediateRepresentation } from '@mmmnt/core';
import {
  generateAllScenarios,
  deriveNegativeScenarios,
  deriveTimeoutScenarios,
} from '../../engine/simulation-scenario-generator.js';
import { TopologyEmitter } from '../../engine/topology-emitter.js';
import { generateEventCatalog } from '../../engine/event-catalog-generator.js';

const SPEC_PATH = fileURLToPath(
  new URL('../../../../../examples/ticketwave/spec/ticketwave.moment', import.meta.url),
);

async function parseSpec(): Promise<IntermediateRepresentation> {
  const parser = new MomentParser();
  const result = await parser.parseContent(readFileSync(SPEC_PATH, 'utf-8'), SPEC_PATH);
  expect(result.success).toBe(true);
  return result.ir!;
}

function stripSequences(ir: IntermediateRepresentation): IntermediateRepresentation {
  const clone: IntermediateRepresentation = JSON.parse(JSON.stringify(ir));
  for (const flow of clone.flows) {
    for (const moment of flow.moments) {
      delete (moment as { sequence?: unknown }).sequence;
    }
  }
  return clone;
}

describe('sequence-aware walking identity on a real spec (M-S12)', () => {
  it('the parser records a textual sequence on every ticketwave moment', async () => {
    const ir = await parseSpec();
    expect(ir.flows.length).toBeGreaterThan(0);
    for (const flow of ir.flows) {
      for (const moment of flow.moments) {
        const childCount = moment.contextEntries.length + (moment.branches?.length ?? 0);
        expect(moment.sequence, `${flow.name} / ${moment.name}`).toBeDefined();
        expect(moment.sequence!.length).toBe(childCount);
      }
    }
  });

  it('scenarios, topologies, and catalog are identical with and without the sequence', async () => {
    const withSeq = await parseSpec();
    const withoutSeq = stripSequences(withSeq);

    const emitter = new TopologyEmitter();
    for (let i = 0; i < withSeq.flows.length; i++) {
      const flowA = withSeq.flows[i];
      const flowB = withoutSeq.flows[i];

      expect(emitter.emit(withSeq, flowA)).toEqual(emitter.emit(withoutSeq, flowB));

      const scenariosA = [
        ...generateAllScenarios(withSeq, flowA),
        ...deriveNegativeScenarios(withSeq, flowA),
        ...deriveTimeoutScenarios(withSeq, flowA),
      ];
      const scenariosB = [
        ...generateAllScenarios(withoutSeq, flowB),
        ...deriveNegativeScenarios(withoutSeq, flowB),
        ...deriveTimeoutScenarios(withoutSeq, flowB),
      ];
      expect(scenariosA).toEqual(scenariosB);
    }

    // Catalog: compare events only — metadata.generatedAt is a wall-clock stamp.
    expect(generateEventCatalog(withSeq).events).toEqual(generateEventCatalog(withoutSeq).events);
  });
});
