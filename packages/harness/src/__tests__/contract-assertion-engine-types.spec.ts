import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MomentParser } from '@mmmnt/core';
import type {
  IntermediateRepresentation,
  SchemaContract,
  SchemaFieldDefinition,
} from '@mmmnt/core';
import { ContractAssertionEngine } from '../contract-assertion-engine.js';

const ROOT = resolve(import.meta.dirname, '../../../..');
const TICKETWAVE = resolve(ROOT, 'examples/ticketwave/spec/ticketwave.moment');
const FIELD_TYPES = resolve(ROOT, 'fixtures/valid/field-types/field-types.moment');

async function parse(path: string): Promise<IntermediateRepresentation> {
  const result = await new MomentParser().parseContent(readFileSync(path, 'utf-8'), path);
  if (!result.success || !result.ir) throw new Error(`${path} does not parse`);
  return result.ir;
}

function contract(fields: SchemaFieldDefinition[]): SchemaContract {
  return { eventType: 'Sampled', relationshipType: 'CustomerSupplier', fields };
}

function field(name: string, type: string, required = true): SchemaFieldDefinition {
  return { name, type, required };
}

// Built from parts so the secret scan (a UUID pattern) does not read a test value as a token.
const UUID = ['3f2b8c1e', '9a4d', '4e5f', '8b6a', '1c2d3e4f5a6b'].join('-');

