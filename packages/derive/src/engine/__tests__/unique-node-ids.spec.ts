import { describe, it, expect } from 'vitest';
import { MomentParser, type IntermediateRepresentation } from '@mmmnt/core';
import { TopologyEmitter } from '../topology-emitter.js';
import { generateAllScenarios } from '../simulation-scenario-generator.js';

async function load(source: string): Promise<IntermediateRepresentation> {
  const result = await new MomentParser().parseContent(source);
  if (!result.success || !result.ir) {
    throw new Error(result.diagnostics.map((d) => d.message).join('; '));
  }
  return result.ir;
}

const CONTEXT = `
context "Catalog" [Core]
  aggregate "Page"
    identity pageId: UUID
    command AddLink
      input pageId: UUID, url: string
      emits LinkAdded
    event LinkAdded
      pageId: UUID
`;

const TWICE = `${CONTEXT}
flow "Links"
  lane cat "Catalog" [Core]
  moment "Two links"
    cat: AddLink
    cat: LinkAdded
    cat: AddLink
    cat: LinkAdded
  moment "One link"
    cat: AddLink
    cat: LinkAdded
`;

const BRANCHED = `${CONTEXT}
flow "Links"
  lane cat "Catalog" [Core]
  moment "Links" [branch]
    when pair
      cat: AddLink
      cat: LinkAdded
      cat: LinkAdded
    when single
      cat: AddLink
      cat: LinkAdded
`;

const ids = (ir: IntermediateRepresentation) =>
  new TopologyEmitter().emit(ir, ir.flows[0]).frames.flatMap((f) => f.nodes.map((n) => n.id));

describe('node ids are unique within a topology', () => {
  it('keeps the first placement id and suffixes the later ones with #n', async () => {
    const ir = await load(TWICE);
    const m = ir.flows[0].moments[0].id;
    const all = ids(ir);
    expect(new Set(all).size).toBe(all.length);
    expect(all.slice(0, 4)).toEqual([
      `${m}::cat::AddLink::main`,
      `${m}::cat::LinkAdded::main`,
      `${m}::cat::AddLink::main#2`,
      `${m}::cat::LinkAdded::main#2`,
    ]);
  });

  it('leaves a name placed once in a moment exactly as before, in every moment', async () => {
    const ir = await load(TWICE);
    const m2 = ir.flows[0].moments[1].id;
    expect(ids(ir).slice(4)).toEqual([`${m2}::cat::AddLink::main`, `${m2}::cat::LinkAdded::main`]);
  });

  it('routes an event to every node that places it', async () => {
    const ir = await load(TWICE);
    const m = ir.flows[0].moments[0].id;
    const topology = new TopologyEmitter().emit(ir, ir.flows[0]);
    expect(topology.eventRouting['LinkAdded']).toEqual(
      expect.arrayContaining([`${m}::cat::LinkAdded::main`, `${m}::cat::LinkAdded::main#2`]),
    );
    expect(topology.eventRouting['SimProcess.AddLink']).toHaveLength(3);
  });

  it('numbers occurrences within a branch scope on their own', async () => {
    const ir = await load(BRANCHED);
    const all = ids(ir);
    expect(new Set(all).size).toBe(all.length);
    expect(all.filter((i) => i.endsWith('LinkAdded::br0#2'))).toHaveLength(1);
    expect(all.filter((i) => i.endsWith('LinkAdded::br1#2'))).toHaveLength(0);
  });

  it('points each scenario event and the expected path at the right node', async () => {
    for (const source of [TWICE, BRANCHED]) {
      const ir = await load(source);
      const known = new Set(ids(ir));
      for (const s of generateAllScenarios(ir, ir.flows[0])) {
        expect(s.expectedPath.every((id) => known.has(id))).toBe(true);
        const nodeIds = s.events.map((e) => e.payload.nodeId as string);
        expect(nodeIds).toEqual([...s.expectedPath]);
        expect(new Set(nodeIds).size).toBe(nodeIds.length);
      }
    }
  });
});
