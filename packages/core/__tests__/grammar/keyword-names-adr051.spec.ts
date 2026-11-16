import { describe, it, expect, beforeAll } from 'vitest';
import {
  AstUtils,
  GrammarAST,
  inject,
  createDefaultCoreModule,
  createDefaultSharedCoreModule,
  EmptyFileSystem,
} from 'langium';
import { parseHelper } from 'langium/test';
import { MomentGeneratedModule, MomentGeneratedSharedModule } from '../../src/generated/module.js';
import { MomentGrammar } from '../../src/generated/grammar.js';
import type { MomentFile } from '../../src/generated/ast.js';
import { astToIr } from '../../src/parser/ast-to-ir.js';
import type { LangiumDocument } from 'langium';

// ADR-051: every word the grammar reserves may name a field, an input and a lane, and may be the first
// segment of a policy condition. The words are read from the grammar itself, so a keyword a later ADR adds
// is held to the same rule without this spec being edited.

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

const ID_SHAPED = /^[a-zA-Z_][a-zA-Z0-9_-]*$/;

/** Every keyword of the grammar that has the shape of an identifier (a word, not punctuation). */
function wordKeywords(): string[] {
  const words = new Set<string>();
  for (const node of AstUtils.streamAllContents(MomentGrammar())) {
    if (GrammarAST.isKeyword(node) && ID_SHAPED.test(node.value)) words.add(node.value);
  }
  return [...words].sort();
}

async function errorsOf(doc: LangiumDocument<MomentFile>): Promise<string[]> {
  return [
    ...doc.parseResult.lexerErrors.map((e) => e.message),
    ...doc.parseResult.parserErrors.map((e) => e.message),
  ];
}

/** One model that uses the word `k` in every name position: fields, inputs, lanes and a condition. */
const MODEL = (k: string): string => `
context "C" [Core]
  value-object Shape
    ${k}: string
  value-object Choice
    common: string
    | First
        ${k}: string
    | Second
  aggregate "A"
    identity ${k}: UUID
    command Do
      input ${k}: string, other?: string
      emits Done
    command Again
      input other: string, ${k}?: string
      emits Done
    event Done
      ${k}: string
      before?: Choice
    event Other
      other: string | ${k}?: number
    event Later
      ${k}?: Choice
  projection Board
    sources Done
    field ${k}: string
  query Look
    reads Board
    input ${k}: string
  policy OnDone
    trigger Done when ${k} = x
    action "a"
    chains-to Again
  policy OnLater
    trigger Later when ${k}.kind = First
    action "b"
    chains-to Again
flow "F"
  lane ${k} "Lane" [Core]
  lane m "M" [Core]
  moment "One"
    ${k}: Do
    note ${k}: "said"
    ${k}: Done
      crosses-to m via CustomerSupplier
      contract id: string
  moment "Two" [branch]
    when a [${k}]
      ${k}: Again
    when b
      m: Other
`;

