import { describe, it, expect } from 'vitest';
import { MomentParser, type IntermediateRepresentation } from '@mmmnt/core';
import { SpecificationDocumentGenerator } from '../../services/specification-document-generator.js';

// ADR-043 D4: the specification document counts an [outcome] arm with the arms that end the flow, and
// does not call it a failure.

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
      p: WaitlistJoined [outcome]
    when refused
      p: Refuse
      p: Refused [terminal]
`;

describe('ADR-043 D4 specification document', () => {
  it('narrates an [outcome] arm as ending the flow, a [terminal] arm as terminating it', async () => {
    const content = new SpecificationDocumentGenerator().generate(await load(MODEL))[0].content;
    expect(content).toContain('flow ends at **WaitlistJoined**');
    expect(content).not.toContain('flow terminates at **WaitlistJoined**');
    expect(content).toContain('❌ **If refused:** flow terminates at **Refused**');
  });

  it('counts the outcome arm with the terminal arms in the sequence diagram', async () => {
    const content = new SpecificationDocumentGenerator().generate(await load(MODEL))[0].content;
    expect(content).toContain('Flow ends at an outcome');
    expect(content).toContain('Flow terminates');
    expect(content).not.toContain('Presale->>Presale: WaitlistJoined');
  });
});
