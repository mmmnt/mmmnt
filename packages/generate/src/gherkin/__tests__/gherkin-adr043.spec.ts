import { describe, it, expect } from 'vitest';
import { MomentParser, type IntermediateRepresentation } from '@mmmnt/core';
import { renderFeatureFromIr } from '../feature-renderer.js';

// ADR-043 D4: an arm that ends at [outcome] renders where [terminal] renders, with `(outcome)` for
// `(terminal)`, ends the flow, and is not tagged or worded as a failure.

async function load(source: string): Promise<IntermediateRepresentation> {
  const result = await new MomentParser().parseContent(source);
  if (!result.success || !result.ir) {
    throw new Error(result.diagnostics.map((d) => d.message).join('; '));
  }
  return result.ir;
}

const MODEL = (soldOut: string): string => `
context "Presale" [Supporting]
  aggregate "Waitlist"
    identity waitlistId: UUID
    command Request
      emits Requested
    command JoinWaitlist
      emits WaitlistJoined
    command Refuse
      emits Refused
    event Requested
      waitlistId: UUID
    event WaitlistJoined
      waitlistId: UUID
    event Refused
      waitlistId: UUID
flow "Seat"
  lane p "Presale" [Supporting]
  moment "Availability" [branch]
    when available
      p: Request
      p: Requested
    when sold-out
      p: JoinWaitlist
      p: WaitlistJoined${soldOut}
    when refused
      p: Refuse
      p: Refused [terminal]
`;

describe('ADR-043 D4 Gherkin', () => {
  it('renders an [outcome] step as (outcome) and ends the flow without a failure tag', async () => {
    const ir = await load(MODEL(' [outcome]'));
    const output = renderFeatureFromIr(ir.flows[0], ir);
    const scenario = output.slice(output.indexOf('Scenario: Availability [sold-out]'));
    const block = scenario.slice(0, scenario.indexOf('Scenario: Availability [refused]'));
    expect(block).toContain('Then Presale emits WaitlistJoined (outcome)');
    expect(block).toContain('Then the flow ends at WaitlistJoined');
    expect(output).not.toContain('(terminal)\n      Then the flow terminates at WaitlistJoined');
    expect(output).toContain('@terminal @alt-path\n    Scenario: Availability [sold-out]');
  });

  it('leaves a [terminal] arm a failure path, rendered as before', async () => {
    const ir = await load(MODEL(''));
    const output = renderFeatureFromIr(ir.flows[0], ir);
    expect(output).toContain('@terminal @failure-path\n    Scenario: Availability [refused]');
    expect(output).toContain('Then Presale emits Refused (terminal)');
    expect(output).toContain('Then the flow terminates at Refused');
  });

  it('renders a model with no [outcome] exactly as before', async () => {
    const ir = await load(MODEL(''));
    const output = renderFeatureFromIr(ir.flows[0], ir);
    expect(output).not.toContain('(outcome)');
    expect(output).toContain('Scenario: Availability [sold-out]');
    expect(output).not.toContain('flow ends at');
  });
});
