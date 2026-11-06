import { describe, it, expect } from 'vitest';
import { MomentParser, type IntermediateRepresentation } from '@mmmnt/core';
import { generateEventCatalog } from '../event-catalog-generator.js';

async function load(source: string): Promise<IntermediateRepresentation> {
  const result = await new MomentParser().parseContent(source);
  if (!result.success || !result.ir) {
    throw new Error(result.diagnostics.map((d) => d.message).join('; '));
  }
  return result.ir;
}

const MODEL = (emits: string, process = 'emits Begun, Ended'): string => `
context "Presale" [Core]
  aggregate "AccessCode"
    identity codeId: UUID
    state initial Open
    state Open -> OneUseLeft on Redeem
    command Redeem
      emits ${emits}
    command Generate
      emits Generated
    event Redeemed
      codeId: UUID
    event Exhausted
      codeId: UUID
    event Generated
      codeId: UUID
  orchestration Run
    command Begin
      ${process}
    command End
    event Begun
      codeId: UUID
    event Ended
      codeId: UUID
    invoked-by Begin
    issues Generate
    states Running -> Over on End
    compensation none
    timeout window
`;

const entry = (ir: IntermediateRepresentation, name: string) =>
  generateEventCatalog(ir).events.find((e) => e.eventName === name);

describe('ADR-041 D5 event catalog', () => {
  it('gives every event of a multi-event command an entry whose producer is that command', async () => {
    const ir = await load(MODEL('Redeemed, Exhausted'));
    expect(entry(ir, 'Redeemed')?.producer).toMatchObject({
      aggregate: 'AccessCode',
      command: 'Redeem',
    });
    expect(entry(ir, 'Exhausted')?.producer).toMatchObject({
      aggregate: 'AccessCode',
      command: 'Redeem',
    });
  });

  it('lists the other events of the outcome as recordedWith, for each event', async () => {
    const ir = await load(MODEL('Redeemed, Exhausted'));
    expect(entry(ir, 'Redeemed')?.producer.recordedWith).toEqual(['Exhausted']);
    expect(entry(ir, 'Exhausted')?.producer.recordedWith).toEqual(['Redeemed']);
    expect(entry(ir, 'Redeemed')?.producer.alternativeTo).toBeUndefined();
  });

  it('lists the events of sibling outcomes as alternativeTo', async () => {
    const ir = await load(MODEL('Redeemed when Open | Exhausted when OneUseLeft'));
    expect(entry(ir, 'Redeemed')?.producer.alternativeTo).toEqual(['Exhausted']);
    expect(entry(ir, 'Exhausted')?.producer.alternativeTo).toEqual(['Redeemed']);
    expect(entry(ir, 'Redeemed')?.producer.recordedWith).toBeUndefined();
  });

  it('tells the shapes apart when one event belongs to two outcomes', async () => {
    const ir = await load(MODEL('Redeemed when Open | Redeemed, Exhausted when OneUseLeft'));
    const redeemed = entry(ir, 'Redeemed')?.producer;
    const exhausted = entry(ir, 'Exhausted')?.producer;
    expect(redeemed?.recordedWith).toEqual(['Exhausted']);
    expect(redeemed?.alternativeTo).toBeUndefined();
    expect(exhausted?.recordedWith).toEqual(['Redeemed']);
    expect(exhausted?.alternativeTo).toEqual(['Redeemed']);
  });

  it('finds the producer of a process event the same way', async () => {
    const ir = await load(MODEL('Redeemed', 'emits Begun, Ended'));
    expect(entry(ir, 'Begun')?.producer).toMatchObject({
      process: 'Run',
      command: 'Begin',
      recordedWith: ['Ended'],
    });
    expect(entry(ir, 'Ended')?.producer.command).toBe('Begin');
  });

  it('adds neither field for a single-event command, whose entries stay as they were', async () => {
    const ir = await load(MODEL('Redeemed', 'emits Begun'));
    for (const name of ['Redeemed', 'Generated', 'Begun']) {
      const producer = entry(ir, name)?.producer ?? {};
      expect(Object.keys(producer)).not.toContain('recordedWith');
      expect(Object.keys(producer)).not.toContain('alternativeTo');
    }
    expect(JSON.stringify(entry(ir, 'Redeemed')?.producer)).toBe(
      '{"context":"Presale","aggregate":"AccessCode","command":"Redeem"}',
    );
  });
});
