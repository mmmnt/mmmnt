import { describe, it, expect } from 'vitest';
import { MomentParser, type IntermediateRepresentation } from '@mmmnt/core';
import { TopologyEmitter } from '../topology-emitter.js';

async function load(source: string): Promise<IntermediateRepresentation> {
  const result = await new MomentParser().parseContent(source);
  if (!result.success || !result.ir) {
    throw new Error(result.diagnostics.map((d) => d.message).join('; '));
  }
  return result.ir;
}

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
context "Billing" [Core]
  aggregate "Invoice"
    identity invoiceId: UUID
    command Raise
      emits Raised
    event Raised
      invoiceId: UUID
flow "Convert"
  lane inv "Inventory" [Core]
  lane bill "Billing" [Core]
  moment "Hold converts"
    inv: Convert
    inv: Converted
    inv: Closed
  moment "Invoice"
    bill: Raise
    bill: Raised
`;

describe('ADR-041 D5 topology', () => {
  it('reads node ownership, so a multi-event command adds no node, relationship or owner change', async () => {
    const multi = new TopologyEmitter().emit(
      await load(MODEL('Converted, Closed')),
      (await load(MODEL('Converted, Closed'))).flows[0],
    );
    const single = new TopologyEmitter().emit(
      await load(MODEL('Converted')),
      (await load(MODEL('Converted'))).flows[0],
    );
    expect(JSON.stringify({ ...multi, metadata: undefined })).toBe(
      JSON.stringify({ ...single, metadata: undefined }),
    );
  });

  it('attributes the co-recorded events to the aggregate that declares them', async () => {
    const ir = await load(MODEL('Converted, Closed'));
    const topology = new TopologyEmitter().emit(ir, ir.flows[0]);
    const owners = topology.frames
      .flatMap((f) => f.nodes)
      .filter((n) => n.label === 'Converted' || n.label === 'Closed')
      .map((n) => n.aggregate);
    expect(owners).toEqual(['SeatHold', 'SeatHold']);
  });
});
