import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormatsModule from 'ajv-formats';
import { MomentParser, type IntermediateRepresentation } from '@mmmnt/core';
import { emitPayloadSchemas, type PayloadSchemas } from '../payload-json-schema.js';

// ADR-049 D8: one closed JSON Schema (draft 2020-12) per event payload, from the IR alone.

const FIXTURE = resolve(
  import.meta.dirname,
  '../../../../../fixtures/valid/field-types/field-types.moment',
);

const addFormats = addFormatsModule as unknown as (ajv: Ajv2020) => Ajv2020;

async function irOf(source: string): Promise<IntermediateRepresentation> {
  const result = await new MomentParser().parseContent(source);
  expect(result.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  return result.ir!;
}

let out: PayloadSchemas;
let ajv: Ajv2020;
const valid = (event: string, data: unknown): boolean => {
  const validate = ajv.compile(out.schemas[event]);
  return validate(data) as boolean;
};

const ACTOR = { sub: 'u-1', kind: 'user' };
const HASH = 'a'.repeat(64);
const RECORDED = {
  arrival: { kind: 'Live', actor: ACTOR },
  corpusVersion: 'c-1',
  actor: ACTOR,
};
const PROCESSED = { effect: { kind: 'Applied' }, pointer: 'p-1', actor: ACTOR };
const REPLAYED = {
  kind: 'Bootstrap',
  replayPoint: { 'stream-a': 3 },
  hashes: [HASH],
  pattern: 'p-1',
  actor: ACTOR,
};

beforeAll(async () => {
  out = emitPayloadSchemas(await irOf(readFileSync(FIXTURE, 'utf8')));
  ajv = addFormats(new Ajv2020({ strict: true, strictRequired: false, allErrors: true }));
  ajv.addKeyword('x-encrypted');
  ajv.addKeyword('x-key');
});

describe('emitPayloadSchemas', () => {
  it('emits one schema per event and no diagnostic for the fixture', () => {
    expect(out.diagnostics).toEqual([]);
    expect(Object.keys(out.schemas)).toEqual([
      'ReceiptRecorded',
      'ReceiptProcessed',
      'ReplayCompleted',
    ]);
  });

  it('is a closed draft 2020-12 object whose required list leaves out optional fields', () => {
    const s = out.schemas.ReceiptRecorded;
    expect(s.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(s.title).toBe('ReceiptRecorded');
    expect(s.type).toBe('object');
    expect(s.additionalProperties).toBe(false);
    expect(s.required).toEqual(['arrival', 'corpusVersion', 'actor']);
  });

  it('accepts valid payloads', () => {
    expect(valid('ReceiptRecorded', RECORDED)).toBe(true);
    expect(valid('ReceiptProcessed', PROCESSED)).toBe(true);
    expect(valid('ReplayCompleted', REPLAYED)).toBe(true);
  });

  it('closes every object: an unknown property is refused at every level', () => {
    expect(valid('ReceiptRecorded', { ...RECORDED, extra: 1 })).toBe(false);
    expect(valid('ReceiptRecorded', { ...RECORDED, actor: { ...ACTOR, extra: 1 } })).toBe(false);
    expect(
      valid('ReceiptRecorded', { ...RECORDED, arrival: { kind: 'Live', actor: ACTOR, extra: 1 } }),
    ).toBe(false);
  });

  it('optional: an optional field may be absent; a required one may not', () => {
    expect(valid('ReceiptRecorded', { ...RECORDED, contentHash: HASH })).toBe(true);
    const { corpusVersion: _omit, ...missing } = RECORDED;
    expect(valid('ReceiptRecorded', missing)).toBe(false);
  });

  it('code set: enum, inline and through a scalar value object', () => {
    expect(out.schemas.ReplayCompleted.properties!.kind).toEqual({
      type: 'string',
      enum: ['Bootstrap', 'Resume'],
    });
    expect(out.schemas.ReceiptRecorded.$defs!.ActorKind).toEqual({
      type: 'string',
      enum: ['user', 'api', 'system'],
    });
    expect(valid('ReplayCompleted', { ...REPLAYED, kind: 'Other' })).toBe(false);
    expect(valid('ReceiptRecorded', { ...RECORDED, actor: { sub: 'u', kind: 'robot' } })).toBe(
      false,
    );
  });

  it('union: oneOf with one closed branch per variant, tagged by kind', () => {
    const arrival = out.schemas.ReceiptRecorded.$defs!.Arrival;
    expect(arrival.oneOf).toHaveLength(3);
    for (const branch of arrival.oneOf!) {
      expect(branch.type).toBe('object');
      expect(branch.additionalProperties).toBe(false);
      expect(branch.required![0]).toBe('kind');
    }
    expect(arrival.oneOf![1]).toEqual({
      type: 'object',
      additionalProperties: false,
      required: ['kind', 'actor', 'replay'],
      properties: {
        kind: { const: 'Replay' },
        actor: { $ref: '#/$defs/Actor' },
        replay: { type: 'string', enum: ['Bootstrap', 'Resume'] },
      },
    });
    const doc = {
      kind: 'Document',
      actor: ACTOR,
      documentVersion: { documentId: 'd', version: '1' },
      location: 's3://x',
    };
    expect(valid('ReceiptRecorded', { ...RECORDED, arrival: doc })).toBe(true);
    // a field of another variant, or an unknown tag, is refused
    expect(valid('ReceiptRecorded', { ...RECORDED, arrival: { ...doc, replay: 'Resume' } })).toBe(
      false,
    );
    expect(
      valid('ReceiptRecorded', { ...RECORDED, arrival: { kind: 'Other', actor: ACTOR } }),
    ).toBe(false);
    expect(valid('ReceiptProcessed', { ...PROCESSED, effect: { kind: 'None' } })).toBe(false);
    expect(
      valid('ReceiptProcessed', { ...PROCESSED, effect: { kind: 'None', reason: 'no candidate' } }),
    ).toBe(true);
  });

  it('exclusive fields: exactly one of the group', () => {
    const s = out.schemas.ReceiptProcessed;
    expect(s.required).toEqual(['effect', 'actor']);
    expect(s.oneOf).toEqual([{ required: ['pointer'] }, { required: ['recordRef'] }]);
    const { pointer: _p, ...neither } = PROCESSED;
    expect(valid('ReceiptProcessed', neither)).toBe(false);
    expect(
      valid('ReceiptProcessed', { ...PROCESSED, recordRef: { stream: 's', position: 1 } }),
    ).toBe(false);
    expect(valid('ReceiptProcessed', { ...neither, recordRef: { stream: 's', position: 1 } })).toBe(
      true,
    );
  });

  it('map: additionalProperties typed, with the key named', () => {
    expect(out.schemas.ReplayCompleted.properties!.replayPoint).toEqual({
      type: 'object',
      additionalProperties: { type: 'number' },
      'x-key': 'stream',
    });
    expect(out.schemas.ReplayCompleted.properties!.endPoint).toEqual({
      type: 'object',
      additionalProperties: { type: 'number' },
    });
    expect(valid('ReplayCompleted', { ...REPLAYED, replayPoint: { s: 'x' } })).toBe(false);
  });

  it('pattern: on the scalar value object and on a field; arrays put it on the items', () => {
    expect(out.schemas.ReplayCompleted.$defs!.ContentHash).toEqual({
      type: 'string',
      pattern: '^[0-9a-f]{64}$',
    });
    expect(out.schemas.ReplayCompleted.properties!.hashes).toEqual({
      type: 'array',
      items: { $ref: '#/$defs/ContentHash' },
    });
    expect(valid('ReplayCompleted', { ...REPLAYED, hashes: ['XYZ'] })).toBe(false);
    expect(valid('ReplayCompleted', { ...REPLAYED, pattern: 'q-1' })).toBe(false);
    expect(out.schemas.ReplayCompleted.properties!.pattern).toEqual({
      type: 'string',
      pattern: '^p-[0-9]+$',
      deprecated: true,
    });
  });

  it('encrypted: x-encrypted with the {dataKeyId, ciphertext} envelope', () => {
    expect(out.schemas.ReceiptProcessed.properties!.rationale).toEqual({
      'x-encrypted': true,
      type: 'object',
      additionalProperties: false,
      required: ['dataKeyId', 'ciphertext'],
      properties: { dataKeyId: { type: 'string' }, ciphertext: { type: 'string' } },
    });
    expect(
      valid('ReceiptProcessed', { ...PROCESSED, rationale: { dataKeyId: 'k', ciphertext: 'c' } }),
    ).toBe(true);
    expect(valid('ReceiptProcessed', { ...PROCESSED, rationale: 'plain text' })).toBe(false);
  });

  it('built-in formats and Money', async () => {
    const s = emitPayloadSchemas(
      await irOf(`
context "Shop" [Core]
  aggregate "Order"
    identity orderId: UUID
    command Place
      emits Placed
    event Placed
      orderId: UUID
      at: DateTime
      day: Date
      total: Money
      paid: boolean
`),
    ).schemas.Placed;
    expect(s.properties).toEqual({
      orderId: { type: 'string', format: 'uuid' },
      at: { type: 'string', format: 'date-time' },
      day: { type: 'string', format: 'date' },
      total: { type: 'number' },
      paid: { type: 'boolean' },
    });
    expect(s.$defs).toBeUndefined();
  });

  it('a type that is neither built in nor declared is a diagnostic, not an open schema', async () => {
    const result = emitPayloadSchemas(
      await irOf(`
context "Shop" [Core]
  aggregate "Order"
    identity orderId: UUID
    command Place
      emits Placed
    event Placed
      where: Address
`),
    );
    expect(result.diagnostics).toEqual([
      {
        event: 'Placed',
        message: "Event 'Placed': field 'where' has type 'Address', which is not declared.",
      },
    ]);
  });

  it('a one-field record value object stays an object', async () => {
    const s = emitPayloadSchemas(
      await irOf(`
context "Shop" [Core]
  value-object CorpusVersion
    value: string
  aggregate "Order"
    identity orderId: UUID
    command Place
      emits Placed
    event Placed
      version: CorpusVersion
`),
    ).schemas.Placed;
    expect(s.$defs!.CorpusVersion).toEqual({
      type: 'object',
      additionalProperties: false,
      required: ['value'],
      properties: { value: { type: 'string' } },
    });
  });
});
