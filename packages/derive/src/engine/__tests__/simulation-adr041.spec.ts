import { describe, it, expect } from 'vitest';
import { MomentParser, type IntermediateRepresentation } from '@mmmnt/core';
import {
  deriveNegativeScenarios,
  generateAllScenarios,
  generateSimulationScenario,
} from '../simulation-scenario-generator.js';

async function load(source: string): Promise<IntermediateRepresentation> {
  const result = await new MomentParser().parseContent(source);
  if (!result.success || !result.ir) {
    throw new Error(result.diagnostics.map((d) => d.message).join('; '));
  }
  return result.ir;
}

const CONTEXT = (emits: string): string => `
context "Inventory" [Core]
  aggregate "SeatHold"
    identity holdId: UUID
    state initial Active
    state Active -> Closed on Convert
    command Convert
      input holdId: UUID
      precondition holdActive: "The hold is active"
      emits ${emits}
    command Audit
      emits Audited
    event Converted
      holdId: UUID
    event Closed
      holdId: UUID
    event Audited
      holdId: UUID
`;

const together = (nodes: string): string => `${CONTEXT('Converted, Closed')}
flow "Convert"
  lane inv "Inventory" [Core]
  moment "Hold converts"
${nodes}
  moment "Audit"
    inv: Audit
    inv: Audited
`;

const place = (...names: string[]): string => names.map((n) => `    inv: ${n}`).join('\n');

describe('ADR-041 D6 shape (a): events recorded together', () => {
  it('derives the command step, then each event in declared order, contiguous', async () => {
    const ir = await load(together(place('Convert', 'Converted', 'Closed')));
    const s = generateSimulationScenario(ir, ir.flows[0]);
    expect(s.events.map((e) => e.eventType)).toEqual([
      'SimProcess.Convert',
      'Converted',
      'Closed',
      'SimProcess.Audit',
      'Audited',
    ]);
  });

  it('gives every event of the outcome the command step as its only cause, neither citing the other', async () => {
    const ir = await load(together(place('Convert', 'Converted', 'Closed')));
    const [step, first, second] = generateSimulationScenario(ir, ir.flows[0]).events;
    expect(first.causationEventIds).toEqual([step.eventId]);
    expect(second.causationEventIds).toEqual([step.eventId]);
  });

  it('gives the events of the outcome the command step timestamp, and later steps their own', async () => {
    const ir = await load(together(place('Convert', 'Converted', 'Closed')));
    const events = generateSimulationScenario(ir, ir.flows[0]).events;
    expect(events[1].timestamp).toBe(events[0].timestamp);
    expect(events[2].timestamp).toBe(events[0].timestamp);
    expect(events[3].timestamp).not.toBe(events[0].timestamp);
    expect(Date.parse(events[3].timestamp)).toBeGreaterThan(Date.parse(events[2].timestamp));
  });

  it('keeps the previous-node cause for the step after the outcome', async () => {
    const ir = await load(together(place('Convert', 'Converted', 'Closed')));
    const events = generateSimulationScenario(ir, ir.flows[0]).events;
    expect(events[3].causationEventIds).toEqual([events[2].eventId]);
  });

  it('keeps an explicit triggered-by over the default', async () => {
    const ir = await load(`${CONTEXT('Converted, Closed')}
flow "Convert"
  lane inv "Inventory" [Core]
  moment "Hold converts"
    inv: Convert
    inv: Converted
    inv: Closed
      triggered-by Converted
`);
    const [, first, second] = generateSimulationScenario(ir, ir.flows[0]).events;
    expect(second.causationEventIds).toEqual([first.eventId]);
  });

  it('leaves a single-event command exactly as before: a chain, one tick per step', async () => {
    const ir = await load(`${CONTEXT('Converted')}
flow "Convert"
  lane inv "Inventory" [Core]
  moment "Hold converts"
    inv: Convert
    inv: Converted
    inv: Audit
    inv: Audited
`);
    const events = generateSimulationScenario(ir, ir.flows[0]).events;
    expect(events.map((e) => e.causationEventIds)).toEqual([
      [],
      ['evt-001'],
      ['evt-002'],
      ['evt-003'],
    ]);
    const ticks = events.map((e) => Date.parse(e.timestamp) - Date.parse(events[0].timestamp));
    expect(ticks).toEqual([0, 1000, 2000, 3000]);
  });

  it('records no event of any outcome when the command is rejected', async () => {
    const ir = await load(together(place('Convert', 'Converted', 'Closed')));
    const negatives = deriveNegativeScenarios(ir, ir.flows[0]);
    expect(negatives).toHaveLength(1);
    expect(negatives[0].events.map((e) => e.eventType)).toEqual([
      'SimProcess.Convert',
      'SimFailure.Convert.PreconditionViolation',
    ]);
    expect(negatives[0].when).toBe('Convert is invoked without satisfying holdActive');
    expect(negatives[0].then).toBe('The command Convert is rejected');
  });
});

describe('ADR-041 D6 shape (b): alternative outcomes chosen by state', () => {
  const alternatives = (emits: string): string => `${CONTEXT(emits)}
flow "Convert"
  lane inv "Inventory" [Core]
  moment "Hold converts" [branch]
    when active
      inv: Convert
      inv: Converted
    when closing
      inv: Convert
      inv: Converted
      inv: Closed
`;

  it('derives one scenario per alternative, each showing exactly one outcome', async () => {
    const ir = await load(alternatives('Converted when Active | Converted, Closed when Closed'));
    const scenarios = generateAllScenarios(ir, ir.flows[0]);
    expect(scenarios.map((s) => s.events.map((e) => e.eventType))).toEqual([
      ['SimProcess.Convert', 'Converted'],
      ['SimProcess.Convert', 'Converted', 'Closed'],
    ]);
  });

  it('names the guard state in the scenario when, on the scenarios that reach a guarded outcome', async () => {
    const ir = await load(alternatives('Converted when Active | Converted, Closed when Closed'));
    const [first, second] = generateAllScenarios(ir, ir.flows[0]);
    expect(first.when).toBe(
      'The flow progresses through Hold converts; Convert is invoked while SeatHold is Active',
    );
    expect(second.when).toBe(
      'The flow progresses through Hold converts; Convert is invoked while SeatHold is Closed',
    );
  });

  it('records the guard state on the command step as metadata', async () => {
    const ir = await load(alternatives('Converted when Active | Converted, Closed when Closed'));
    const [first, second] = generateAllScenarios(ir, ir.flows[0]);
    expect(first.events[0].payload.whenState).toBe('Active');
    expect(second.events[0].payload.whenState).toBe('Closed');
  });

  it('leaves the when text alone for alternatives with no guard', async () => {
    const ir = await load(alternatives('Converted | Converted, Closed'));
    const [first] = generateAllScenarios(ir, ir.flows[0]);
    expect(first.when).toBe('The flow progresses through Hold converts');
    expect('whenState' in first.events[0].payload).toBe(false);
  });

  it('shares the command timestamp with the events of the outcome it shows', async () => {
    const ir = await load(alternatives('Converted when Active | Converted, Closed when Closed'));
    const second = generateAllScenarios(ir, ir.flows[0])[1];
    expect(second.events[2].causationEventIds).toEqual([second.events[0].eventId]);
    expect(second.events[2].timestamp).toBe(second.events[0].timestamp);
  });
});
