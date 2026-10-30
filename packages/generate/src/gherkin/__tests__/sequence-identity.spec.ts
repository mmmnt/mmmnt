/**
 * M-S12 — sequence-aware gherkin step ordering must be a no-op on every real
 * spec: today's grammar cannot interleave a moment's entries and `when`
 * blocks, so rendering with the parsed textual sequence and with the
 * sequence stripped must produce byte-identical .feature files. Fails the
 * moment a grammar change makes interleaving representable and a spec uses
 * it — the signal that the fallback order and the sequence have diverged.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MomentParser } from '@mmmnt/core';
import type { IntermediateRepresentation } from '@mmmnt/core';
import { renderFeatureFromIr } from '../feature-renderer.js';

const SPEC_PATH = fileURLToPath(
  new URL('../../../../../examples/ticketwave/spec/ticketwave.moment', import.meta.url),
);

function stripSequences(ir: IntermediateRepresentation): IntermediateRepresentation {
  const clone: IntermediateRepresentation = JSON.parse(JSON.stringify(ir));
  for (const flow of clone.flows) {
    for (const moment of flow.moments) {
      delete (moment as { sequence?: unknown }).sequence;
    }
  }
  return clone;
}

describe('gherkin sequence-aware rendering identity on a real spec (M-S12)', () => {
  it('renders byte-identical features with and without the parsed sequence', async () => {
    const parser = new MomentParser();
    const result = await parser.parseContent(readFileSync(SPEC_PATH, 'utf-8'), SPEC_PATH);
    expect(result.success).toBe(true);

    const withSeq = result.ir!;
    const withoutSeq = stripSequences(withSeq);
    expect(withSeq.flows.length).toBeGreaterThan(0);

    for (let i = 0; i < withSeq.flows.length; i++) {
      const rendered = renderFeatureFromIr(withSeq.flows[i], withSeq);
      const legacy = renderFeatureFromIr(withoutSeq.flows[i], withoutSeq);
      expect(rendered).toBe(legacy);
    }
  });
});