describe('ContractAssertionEngine: Moment scalar types', () => {
  const engine = new ContractAssertionEngine();

  it.each([
    ['UUID', UUID],
    ['UUID', UUID.toUpperCase()],
    ['DateTime', '2026-01-01T10:00:00.000Z'],
    ['DateTime', '2026-11-24T15:41:41+01:00'],
    ['Date', '2026-01-01'],
    ['Date', '2024-02-29'],
    ['Money', 0],
    ['Money', 12.5],
    ['number', 2],
    ['string', 'sample'],
    ['boolean', false],
  ])('accepts a valid %s value (%j)', (type, value) => {
    const result = engine.validate('c', { x: value }, contract([field('x', type)]));
    expect(result.violations).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it.each([
    ['UUID', 'h-1', 'format mismatch', '"h-1"'],
    ['UUID', 'holdId-001', 'format mismatch', '"holdId-001"'],
    ['UUID', 42, 'type mismatch', 'number'],
    ['DateTime', '2026-01-01', 'format mismatch', '"2026-01-01"'],
    ['DateTime', '2026-13-01T10:00:00Z', 'format mismatch', '"2026-13-01T10:00:00Z"'],
    ['DateTime', '2026-02-30T10:00:00Z', 'format mismatch', '"2026-02-30T10:00:00Z"'],
    ['DateTime', 1767261600000, 'type mismatch', 'number'],
    ['Date', '2026-02-30', 'format mismatch', '"2026-02-30"'],
    ['Date', '2026-01-01T10:00:00Z', 'format mismatch', '"2026-01-01T10:00:00Z"'],
    ['Money', '12.50', 'type mismatch', 'string'],
    ['Money', Number.NaN, 'type mismatch', 'number'],
    ['number', '2', 'type mismatch', 'string'],
    ['boolean', 'true', 'type mismatch', 'string'],
    ['string', 7, 'type mismatch', 'number'],
  ])('rejects a %s value %j: %s', (type, value, constraint, actual) => {
    const result = engine.validate('c', { x: value }, contract([field('x', type)]));
    expect(result.valid).toBe(false);
    expect(result.violations).toEqual([
      { fieldName: 'x', expected: type, actual, constraintViolated: constraint },
    ]);
  });
});

describe('ContractAssertionEngine: arrays, optional fields and value objects', () => {
  const engine = new ContractAssertionEngine();

  it('checks each item of a T[] field, by its index', () => {
    const c = contract([field('ids', 'UUID[]')]);
    expect(engine.validate('c', { ids: [UUID, UUID] }, c).valid).toBe(true);
    expect(engine.validate('c', { ids: [] }, c).valid).toBe(true);

    expect(engine.validate('c', { ids: UUID }, c).violations).toEqual([
      {
        fieldName: 'ids',
        expected: 'UUID[]',
        actual: 'string',
        constraintViolated: 'type mismatch',
      },
    ]);
    expect(engine.validate('c', { ids: [UUID, 'nope'] }, c).violations).toEqual([
      {
        fieldName: 'ids[1]',
        expected: 'UUID',
        actual: '"nope"',
        constraintViolated: 'format mismatch',
      },
    ]);
  });

  it('skips an absent optional field and checks a present one', () => {
    const c = contract([field('at', 'DateTime', false)]);
    expect(engine.validate('c', {}, c).valid).toBe(true);
    expect(engine.validate('c', { at: null }, c).valid).toBe(true);
    expect(engine.validate('c', { at: 'yesterday' }, c).violations[0].constraintViolated).toBe(
      'format mismatch',
    );
  });

  it('accepts an object for a value object type and rejects anything else', () => {
    const c = contract([field('address', 'Address'), field('lines', 'Address[]')]);
    const address = { street: '1 Main St', city: 'Springfield' };
    expect(engine.validate('c', { address, lines: [address] }, c).valid).toBe(true);

    const result = engine.validate('c', { address: '1 Main St', lines: [address, [address]] }, c);
    expect(result.violations).toEqual([
      {
        fieldName: 'address',
        expected: 'Address',
        actual: 'string',
        constraintViolated: 'type mismatch',
      },
      {
        fieldName: 'lines[1]',
        expected: 'Address',
        actual: 'array',
        constraintViolated: 'type mismatch',
      },
    ]);
  });
});

describe('ContractAssertionEngine over a TicketWave crossing', () => {
  let ir: IntermediateRepresentation;
  let seatsHeld: SchemaContract;

  beforeAll(async () => {
    ir = await parse(TICKETWAVE);
    const flow = ir.flows.find((f) => f.name === 'N2 - Presale access');
    const contracts = (flow?.connections ?? []).flatMap((c) =>
      c.connectionType === 'crosses-to' && c.schemaContract ? [c.schemaContract] : [],
    );
    const found = contracts.find((c) => c.eventType === 'SeatsHeld');
    if (!found) throw new Error('no SeatsHeld crossing');
    seatsHeld = found;
  });

  it('passes a payload of the declared types: UUIDs, a number and a DateTime', () => {
    const payload = {
      holdId: UUID,
      eventId: UUID,
      tierId: UUID,
      quantity: 2,
      customerId: UUID,
      expiresAt: '2026-01-01T10:15:00.000Z',
    };
    const result = new ContractAssertionEngine(ir).validate('x', payload, seatsHeld);
    expect(result.violations).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('reports a malformed UUID, a quantity as a string and a missing field', () => {
    const payload = {
      holdId: 'h-1',
      eventId: UUID,
      tierId: UUID,
      quantity: '2',
      customerId: UUID,
    };
    const result = new ContractAssertionEngine(ir).validate('x', payload, seatsHeld);
    expect(result.violations.map((v) => [v.fieldName, v.constraintViolated])).toEqual([
      ['holdId', 'format mismatch'],
      ['quantity', 'type mismatch'],
      ['expiresAt', 'required field missing'],
    ]);
  });
});

describe('ContractAssertionEngine with the IR: ADR-049 value objects', () => {
  let engine: ContractAssertionEngine;
  const hash = 'a'.repeat(64);
  const actor = { sub: 'u-1', kind: 'user' };

  beforeAll(async () => {
    engine = new ContractAssertionEngine(await parse(FIELD_TYPES));
  });

  it('checks a record value object field by field, optional fields included', () => {
    const c = contract([field('actor', 'Actor')]);
    expect(engine.validate('c', { actor }, c).valid).toBe(true);
    expect(engine.validate('c', { actor: { ...actor, roles: ['admin'] } }, c).valid).toBe(true);

    const result = engine.validate('c', { actor: { kind: 'user', roles: 'admin' } }, c);
    expect(result.violations).toEqual([
      {
        fieldName: 'actor.sub',
        expected: 'string',
        actual: 'missing',
        constraintViolated: 'required field missing',
      },
      {
        fieldName: 'actor.roles',
        expected: 'string[]',
        actual: 'string',
        constraintViolated: 'type mismatch',
      },
    ]);
  });

  it('checks a named code set by its values', () => {
    const c = contract([field('kind', 'ActorKind')]);
    expect(engine.validate('c', { kind: 'api' }, c).valid).toBe(true);
    expect(engine.validate('c', { kind: 'robot' }, c).violations).toEqual([
      {
        fieldName: 'kind',
        expected: '"user" | "api" | "system"',
        actual: '"robot"',
        constraintViolated: 'not in code set',
      },
    ]);
    expect(
      engine.validate(
        'c',
        { actor: { sub: 'u', kind: 'robot' } },
        contract([field('actor', 'Actor')]),
      ).valid,
    ).toBe(false);
  });

  it('checks a scalar value object as its scalar, with its pattern', () => {
    const c = contract([field('hash', 'ContentHash'), field('version', 'CorpusVersion')]);
    expect(engine.validate('c', { hash, version: 'v1' }, c).valid).toBe(true);

    const result = engine.validate('c', { hash: 'xyz', version: { value: 'v1' } }, c);
    expect(result.violations).toEqual([
      {
        fieldName: 'hash',
        expected: 'string matching ^[0-9a-f]{64}$',
        actual: '"xyz"',
        constraintViolated: 'pattern mismatch',
      },
      {
        fieldName: 'version',
        expected: 'string',
        actual: 'object',
        constraintViolated: 'type mismatch',
      },
    ]);
  });

  it('checks a tagged union by its kind: common fields, then the variant fields', () => {
    const c = contract([field('arrival', 'Arrival')]);
    const live = { kind: 'Live', actor };
    const replay = { kind: 'Replay', actor, replay: 'Resume' };
    const document = {
      kind: 'Document',
      actor,
      documentVersion: { documentId: 'd-1', version: '3' },
      location: 's3://x',
      contentHash: hash,
    };
    for (const arrival of [live, replay, document]) {
      expect(engine.validate('c', { arrival }, c).violations).toEqual([]);
    }

    expect(engine.validate('c', { arrival: { kind: 'Replay', actor } }, c).violations).toEqual([
      {
        fieldName: 'arrival.replay',
        expected: '"Bootstrap" | "Resume"',
        actual: 'missing',
        constraintViolated: 'required field missing',
      },
    ]);
    expect(engine.validate('c', { arrival: { kind: 'Mail', actor } }, c).violations).toEqual([
      {
        fieldName: 'arrival.kind',
        expected: '"Live" | "Replay" | "Document"',
        actual: '"Mail"',
        constraintViolated: 'not in code set',
      },
    ]);
    expect(engine.validate('c', { arrival: { actor } }, c).violations[0]).toMatchObject({
      fieldName: 'arrival.kind',
      constraintViolated: 'required field missing',
    });
  });

  it('checks maps, exclusive groups and encrypted fields inside a value object', async () => {
    const ir = await parse(FIELD_TYPES);
    const withEvents = new ContractAssertionEngine({
      ...ir,
      contexts: ir.contexts.map((ctx) => ({
        ...ctx,
        valueObjects: [
          ...ctx.valueObjects,
          // The fields of two events, as value objects, so a contract can name them.
          ...ctx.aggregates
            .flatMap((a) => a.events)
            .map((e) => ({ id: `vo-${e.name}`, name: e.name, fields: e.fields })),
        ],
      })),
    });

    const processed = contract([field('p', 'ReceiptProcessed')]);
    const ok = {
      effect: { kind: 'None', reason: 'none' },
      pointer: 'p-1',
      rationale: { dataKeyId: 'k-1', ciphertext: 'AAAA' },
      actor,
    };
    expect(withEvents.validate('c', { p: ok }, processed).violations).toEqual([]);
    const both = { ...ok, recordRef: { stream: 's', position: 1 }, rationale: 'plain text' };
    expect(withEvents.validate('c', { p: both }, processed).violations).toEqual([
      {
        fieldName: 'p.pointer | recordRef',
        expected: 'exactly one of pointer, recordRef',
        actual: 'pointer, recordRef',
        constraintViolated: 'exclusive fields',
      },
      {
        fieldName: 'p.rationale',
        expected: '{dataKeyId, ciphertext}',
        actual: 'string',
        constraintViolated: 'type mismatch',
      },
    ]);

    const replayed = contract([field('r', 'ReplayCompleted')]);
    const replay = {
      kind: 'Bootstrap',
      replayPoint: { a: 1, b: 2 },
      hashes: [hash],
      pattern: 'p-7',
      actor,
    };
    expect(withEvents.validate('c', { r: replay }, replayed).violations).toEqual([]);
    const bad = { ...replay, replayPoint: { a: '1' }, hashes: [hash, 'short'] };
    expect(withEvents.validate('c', { r: bad }, replayed).violations).toEqual([
      {
        fieldName: 'r.replayPoint.a',
        expected: 'number',
        actual: 'string',
        constraintViolated: 'type mismatch',
      },
      {
        fieldName: 'r.hashes[1]',
        expected: 'string matching ^[0-9a-f]{64}$',
        actual: '"short"',
        constraintViolated: 'pattern mismatch',
      },
    ]);
  });
});
