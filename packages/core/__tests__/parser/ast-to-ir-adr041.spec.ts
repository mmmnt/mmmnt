import { describe, it, expect, beforeAll } from 'vitest';
import {
  inject,
  createDefaultCoreModule,
  createDefaultSharedCoreModule,
  EmptyFileSystem,
} from 'langium';
import { parseHelper } from 'langium/test';
import { MomentGeneratedModule, MomentGeneratedSharedModule } from '../../src/generated/module.js';
import type { MomentFile } from '../../src/generated/ast.js';
import { astToIr } from '../../src/parser/ast-to-ir.js';
import { emittedEvents, emitOutcomes } from '../../src/index.js';
import type { LangiumDocument } from 'langium';

let parse: (input: string) => Promise<LangiumDocument<MomentFile>>;

beforeAll(() => {
  const shared = inject(
    createDefaultSharedCoreModule(EmptyFileSystem),
    MomentGeneratedSharedModule,
  );
  const services = inject(createDefaultCoreModule({ shared }), MomentGeneratedModule);
  shared.ServiceRegistry.register(services);
  parse = parseHelper<MomentFile>(services);
});

async function toIr(input: string) {
  const doc = await parse(input);
  expect(doc.parseResult.lexerErrors).toHaveLength(0);
  expect(doc.parseResult.parserErrors).toHaveLength(0);
  return astToIr(doc.parseResult.value);
}

const MODEL = (emits: string, orchestrationEmits = ''): string => `
context "Shop" [Core]
  aggregate "Code"
    identity codeId: UUID
    state initial Open
    state Open -> OneUseLeft on Redeem
    command Redeem
      ${emits}
    event Redeemed
      codeId: UUID
    event Exhausted
      codeId: UUID
    event Used
      codeId: UUID
  orchestration Run
    command Start
      ${orchestrationEmits}
    command Stop
    event Started
      codeId: UUID
    event Finished
      codeId: UUID
    invoked-by Start
    issues Redeem
    states Running -> Over on Stop
    compensation none
    timeout window
`;

async function redeem(emits: string, orchestrationEmits = '') {
  const ir = await toIr(MODEL(emits, orchestrationEmits));
  return ir.contexts[0].aggregates[0].commands[0];
}

describe('ADR-041 D3 IR', () => {
  it('writes no outcomes for the plain `emits A`, so the IR of every model that parses today is unchanged', async () => {
    const cmd = await redeem('emits Redeemed');
    expect(cmd.emitsEvent).toBe('Redeemed');
    expect('outcomes' in cmd).toBe(false);
    expect(Object.keys(cmd)).toEqual(['id', 'name', 'inputs', 'preconditions', 'emitsEvent']);
  });

  it('writes outcomes for `emits A, B`, with emitsEvent the first event', async () => {
    const cmd = await redeem('emits Redeemed, Exhausted');
    expect(cmd.emitsEvent).toBe('Redeemed');
    expect(cmd.outcomes).toEqual([{ events: ['Redeemed', 'Exhausted'] }]);
  });

  it('writes one outcome per alternative for `emits A | B`', async () => {
    const cmd = await redeem('emits Exhausted | Redeemed');
    expect(cmd.emitsEvent).toBe('Exhausted');
    expect(cmd.outcomes).toEqual([{ events: ['Exhausted'] }, { events: ['Redeemed'] }]);
  });

  it('carries whenState on the outcome it follows, and omits it elsewhere', async () => {
    const cmd = await redeem('emits Redeemed when Open | Redeemed, Exhausted when OneUseLeft');
    expect(cmd.outcomes).toEqual([
      { events: ['Redeemed'], whenState: 'Open' },
      { events: ['Redeemed', 'Exhausted'], whenState: 'OneUseLeft' },
    ]);
  });

  it('writes outcomes for a single event with a guard, since the guard is information', async () => {
    const cmd = await redeem('emits Redeemed when Open');
    expect(cmd.outcomes).toEqual([{ events: ['Redeemed'], whenState: 'Open' }]);
  });

  it('gives an orchestration command the same fields, and none when it emits nothing', async () => {
    const ir = await toIr(MODEL('emits Redeemed', 'emits Started, Finished'));
    const [start, stop] = ir.contexts[0].sagas[0].commands ?? [];
    expect(start.emitsEvent).toBe('Started');
    expect(start.outcomes).toEqual([{ events: ['Started', 'Finished'] }]);
    expect(stop.emitsEvent).toBeUndefined();
    expect('outcomes' in stop).toBe(false);
    const plain = await toIr(MODEL('emits Redeemed', 'emits Started'));
    expect('outcomes' in (plain.contexts[0].sagas[0].commands?.[0] ?? {})).toBe(false);
  });

  it('keeps the aggregate commands that sit at the context level equal to the aggregates', async () => {
    const ir = await toIr(MODEL('emits Redeemed, Exhausted'));
    expect(ir.contexts[0].commands[0]).toEqual(ir.contexts[0].aggregates[0].commands[0]);
  });
});

describe('ADR-041 D3 helpers', () => {
  it('emittedEvents returns every distinct event the command can record, in declaration order', () => {
    expect(emittedEvents({ emitsEvent: 'A' })).toEqual(['A']);
    expect(emittedEvents({ emitsEvent: 'A', outcomes: [{ events: ['A', 'B'] }] })).toEqual([
      'A',
      'B',
    ]);
    expect(
      emittedEvents({
        emitsEvent: 'A',
        outcomes: [{ events: ['A'] }, { events: ['A', 'B'] }, { events: ['C', 'B'] }],
      }),
    ).toEqual(['A', 'B', 'C']);
  });

  it('emittedEvents returns [] for an orchestration command that emits nothing', () => {
    expect(emittedEvents({})).toEqual([]);
    expect(emittedEvents({ emitsEvent: undefined })).toEqual([]);
  });

  it('emitOutcomes returns outcomes, or the one-event outcome built from emitsEvent, or []', () => {
    const outcomes = [{ events: ['A', 'B'] }];
    expect(emitOutcomes({ emitsEvent: 'A', outcomes })).toEqual(outcomes);
    expect(emitOutcomes({ emitsEvent: 'A' })).toEqual([{ events: ['A'] }]);
    expect(emitOutcomes({})).toEqual([]);
  });

  it('reads hand-built IR that sets only emitsEvent as a single outcome', () => {
    const legacy = { name: 'Old', emitsEvent: 'Done' };
    expect(emitOutcomes(legacy)).toEqual([{ events: ['Done'] }]);
    expect(emittedEvents(legacy)).toEqual(['Done']);
  });

  it('treats an empty emitsEvent as no event', () => {
    expect(emittedEvents({ emitsEvent: '' })).toEqual([]);
    expect(emitOutcomes({ emitsEvent: '' })).toEqual([]);
  });
});
