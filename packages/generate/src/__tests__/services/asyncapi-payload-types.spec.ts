/**
 * An AsyncAPI payload types each field as `@mmmnt/schema` does (ADR-049 D8): Money is a number, a value
 * object a `$ref` into `components.schemas`, an array an `items` schema, UUID and DateTime strings with a
 * format, and code sets, unions, maps, optional and exclusive fields as the JSON Schema writes them.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { Ajv } from 'ajv';
import addFormatsModule from 'ajv-formats';
import { MomentParser, type IntermediateRepresentation } from '@mmmnt/core';
import { emitPayloadSchemas, type JsonSchema } from '@mmmnt/schema';
import { generateAsyncApiSpec } from '../../services/asyncapi-generator.js';

const addFormats = addFormatsModule as unknown as (ajv: Ajv) => Ajv;

const ROOT = resolve(import.meta.dirname, '../../../../..');

interface AsyncApiDoc {
  asyncapi: string;
  channels: Record<string, unknown>;
  components: {
    messages: Record<string, { name: string; payload: JsonSchema }>;
    schemas?: Record<string, JsonSchema>;
  };
}

async function irOf(source: string): Promise<IntermediateRepresentation> {
  const result = await new MomentParser().parseContent(source);
  const errors = result.diagnostics.filter((d) => d.severity === 'error');
  if (!result.ir || errors.length > 0) throw new Error(errors.map((d) => d.message).join('; '));
  return result.ir;
}

const LEDGER = `
context "Ledger" [Core]
  value-object Currency: "EUR" | "USD"

  value-object Code: string

  value-object Line
    sku: string
    qty: number

  value-object Tender
    | Card
        last4: string
    | Cash

  aggregate "Account"
    identity accountId: UUID

    command Post
      input accountId: UUID
      emits Posted

    event Posted
      accountId: UUID
      amount: Money
      bookedOn: Date
      at: DateTime
      settled: boolean
      count: number
      memo?: string
      currency: Currency
      status: "open" | "closed"
      lines: Line[]
      tender: Tender
      totals: Money{currency}
      tags: string{}
      code: Code [pattern "^[A-Z]{3}$"]
      ref: string [pattern "^r-[0-9]+$"]
      secret: string [encrypted]
      old: Line [deprecated "split" -> "lines"]
      iban: string | card: string

context "Audit" [Supporting]
  aggregate "Trail"
    identity trailId: UUID

    command Record
      input trailId: UUID
      emits Recorded

    event Recorded
      trailId: UUID

flow "Posting"
  lane ledger "Ledger" [Core]
  lane audit "Audit" [Supporting]

  moment "An entry is posted"
    ledger: Post
    ledger: Posted crosses-to audit via CustomerSupplier
      contract
        accountId: UUID [required]
        amount: Money [required]

  moment "The trail records it"
    audit: Record
      triggered-by Posted
    audit: Recorded
`;

let ir: IntermediateRepresentation;
let output: string;
let doc: AsyncApiDoc;
let payload: JsonSchema;

beforeAll(async () => {
  ir = await irOf(LEDGER);
  output = generateAsyncApiSpec(ir);
  doc = parseYaml(output) as AsyncApiDoc;
  payload = doc.components.messages.Posted.payload;
});

describe('AsyncAPI payload types (ADR-049 D8)', () => {
  it.each<[string, JsonSchema]>([
    ['accountId', { type: 'string', format: 'uuid' }],
    ['amount', { type: 'number' }],
    ['bookedOn', { type: 'string', format: 'date' }],
    ['at', { type: 'string', format: 'date-time' }],
    ['settled', { type: 'boolean' }],
    ['count', { type: 'number' }],
    ['memo', { type: 'string' }],
    ['currency', { $ref: '#/components/schemas/Currency' }],
    ['status', { type: 'string', enum: ['open', 'closed'] }],
    ['lines', { type: 'array', items: { $ref: '#/components/schemas/Line' } }],
    ['tender', { $ref: '#/components/schemas/Tender' }],
    ['totals', { type: 'object', additionalProperties: { type: 'number' }, 'x-key': 'currency' }],
    ['tags', { type: 'object', additionalProperties: { type: 'string' } }],
    ['code', { allOf: [{ $ref: '#/components/schemas/Code' }], pattern: '^[A-Z]{3}$' }],
    ['ref', { type: 'string', pattern: '^r-[0-9]+$' }],
    [
      'secret',
      {
        'x-encrypted': true,
        type: 'object',
        additionalProperties: false,
        required: ['dataKeyId', 'ciphertext'],
        properties: { dataKeyId: { type: 'string' }, ciphertext: { type: 'string' } },
      },
    ],
    ['old', { allOf: [{ $ref: '#/components/schemas/Line' }], deprecated: true }],
    ['iban', { type: 'string' }],
    ['card', { type: 'string' }],
  ])('types %s', (field, expected) => {
    expect(payload.properties?.[field]).toEqual(expected);
  });

  it('writes the payload as a closed object with the exclusive group, the contract required list', () => {
    expect(payload.type).toBe('object');
    expect(payload.additionalProperties).toBe(false);
    expect(payload.required).toEqual(['accountId', 'amount']);
    expect(payload.oneOf).toEqual([{ required: ['iban'] }, { required: ['card'] }]);
  });

  it('writes every value object the payload reaches under components.schemas, by name', () => {
    expect(Object.keys(doc.components.schemas ?? {})).toEqual([
      'Code',
      'Currency',
      'Line',
      'Tender',
    ]);
    expect(doc.components.schemas?.Currency).toEqual({ type: 'string', enum: ['EUR', 'USD'] });
    expect(doc.components.schemas?.Code).toEqual({ type: 'string' });
    expect(doc.components.schemas?.Tender).toEqual({
      oneOf: [
        {
          type: 'object',
          additionalProperties: false,
          required: ['kind', 'last4'],
          properties: { kind: { const: 'Card' }, last4: { type: 'string' } },
        },
        {
          type: 'object',
          additionalProperties: false,
          required: ['kind'],
          properties: { kind: { const: 'Cash' } },
        },
      ],
    });
  });

  it('matches the @mmmnt/schema JSON Schema of the event, field by field', () => {
    const schema = emitPayloadSchemas(ir).schemas.Posted;
    const asComponent = (s: unknown): unknown =>
      JSON.parse(JSON.stringify(s).replaceAll('#/$defs/', '#/components/schemas/'));
    for (const [name, field] of Object.entries(schema.properties ?? {})) {
      const written = payload.properties?.[name];
      if (field.$ref !== undefined && Object.keys(field).length > 1) {
        // A $ref with siblings is wrapped in allOf for draft 07; the siblings are kept.
        const { $ref, ...siblings } = field;
        expect(written, name).toEqual(asComponent({ allOf: [{ $ref }], ...siblings }));
      } else {
        expect(written, name).toEqual(asComponent(field));
      }
    }
    for (const [name, def] of Object.entries(schema.$defs ?? {})) {
      expect(doc.components.schemas?.[name], name).toEqual(asComponent(def));
    }
  });

  it('validates payloads under draft 07, the AsyncAPI schema format, with refs into components', () => {
    const ajv = addFormats(new Ajv({ strict: false }));
    const validate = ajv.compile({ ...payload, components: { schemas: doc.components.schemas } });
    const posted = {
      accountId: ['00000000', '0000', '4000', '8000', '000000000001'].join('-'),
      amount: 12.5,
      bookedOn: '2026-11-24',
      at: '2026-11-24T10:00:00Z',
      settled: false,
      count: 1,
      currency: 'EUR',
      status: 'open',
      lines: [{ sku: 'A', qty: 2 }],
      tender: { kind: 'Card', last4: '4242' },
      totals: { EUR: 12.5 },
      tags: {},
      code: 'ABC',
      ref: 'r-1',
      secret: { dataKeyId: 'k', ciphertext: 'c' },
      old: { sku: 'A', qty: 2 },
      iban: 'DE00',
    };
    expect(validate(posted), JSON.stringify(validate.errors)).toBe(true);
    expect(validate({ ...posted, extra: 1 })).toBe(false);
    expect(validate({ ...posted, accountId: 'not-a-uuid' })).toBe(false);
    expect(validate({ ...posted, amount: '12.50' })).toBe(false);
    expect(validate({ ...posted, currency: 'GBP' })).toBe(false);
    expect(validate({ ...posted, code: 'abc' })).toBe(false);
    expect(validate({ ...posted, tender: { kind: 'Cheque' } })).toBe(false);
    expect(validate({ ...posted, card: '4242' })).toBe(false);
  });

  it('writes valid AsyncAPI 3.0 YAML, the same every time', () => {
    expect(doc.asyncapi).toBe('3.0.0');
    expect(Object.keys(doc.channels)).toEqual(['posted']);
    expect(generateAsyncApiSpec(ir)).toBe(output);
  });

  it('leaves out a contract required name the event does not declare: the payload is closed', async () => {
    const model = await irOf(
      LEDGER.replace(
        'amount: Money [required]',
        'amount: Money [required]\n        holdId: UUID [required]',
      ),
    );
    const message = (parseYaml(generateAsyncApiSpec(model)) as AsyncApiDoc).components.messages
      .Posted;
    expect(message.payload.required).toEqual(['accountId', 'amount']);
  });
});

describe('AsyncAPI value objects of the same name in two contexts', () => {
  it('names each payload’s own value objects apart when their schemas differ', async () => {
    const model = await irOf(`
context "Orders" [Core]
  value-object Address
    street: string

  aggregate "Order"
    identity orderId: UUID
    command Place
      input orderId: UUID
      emits Placed
    event Placed
      orderId: UUID
      to: Address

context "Billing" [Core]
  value-object Address
    iban: string

  aggregate "Invoice"
    identity invoiceId: UUID
    command Bill
      input invoiceId: UUID
      emits Billed
    event Billed
      invoiceId: UUID
      to: Address

context "Shipping" [Supporting]
  aggregate "Parcel"
    identity parcelId: UUID
    command Ship
      input parcelId: UUID
      emits Shipped
    event Shipped
      parcelId: UUID

flow "Order to cash"
  lane orders "Orders" [Core]
  lane billing "Billing" [Core]
  lane shipping "Shipping" [Supporting]

  moment "Placed"
    orders: Place
    orders: Placed crosses-to shipping via CustomerSupplier
      contract
        orderId: UUID [required]

  moment "Billed"
    billing: Bill
    billing: Billed crosses-to shipping via CustomerSupplier
      contract
        invoiceId: UUID [required]

  moment "Shipped"
    shipping: Ship
    shipping: Shipped
`);
    const doc = parseYaml(generateAsyncApiSpec(model)) as AsyncApiDoc;
    expect(Object.keys(doc.components.schemas ?? {})).toEqual(['Address', 'Billed.Address']);
    expect(doc.components.schemas?.Address.properties).toEqual({ street: { type: 'string' } });
    expect(doc.components.schemas?.['Billed.Address'].properties).toEqual({
      iban: { type: 'string' },
    });
    expect(doc.components.messages.Placed.payload.properties?.to).toEqual({
      $ref: '#/components/schemas/Address',
    });
    expect(doc.components.messages.Billed.payload.properties?.to).toEqual({
      $ref: '#/components/schemas/Billed.Address',
    });
  });
});

describe('AsyncAPI of TicketWave', () => {
  it('is the committed examples/ticketwave/facet/asyncapi.yaml', async () => {
    const path = resolve(ROOT, 'examples/ticketwave/spec/ticketwave.moment');
    const result = await new MomentParser().parseContent(readFileSync(path, 'utf-8'), path);
    if (!result.ir) throw new Error('TicketWave did not parse');
    const committed = readFileSync(
      resolve(ROOT, 'examples/ticketwave/facet/asyncapi.yaml'),
      'utf-8',
    );
    expect(generateAsyncApiSpec(result.ir)).toBe(committed);
  });
});
