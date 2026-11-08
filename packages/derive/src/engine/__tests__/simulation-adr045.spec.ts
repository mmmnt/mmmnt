import { describe, it, expect } from 'vitest';
import { MomentParser, type IntermediateRepresentation } from '@mmmnt/core';
import {
  generateAllScenarios,
  generateSimulationScenario,
} from '../simulation-scenario-generator.js';

// ADR-045 D4: the occurrence of the trigger that a declared reaction names carries the declared value of
// the guarded field; every other occurrence carries something else. `after` needs no generation.

async function load(source: string): Promise<IntermediateRepresentation> {
  const result = await new MomentParser().parseContent(source);
  if (!result.success || !result.ir) {
    throw new Error(result.diagnostics.map((d) => d.message).join('; '));
  }
  return result.ir;
}

const model = (trigger: string, field = 'reason: string'): string => `
context "Inventory" [Core]
  aggregate "SeatHold"
    identity holdId: UUID
    command ReleaseHold
      input holdId: UUID
      emits HoldReleased
    command Promote
      input holdId: UUID
      emits Promoted
    command Other
      input holdId: UUID
      emits OtherDone
    event HoldReleased
      holdId: UUID
      ${field}
    event Promoted
      holdId: UUID
    event OtherDone
      holdId: UUID
  policy PromoteWaitlist
    trigger ${trigger}
    action "Promote"
    chains-to Promote

flow "hold-release"
  lane i "Inventory" [Core]
  moment "Holds"
    i: ReleaseHold
    i: HoldReleased
    i: HoldReleased
    i: Promote
      triggered-by HoldReleased
    i: Promoted
`;

const released = (ir: IntermediateRepresentation) =>
  generateSimulationScenario(ir, ir.flows[0]).events.filter((e) => e.eventType === 'HoldReleased');

describe('ADR-045 D4 the occurrence the reaction names', () => {
  it('sets the declared value on the nearest earlier occurrence, and not on the other', async () => {
    const ir = await load(model('HoldReleased when reason = expired'));
    const [first, second] = released(ir);
    expect(second.payload.reason).toBe('expired');
    expect(first.payload.reason).not.toBe('expired');
    expect(first.payload.reason).toBe('sample-reason');
  });

  it('leaves both occurrences at the sample value when the policy declares no condition', async () => {
    const ir = await load(model('HoldReleased'));
    const [first, second] = released(ir);
    expect(first.payload.reason).toBe('sample-reason');
    expect(second.payload.reason).toBe('sample-reason');
  });

  it('generates nothing for an `after` condition (causation already carries it)', async () => {
    const plain = await load(model('HoldReleased'));
    const after = await load(model('HoldReleased after ReleaseHold'));
    const out = (ir: IntermediateRepresentation) =>
      JSON.stringify(generateAllScenarios(ir, ir.flows[0]));
    expect(out(after)).toBe(out(plain));
  });

  it('moves another occurrence off the declared value when the sample would equal it', async () => {
    const ir = await load(model('HoldReleased when reason = sample-reason'));
    const [first, second] = released(ir);
    expect(second.payload.reason).toBe('sample-reason');
    expect(first.payload.reason).not.toBe('sample-reason');
  });

  it('writes a number or a boolean field as that type', async () => {
    const n = await load(model('HoldReleased when attempts = "3"', 'attempts: number'));
    const [nFirst, nSecond] = released(n);
    expect(nSecond.payload.attempts).toBe(3);
    expect(nFirst.payload.attempts).not.toBe(3);
    const b = await load(model('HoldReleased when paid = false', 'paid: boolean'));
    const [bFirst, bSecond] = released(b);
    expect(bSecond.payload.paid).toBe(false);
    expect(bFirst.payload.paid).toBe(true);
  });

  it('does not touch an occurrence when the reaction is some other command', async () => {
    const ir = await load(
      model('HoldReleased when reason = expired').replace('chains-to Promote', 'chains-to Other'),
    );
    const [first, second] = released(ir);
    expect(first.payload.reason).toBe('sample-reason');
    expect(second.payload.reason).toBe('sample-reason');
  });

  it('names the occurrence inside the arm that declares the reaction', async () => {
    const source = model('HoldReleased when reason = expired').replace(
      /moment "Holds"[\s\S]*$/,
      `moment "Holds"
    i: ReleaseHold
    i: HoldReleased
  moment "Decision" [branch]
    when quick
      i: HoldReleased
      i: Promote
        triggered-by HoldReleased
      i: Promoted
    when slow
      i: Other
      i: OtherDone
`,
    );
    const ir = await load(source);
    // The first arm (`quick`) is the happy path.
    const quick = generateAllScenarios(ir, ir.flows[0]).find((s) => s.kind === 'happy')!;
    const [first, second] = quick.events.filter((e) => e.eventType === 'HoldReleased');
    expect(first.payload.reason).toBe('sample-reason');
    expect(second.payload.reason).toBe('expired');
  });
});
