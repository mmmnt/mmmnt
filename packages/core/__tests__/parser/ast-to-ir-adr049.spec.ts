import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MomentParser } from '../../src/parser/moment-parser.js';
import type {
  ContextDefinition,
  FieldDefinition,
  IntermediateRepresentation,
} from '../../src/ir/index.js';

// ADR-049 D1-D7 and D12: optional fields, code sets, tagged unions, scalar value objects, mutually
// exclusive fields, maps and the field attributes parse, and the IR carries each as an optional key.

const FIXTURE = resolve(
  import.meta.dirname,
  '../../../../fixtures/valid/field-types/field-types.moment',
);

async function parse(source: string): Promise<IntermediateRepresentation> {
  const result = await new MomentParser().parseContent(source);
  const errors = result.diagnostics.filter((d) => d.severity === 'error');
  expect(errors).toEqual([]);
  expect(result.ir).toBeDefined();
  return result.ir!;
}

let fixture: ContextDefinition;
const vo = (name: string) => fixture.valueObjects.find((v) => v.name === name)!;
const evt = (name: string) => fixture.events.find((e) => e.name === name)!;
const field = (fields: FieldDefinition[], name: string) => fields.find((f) => f.name === name)!;

describe('ADR-049 grammar and IR', () => {
  it('parses the field-types fixture with no error', async () => {
    const ir = await parse(readFileSync(FIXTURE, 'utf8'));
    fixture = ir.contexts[0];
    expect(fixture.events.map((e) => e.name)).toEqual([
      'ReceiptRecorded',
      'ReceiptProcessed',
      'ReplayCompleted',
    ]);
  });

  it('D1: `name?: Type` is required: false; a field without `?` stays required', () => {
    const actor = vo('Actor');
    expect(field(actor.fields, 'clientId')).toEqual({
      name: 'clientId',
      type: 'string',
      isArray: false,
      required: false,
    });
    expect(field(actor.fields, 'roles')).toMatchObject({ isArray: true, required: false });
    expect(field(actor.fields, 'sub').required).toBe(true);
  });

  it('D1: an input may be optional, and a keyword input name (`note`) still parses', () => {
    const cmd = fixture.commands.find((c) => c.name === 'RecordReceipt')!;
    expect(field(cmd.inputs, 'note')).toMatchObject({ type: 'string', required: false });
    expect(field(cmd.inputs, 'arrival').required).toBe(true);
  });

  it('D2: a literal set is a string with `enum`, inline or as a scalar value object', () => {
    expect(field(evt('ReplayCompleted').fields, 'kind')).toEqual({
      name: 'kind',
      type: 'string',
      isArray: false,
      required: true,
      enum: ['Bootstrap', 'Resume'],
    });
    expect(vo('ActorKind').scalar).toEqual({
      name: 'ActorKind',
      type: 'string',
      isArray: false,
      required: true,
      enum: ['user', 'api', 'system'],
    });
    expect(vo('ActorKind').fields).toEqual([]);
  });

  it('D2: a code that is a keyword or has a space is written as a string', () => {
    const none = vo('ReceiptEffect').variants!.find((v) => v.name === 'None')!;
    expect(field(none.fields, 'reason').enum).toEqual(['no candidate', 'boundary', 'none']);
  });

  it('D3: variants follow the common fields', () => {
    const arrival = vo('Arrival');
    expect(arrival.fields.map((f) => f.name)).toEqual(['actor']);
    expect(arrival.variants!.map((v) => v.name)).toEqual(['Live', 'Replay', 'Document']);
    expect(arrival.variants![0].fields).toEqual([]);
    expect(arrival.variants![2].fields.map((f) => [f.name, f.required])).toEqual([
      ['documentVersion', true],
      ['location', true],
      ['contentHash', false],
    ]);
    expect(vo('ReceiptEffect').fields).toEqual([]);
  });

  it('D4: `value-object Name: Type [pattern]` is a scalar', () => {
    expect(vo('ContentHash').scalar).toEqual({
      name: 'ContentHash',
      type: 'string',
      isArray: false,
      required: true,
      pattern: '^[0-9a-f]{64}$',
    });
    expect(vo('CorpusVersion').scalar).toMatchObject({ type: 'string' });
  });

  it('D5: `a: T | b: U` is a group of optional fields that name each other', () => {
    const fields = evt('ReceiptProcessed').fields;
    expect(field(fields, 'pointer')).toEqual({
      name: 'pointer',
      type: 'string',
      isArray: false,
      required: false,
      exclusive: ['pointer', 'recordRef'],
    });
    expect(field(fields, 'recordRef')).toMatchObject({
      type: 'RecordRef',
      required: false,
      exclusive: ['pointer', 'recordRef'],
    });
    expect(fields.map((f) => f.name)).toEqual([
      'effect',
      'pointer',
      'recordRef',
      'rationale',
      'actor',
    ]);
  });

  it('D6: `T{key}` and `T{}` are maps', () => {
    const fields = evt('ReplayCompleted').fields;
    expect(field(fields, 'replayPoint')).toEqual({
      name: 'replayPoint',
      type: 'number',
      isArray: false,
      required: true,
      map: { key: 'stream' },
    });
    expect(field(fields, 'endPoint')).toMatchObject({ map: {}, required: false });
  });

  it('D7: `[pattern]`, `[encrypted]` and `[deprecated]` combine; `pattern` may name a field', () => {
    const fields = evt('ReplayCompleted').fields;
    expect(field(fields, 'pattern')).toEqual({
      name: 'pattern',
      type: 'string',
      isArray: false,
      required: true,
      pattern: '^p-[0-9]+$',
      deprecated: { reason: 'renamed', replacement: 'kind' },
    });
    expect(field(evt('ReceiptProcessed').fields, 'rationale')).toEqual({
      name: 'rationale',
      type: 'string',
      isArray: false,
      required: false,
      encrypted: true,
    });
    expect(field(vo('DocumentVersion').fields, 'documentId').pattern).toBe('^[^\\n]*$');
  });

  it('D12: a lane named `pattern` still parses', async () => {
    const ir = await parse(`
context "Shop" [Core]
  aggregate "Order"
    identity orderId: UUID
    command Place
      emits Placed
    event Placed
      orderId: UUID

flow "f"
  lane pattern "Shop" [Core]
  moment "m"
    pattern: Place
    pattern: Placed
`);
    expect(ir.flows[0].lanes[0].id).toBe('pattern');
  });

  it("D9: a model that uses none of it has exactly today's IR keys", async () => {
    const ir = await parse(`
context "Shop" [Core]
  value-object Address
    street: string
  aggregate "Order"
    identity orderId: UUID
    command Place
      input total: number
      emits Placed
    event Placed
      orderId: UUID
      tags: string[]
`);
    const ctx = ir.contexts[0];
    expect(Object.keys(ctx.valueObjects[0]).sort()).toEqual(['fields', 'id', 'name']);
    for (const f of [
      ...ctx.events[0].fields,
      ...ctx.commands[0].inputs,
      ...ctx.valueObjects[0].fields,
    ])
      expect(Object.keys(f).sort()).toEqual(['isArray', 'name', 'required', 'type']);
  });
});