describe('ADR-051 D1: any keyword names a field, an input and a lane', () => {
  const words = wordKeywords();

  it('reads the reserved words from the grammar', () => {
    // A floor, not the list: the list is the grammar's.
    expect(words.length).toBeGreaterThanOrEqual(80);
    for (const w of ['scope', 'policy', 'context', 'trigger', 'on', 'type', 'string', 'UUID']) {
      expect(words).toContain(w);
    }
  });

  it.each(wordKeywords())('`%s` in every name position', async (k) => {
    const doc = await parse(MODEL(k));
    expect(await errorsOf(doc)).toEqual([]);
    const ir = astToIr(doc.parseResult.value);
    const ctx = ir.contexts[0];
    const agg = ctx.aggregates[0];
    const event = (name: string) => agg.events.find((e) => e.name === name)!;
    const command = (name: string) => agg.commands.find((c) => c.name === name)!;

    expect(agg.identityField.name).toBe(k);
    expect(command('Do').inputs.map((i) => i.name)).toEqual([k, 'other']);
    expect(command('Again').inputs.map((i) => [i.name, i.required])).toEqual([
      ['other', true],
      [k, false],
    ]);
    expect(event('Done').fields.map((f) => f.name)).toEqual([k, 'before']);
    expect(event('Other').fields.map((f) => f.name)).toEqual(['other', k]);
    expect(event('Later').fields.map((f) => [f.name, f.required])).toEqual([[k, false]]);
    const shape = ctx.valueObjects.find((v) => v.name === 'Shape')!;
    expect(shape.fields.map((f) => f.name)).toEqual([k]);
    const choice = ctx.valueObjects.find((v) => v.name === 'Choice')!;
    expect(choice.variants?.map((v) => [v.name, v.fields.map((f) => f.name)])).toEqual([
      ['First', [k]],
      ['Second', []],
    ]);
    expect(ctx.projections[0].fields.map((f) => f.name)).toEqual([k]);
    expect(ctx.queries[0].inputs.map((i) => i.name)).toEqual([k]);
    expect(ctx.policies.map((p) => p.condition?.field)).toEqual([k, `${k}.kind`]);

    const flow = ir.flows[0];
    expect(flow.lanes.map((l) => l.id)).toEqual([k, 'm']);
    const laneContext = flow.lanes[0].contextId;
    const [one, two] = flow.moments;
    expect(one.contextEntries.map((e) => [e.contextId, e.nodeName])).toEqual([
      [laneContext, 'Do'],
      [laneContext, 'Done'],
    ]);
    expect(one.notes).toEqual([{ text: 'said', laneId: k }]);
    expect(two.branches?.[0].lane).toBe(k);
    expect(two.branches?.[0].entries.map((e) => [e.contextId, e.nodeName])).toEqual([
      [laneContext, 'Again'],
    ]);
  });
});

describe('ADR-051 D2: a keyword followed by a name still begins its declaration', () => {
  it('ends a field list at every declaration that can follow one', async () => {
    const doc = await parse(`
context "C" [Core]
  aggregate "A"
    identity scope: UUID
    state initial Open
    event Done
      scope: string
      policy?: string
      context: string
      trigger: string
    value-object Shape
      type: string
    invariant I1 "held" scope Done
    command Do
      input scope: string
      causes Done
      emits Done
    @classification(core)
    event After
      on: string
  policy OnDone
    trigger Done when trigger = x
    action "a"
    chains-to Do
  projection Board
    sources Done
    field scope: string
  query Look
    reads Board
  rule R1 "r" enforced-by Look
  term "T" "t"
  service S
    consumes Done
    produces After
    description "s"
flow "F"
  lane context "C" [Core]
  moment "One"
    context: Do
    context: Done
`);
    expect(await errorsOf(doc)).toEqual([]);
    const ctx = astToIr(doc.parseResult.value).contexts[0];
    const agg = ctx.aggregates[0];
    expect(agg.events.map((e) => [e.name, e.fields.map((f) => f.name)])).toEqual([
      ['Done', ['scope', 'policy', 'context', 'trigger']],
      ['After', ['on']],
    ]);
    expect(agg.commands.map((c) => c.name)).toEqual(['Do']);
    expect(agg.invariants.map((i) => i.id)).toEqual(['I1']);
    expect(ctx.policies[0].condition).toEqual({ field: 'trigger', equals: 'x' });
    expect(ctx.projections[0].fields.map((f) => f.name)).toEqual(['scope']);
  });

  it('keeps a placement after a crossing contract a placement (contract fields stay identifiers)', async () => {
    const doc = await parse(`
flow "F"
  lane a "A" [Core]
  lane note "B" [Core]
  moment "One"
    a: Done
      crosses-to note via CustomerSupplier
      contract id: string
    note: Received
`);
    expect(await errorsOf(doc)).toEqual([]);
    const flow = astToIr(doc.parseResult.value).flows[0];
    const [a, note] = flow.lanes.map((l) => l.contextId);
    expect(flow.moments[0].contextEntries.map((e) => [e.contextId, e.nodeName])).toEqual([
      [a, 'Done'],
      [note, 'Received'],
    ]);
  });

  it('still refuses a keyword where a declaration needs its own word', async () => {
    const doc = await parse(`
context "C" [Core]
  aggregate "A"
    identity id: UUID
    event Done
      scope string
`);
    expect((await errorsOf(doc)).length).toBeGreaterThan(0);
  });
});
