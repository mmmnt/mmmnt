import { describe, it, expect } from 'vitest';
import { MomentParser, type IntermediateRepresentation } from '@mmmnt/core';
import { generateImpactAnalysis } from '../impact-analysis-generator.js';

async function load(source: string): Promise<IntermediateRepresentation> {
  const result = await new MomentParser().parseContent(source);
  if (!result.success || !result.ir) {
    throw new Error(result.diagnostics.map((d) => d.message).join('; '));
  }
  return result.ir;
}

const MODEL = `
context "Presale" [Core]
  aggregate "AccessCode"
    identity codeId: UUID
    state initial Open
    state Open -> OneUseLeft on Redeem
    command Redeem
      emits Redeemed when Open | Redeemed, Exhausted when OneUseLeft
    event Redeemed
      codeId: UUID
    event Exhausted
      codeId: UUID
  orchestration Run
    command Begin
      emits Begun, Ended
    command End
    event Begun
      codeId: UUID
    event Ended
      codeId: UUID
    invoked-by Begin
    issues Redeem
    states Running -> Over on End
    compensation none
    timeout window
`;

describe('ADR-041 D5 impact analysis', () => {
  it('links an aggregate command to every event of every outcome, in both directions', async () => {
    const nodes = generateImpactAnalysis(await load(MODEL)).nodes;
    const command = nodes.find((n) => n.name === 'Redeem');
    expect(command?.triggers).toEqual(['event:Presale:Redeemed', 'event:Presale:Exhausted']);
    for (const name of ['Redeemed', 'Exhausted']) {
      expect(nodes.find((n) => n.name === name)?.dependsOn).toContain('command:Presale:Redeem');
    }
  });

  it('links an orchestration command to every process event it records', async () => {
    const nodes = generateImpactAnalysis(await load(MODEL)).nodes;
    expect(nodes.find((n) => n.name === 'Begin')?.triggers).toEqual(
      expect.arrayContaining(['event:Presale:Begun', 'event:Presale:Ended']),
    );
    for (const name of ['Begun', 'Ended']) {
      expect(nodes.find((n) => n.name === name)?.dependsOn).toContain('command:Presale:Begin');
    }
  });

  it('reaches the other event of an outcome from a change to either', async () => {
    const nodes = generateImpactAnalysis(await load(MODEL)).nodes;
    const exhausted = nodes.find((n) => n.name === 'Exhausted');
    const command = nodes.find((n) => n.name === 'Redeem');
    expect(exhausted?.dependsOn).toContain('command:Presale:Redeem');
    expect(command?.triggers).toContain('event:Presale:Redeemed');
  });

  it('lists a single-event command exactly one event', async () => {
    const nodes = generateImpactAnalysis(
      await load(
        MODEL.replace(
          'emits Redeemed when Open | Redeemed, Exhausted when OneUseLeft',
          'emits Redeemed',
        ),
      ),
    ).nodes;
    expect(nodes.find((n) => n.name === 'Redeem')?.triggers).toEqual(['event:Presale:Redeemed']);
  });
});
