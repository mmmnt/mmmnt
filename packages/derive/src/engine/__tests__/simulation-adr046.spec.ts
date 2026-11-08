import { describe, it, expect } from 'vitest';
import { MomentParser, type IntermediateRepresentation } from '@mmmnt/core';
import { generateAllScenarios } from '../simulation-scenario-generator.js';
import { TopologyEmitter } from '../topology-emitter.js';

// ADR-046: the branch condition is stamped under its own reserved key, `$branch`, which no model field can
// be named. `outcome` is still written when the event declares no field of that name, and never over one.

async function load(source: string): Promise<IntermediateRepresentation> {
  const result = await new MomentParser().parseContent(source);
  if (!result.success || !result.ir) {
    throw new Error(result.diagnostics.map((d) => d.message).join('; '));
  }
  return result.ir;
}

const MODEL = `
context "Presale" [Supporting]
  aggregate "Waitlist"
    identity waitlistId: UUID
    command Answer
      input waitlistId: UUID, outcome: string
      emits Answered
    command Plain
      input waitlistId: UUID
      emits Done
    command Settle
      input waitlistId: UUID
      emits Settled
    event Answered
      waitlistId: UUID
      outcome: string
    event Done
      waitlistId: UUID
    event Settled
      waitlistId: UUID

flow "Offer"
  lane p "Presale" [Supporting]
  moment "Before"
    p: Settle
    p: Settled
  moment "Answer" [branch]
    when accepted
      p: Answer
      p: Answered
      p: Plain
      p: Done
    when declined
      p: Plain
      p: Done
`;

const scenario = async (condition: string) => {
  const ir = await load(MODEL);
  const all = generateAllScenarios(ir, ir.flows[0]);
  return all.find(
    (s) =>
      s.scenarioLabel.includes(`[${condition}]`) ||
      (condition === 'accepted' && s.kind === 'happy'),
  )!;
};

const eventOf = (s: Awaited<ReturnType<typeof scenario>>, type: string) =>
  s.events.find((e) => e.eventType === type)!;

describe('ADR-046 the branch stamp has its own key', () => {
  it('stamps `$branch` on every event inside the selected arm, and not outside it', async () => {
    const s = await scenario('accepted');
    for (const type of ['SimProcess.Answer', 'Answered', 'SimProcess.Plain', 'Done'])
      expect(eventOf(s, type).payload.$branch, type).toBe('accepted');
    for (const type of ['SimProcess.Settle', 'Settled']) {
      expect('$branch' in eventOf(s, type).payload, type).toBe(false);
      expect('outcome' in eventOf(s, type).payload, type).toBe(false);
    }
    expect(eventOf(await scenario('declined'), 'Done').payload.$branch).toBe('declined');
  });

  it("never overwrites an event's own `outcome` field", async () => {
    const s = await scenario('accepted');
    expect(eventOf(s, 'Answered').payload.outcome).toBe('sample-outcome');
    expect(eventOf(s, 'SimProcess.Answer').payload.outcome).toBe('sample-outcome');
  });

  it('still writes `outcome` for an event that declares no such field (older consumers)', async () => {
    const s = await scenario('accepted');
    expect(eventOf(s, 'Done').payload.outcome).toBe('accepted');
    expect(eventOf(s, 'SimProcess.Plain').payload.outcome).toBe('accepted');
  });

  it('names `$branch` as the field of every branch predicate in the topology', async () => {
    const ir = await load(MODEL);
    const topology = new TopologyEmitter().emit(ir, ir.flows[0]);
    const predicates = Object.values(topology.branchPredicates);
    expect(predicates.length).toBe(1);
    expect(predicates[0].field).toBe('$branch');
  });

  it('is a key the grammar cannot produce as a field name', async () => {
    const result = await new MomentParser().parseContent(`
context "C" [Core]
  aggregate "A"
    identity id: UUID
    command Go
      emits Went
    event Went
      $branch: string
`);
    expect(result.success).toBe(false);
  });
});
