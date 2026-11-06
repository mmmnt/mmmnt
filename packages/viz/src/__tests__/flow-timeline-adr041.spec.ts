import { describe, it, expect } from 'vitest';
import { MomentParser, type IntermediateRepresentation } from '@mmmnt/core';
import { renderTimeline } from '../renderers/flow-timeline-renderer.js';

// ADR-041 pin: viz reads the events a flow places, not `emits`, so a model that records several events
// draws exactly what the equivalent plain-form model draws.

const MODEL = (emits: string): string => `
context "Inventory" [Core]
  aggregate "SeatHold"
    identity holdId: UUID
    state initial Active
    state Active -> Closed on Convert
    command Convert
      emits ${emits}
    event Converted
      holdId: UUID
    event Closed
      holdId: UUID
flow "Convert"
  lane inv "Inventory" [Core]
  moment "Hold converts"
    inv: Convert
    inv: Converted
    inv: Closed
`;

async function layoutOf(emits: string) {
  const result = await new MomentParser().parseContent(MODEL(emits));
  if (!result.ir) throw new Error('fixture did not parse');
  return renderTimeline(result.ir as IntermediateRepresentation);
}

describe('ADR-041 viz pin', () => {
  it.each([
    'Converted, Closed',
    'Converted | Closed',
    'Converted when Active | Closed when Closed',
  ])('draws `emits %s` as it draws the plain form', async (emits) => {
    expect(await layoutOf(emits)).toEqual(await layoutOf('Converted'));
  });
});
