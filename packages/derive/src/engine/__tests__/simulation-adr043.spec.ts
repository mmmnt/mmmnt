import { describe, it, expect } from 'vitest';
import { MomentParser, type IntermediateRepresentation } from '@mmmnt/core';
import {
  generateAllScenarios,
  generateSimulationScenario,
} from '../simulation-scenario-generator.js';
import { TopologyEmitter } from '../topology-emitter.js';

// ADR-043: an arm that ends at `[outcome]` is a normal outcome (`variant`); an arm that ends at
// `[terminal]` stays a failure exit (`failure`).

async function load(source: string): Promise<IntermediateRepresentation> {
  const result = await new MomentParser().parseContent(source);
  if (!result.success || !result.ir) {
    throw new Error(result.diagnostics.map((d) => d.message).join('; '));
  }
  return result.ir;
}

const CONTEXT = `
context "Presale" [Supporting]
  aggregate "Waitlist"
    identity waitlistId: UUID
    command Request
      emits Requested
    command JoinWaitlist
      emits WaitlistJoined
    command Refuse
      emits Refused
    command Park
      emits Parked
    command Finish
      emits Finished
    event Requested
      waitlistId: UUID
    event WaitlistJoined
      waitlistId: UUID
    event Refused
      waitlistId: UUID
    event Parked
      waitlistId: UUID
    event Finished
      waitlistId: UUID
`;

const FLOW = `${CONTEXT}
flow "Seat"
  lane p "Presale" [Supporting]
  moment "Request"
    p: Request
    p: Requested
  moment "Availability" [branch]
    when available
      p: Finish
      p: Finished
    when sold-out
      p: JoinWaitlist
      p: WaitlistJoined [outcome]
    when refused
      p: Refuse
      p: Refused [terminal]
    when parked
      p: Park
      p: Parked
  moment "After"
    p: Finish
    p: Finished
`;

// The same flow with no [outcome]: a failure exit, a variant and a happy path, as before the ADR.
const PLAIN = FLOW.replace(' [outcome]', '');

const byCondition = <T extends { scenarioLabel: string }>(scenarios: T[], condition: string) =>
  scenarios.find((s) => s.scenarioLabel.includes(`[${condition}]`));

describe('ADR-043 D3 classification', () => {
  it('classifies an arm that ends at [outcome] as a variant and stops the walk there', async () => {
    const ir = await load(FLOW);
    const scenario = byCondition(generateAllScenarios(ir, ir.flows[0]), 'sold-out');
    expect(scenario?.kind).toBe('variant');
    expect(scenario?.scenarioLabel).toBe('Variant: Seat [sold-out]');
    const types = scenario?.events.map((e) => e.eventType);
    expect(types?.at(-1)).toBe('WaitlistJoined');
    // nothing after the outcome: neither the arm's later placement nor the following moment
    expect(types).toEqual([
      'SimProcess.Request',
      'Requested',
      'SimProcess.JoinWaitlist',
      'WaitlistJoined',
    ]);
  });

  it('keeps an arm that ends at [terminal] a failure', async () => {
    const ir = await load(PLAIN);
    const scenario = byCondition(generateAllScenarios(ir, ir.flows[0]), 'refused');
    expect(scenario?.kind).toBe('failure');
    expect(scenario?.scenarioLabel).toBe('Failure Path: Seat [refused]');
  });

  it('keeps an arm with no terminal a variant and the first arm happy', async () => {
    const ir = await load(PLAIN);
    const all = generateAllScenarios(ir, ir.flows[0]);
    expect(byCondition(all, 'parked')?.kind).toBe('variant');
    expect(all[0].kind).toBe('happy');
  });

  it('gives label and kind the same rule for every arm of every path', async () => {
    const ir = await load(FLOW);
    const prefix = { happy: 'Happy Path:', variant: 'Variant:', failure: 'Failure Path:' } as const;
    for (const s of generateAllScenarios(ir, ir.flows[0])) {
      expect(
        s.scenarioLabel.startsWith(prefix[s.kind as keyof typeof prefix]),
        s.scenarioLabel,
      ).toBe(true);
    }
  });

  it('classifies a selected arm through the single-scenario entry point too', async () => {
    const ir = await load(FLOW);
    const outcome = generateSimulationScenario(ir, ir.flows[0], {
      branchSelections: { Availability: 'sold-out' },
    });
    const failure = generateSimulationScenario(ir, ir.flows[0], {
      branchSelections: { Availability: 'refused' },
    });
    expect([outcome.kind, failure.kind]).toEqual(['variant', 'failure']);
  });
});

describe('ADR-043 D2 topology', () => {
  it('marks the outcome node terminal and adds no field', async () => {
    const ir = await load(FLOW);
    const topology = new TopologyEmitter().emit(ir, ir.flows[0]);
    const node = topology.frames.flatMap((f) => f.nodes).find((n) => n.label === 'WaitlistJoined');
    expect(node?.terminal).toBe(true);
    expect('exit' in (node ?? {})).toBe(false);
  });
});
