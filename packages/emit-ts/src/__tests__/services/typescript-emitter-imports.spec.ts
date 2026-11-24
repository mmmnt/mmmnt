import { describe, it, expect } from 'vitest';
import type {
  IntermediateRepresentation,
  ContextDefinition,
  AggregateDefinition,
  ValueObjectDefinition,
  CommandDefinition,
  EventDefinition,
  FieldDefinition,
  SagaDefinition,
} from '@mmmnt/core';
import { TypeScriptEmitter } from '../../services/typescript-emitter.js';
import type { GenerationScope } from '../../types/index.js';

// Built-in types are written as TypeScript types, and a file imports each declared type it names from
// the file that declares it, so the emitted files compile on their own.

const field = (
  name: string,
  type: string,
  extra: Partial<FieldDefinition> = {},
): FieldDefinition => ({
  name,
  type,
  isArray: false,
  required: true,
  ...extra,
});

const vo = (
  name: string,
  fields: FieldDefinition[] = [field('value', 'string')],
): ValueObjectDefinition => ({
  id: `vo-${name}`,
  name,
  fields,
});

const event = (name: string, fields: FieldDefinition[] = []): EventDefinition => ({
  id: `evt-${name}`,
  name,
  fields,
});

const command = (
  name: string,
  inputs: FieldDefinition[],
  emitsEvent: string,
): CommandDefinition => ({
  id: `cmd-${name}`,
  name,
  inputs,
  preconditions: [],
  emitsEvent,
});

const aggregate = (
  name: string,
  extra: Partial<AggregateDefinition> = {},
): AggregateDefinition => ({
  id: `agg-${name}`,
  name,
  identityField: field('id', 'UUID'),
  commands: [],
  events: [],
  valueObjects: [],
  invariants: [],
  ...extra,
});

const context = (name: string, extra: Partial<ContextDefinition> = {}): ContextDefinition => ({
  id: `ctx-${name}`,
  name,
  aggregates: [],
  domainServices: [],
  commands: [],
  events: [],
  policies: [],
  sagas: [],
  valueObjects: [],
  invariants: [],
  ...extra,
});

const ir = (...contexts: ContextDefinition[]): IntermediateRepresentation => ({
  contexts,
  flows: [],
  glossary: [],
  relationships: [],
  metadata: { name: 'Spec', version: '1.0.0' },
});

const emit = (model: IntermediateRepresentation, scope: GenerationScope = { level: 'system' }) =>
  new TypeScriptEmitter().emit(model, { scope }).files;

describe('built-in types', () => {
  const model = ir(
    context('Sales', {
      aggregates: [
        aggregate('Order', {
          events: [
            event('OrderPlaced', [
              field('orderId', 'UUID'),
              field('placedAt', 'DateTime'),
              field('dueOn', 'Date'),
              field('total', 'Money'),
              field('lines', 'number'),
              field('express', 'boolean'),
              field('note', 'string'),
              field('history', 'DateTime', { isArray: true }),
              field('prices', 'Money', { map: {} }),
            ]),
          ],
        }),
      ],
    }),
  );
  const types = emit(model).get('src/sales/order.types.ts')!;

  it('UUID and DateTime are strings and Money is a number, as @mmmnt/schema records them', () => {
    expect(types).toContain('  readonly orderId: string;');
    expect(types).toContain('  readonly placedAt: string;');
    expect(types).toContain('  readonly total: number;');
    expect(types).toContain('  readonly history: readonly string[];');
    expect(types).toContain('  readonly prices: Readonly<Record<string, number>>;');
  });

  it('Date, string, number and boolean keep their TypeScript types', () => {
    expect(types).toContain('  readonly dueOn: Date;');
    expect(types).toContain('  readonly lines: number;');
    expect(types).toContain('  readonly express: boolean;');
    expect(types).toContain('  readonly note: string;');
  });

  it('no built-in type is written as a name, and none is imported', () => {
    expect(types).not.toMatch(/\b(DateTime|Money|UUID)\b/);
    expect(types).not.toContain('import');
  });

  it('a scalar value object of a built-in type is an alias of its TypeScript type', () => {
    const files = emit(
      ir(
        context('Sales', {
          valueObjects: [
            { id: 'vo-At', name: 'At', fields: [], scalar: field('value', 'DateTime') },
          ],
        }),
      ),
    );
    expect(files.get('src/sales/read-model.types.ts')).toContain('export type At = string;');
  });
});

describe('a type declared in another file is imported from it', () => {
  const address = vo('Address', [field('line', 'string'), field('since', 'DateTime')]);
  const model = ir(
    context('Sales', {
      valueObjects: [
        vo('Price', [field('amount', 'Money'), field('currency', 'Currency')]),
        vo('Currency'),
      ],
      projections: [
        {
          id: 'p-1',
          name: 'OrderView',
          sources: [],
          fields: [field('ships', 'Address'), field('at', 'Stamp')],
        },
      ],
      queries: [
        { id: 'q-1', name: 'GetOrder', reads: ['OrderView'], inputs: [field('price', 'Price')] },
      ],
      aggregates: [
        aggregate('Order', {
          valueObjects: [vo('Stamp', [field('by', 'Customer')])],
          commands: [
            command('PlaceOrder', [field('price', 'Price'), field('to', 'Address')], 'OrderPlaced'),
          ],
          events: [
            event('OrderPlaced', [
              field('price', 'Price'),
              field('stamp', 'Stamp'),
              field('to', 'Address'),
            ]),
          ],
        }),
        aggregate('Customer', {
          valueObjects: [address],
          commands: [command('Register', [field('home', 'Address')], 'OrderPlaced')],
          events: [event('Registered', [field('home', 'Address')])],
        }),
      ],
      sagas: [
        {
          id: 's-1',
          name: 'Fulfilment',
          steps: [],
          events: [event('FulfilmentStarted', [field('to', 'Address'), field('rate', 'Rate')])],
        } as unknown as SagaDefinition,
      ],
    }),
    context('Shipping', {
      aggregates: [
        aggregate('Shipment', {
          identityField: field('id', 'TrackingNumber'),
          valueObjects: [vo('TrackingNumber'), vo('Rate', [field('amount', 'Money')])],
          events: [
            event('Shipped', [
              field('to', 'Address'),
              field('price', 'Price'),
              field('rate', 'Rate'),
            ]),
          ],
        }),
      ],
    }),
  );
  const files = emit(model);

  it('from another aggregate of the context, and from the read model', () => {
    expect(files.get('src/sales/order.types.ts')).toMatch(
      /^import type \{ Address \} from '\.\/customer\.types\.js';\nimport type \{ Price \} from '\.\/read-model\.types\.js';\n\n\/\*\*/,
    );
  });

  it('a type the file declares itself is not imported', () => {
    expect(files.get('src/sales/order.types.ts')).not.toContain('Stamp }');
    expect(files.get('src/sales/customer.types.ts')).not.toContain('import');
  });

  it('the read model imports from the aggregates, and not what it declares', () => {
    expect(files.get('src/sales/read-model.types.ts')).toMatch(
      /^import type \{ Address \} from '\.\/customer\.types\.js';\nimport type \{ Stamp \} from '\.\/order\.types\.js';\n\n/,
    );
  });

  it('from another context, by a path relative to the file, preferring the own context', () => {
    expect(files.get('src/shipping/shipment.types.ts')).toMatch(
      /^import type \{ Address \} from '\.\.\/sales\/customer\.types\.js';\nimport type \{ Price \} from '\.\.\/sales\/read-model\.types\.js';\n\n/,
    );
  });

  it('a process file imports what its events name', () => {
    expect(files.get('src/sales/fulfilment.process.types.ts')).toMatch(
      /^import type \{ Rate \} from '\.\.\/shipping\/shipment\.types\.js';\nimport type \{ Address \} from '\.\/customer\.types\.js';\n\n/,
    );
  });

  it('an aggregate root imports its own types, an emitted event of another aggregate, and its identity type', () => {
    expect(files.get('src/sales/customer.aggregate.ts')).toMatch(
      /^import type \{ Address, Register, Registered \} from '\.\/customer\.types\.js';\nimport type \{ OrderPlaced \} from '\.\/order\.types\.js';\n\n/,
    );
    expect(files.get('src/shipping/shipment.aggregate.ts')).toContain(
      "import type { Rate, Shipped, TrackingNumber } from './shipment.types.js';",
    );
  });

  it('a name no file declares is left as it is, with no import', () => {
    const lone = emit(
      ir(
        context('Solo', {
          aggregates: [aggregate('Thing', { events: [event('Made', [field('x', 'Unknown')])] })],
        }),
      ),
    );
    const types = lone.get('src/solo/thing.types.ts')!;
    expect(types).toContain('  readonly x: Unknown;');
    expect(types).not.toContain('import');
  });

  it('the same model always emits the same imports', () => {
    expect([...emit(model)]).toEqual([...files]);
  });
});

describe('a name declared in more than one file is exported once by each barrel', () => {
  const model = ir(
    context('Ordering', {
      aggregates: [
        aggregate('Order', { valueObjects: [vo('Item'), vo('Address')] }),
        aggregate('Cart', { valueObjects: [vo('Item')] }),
      ],
    }),
    context('Shipping', { aggregates: [aggregate('Order', { valueObjects: [vo('Address')] })] }),
  );
  const files = emit(model);

  it('the context barrel re-exports it from the first file that declares it', () => {
    expect(files.get('src/ordering/index.ts')).toContain(
      [
        "export * from './cart.aggregate.js';",
        '',
        '// Declared in more than one file of the context: exported from the first.',
        "export type { Item } from './order.types.js';",
      ].join('\n'),
    );
  });

  it('a file uses the declaration in its own aggregate before another', () => {
    expect(files.get('src/ordering/cart.aggregate.ts')).toContain(
      "import type { Item } from './cart.types.js';",
    );
  });

  it('the root barrel re-exports it from the first context that declares it', () => {
    expect(files.get('src/index.ts')).toBe(
      [
        "export * from './ordering/index.js';",
        "export * from './shipping/index.js';",
        '',
        '// Declared in more than one context: exported from the first.',
        "export type { Address, OrderAggregate } from './ordering/index.js';",
        '',
      ].join('\n'),
    );
  });

  it('a barrel with no repeated name has no explicit re-export', () => {
    expect(files.get('src/shipping/index.ts')).not.toContain('export type {');
  });
});

describe('at aggregate scope', () => {
  it('the context barrel does not re-export a read model it does not emit', () => {
    const files = emit(
      ir(context('Sales', { valueObjects: [vo('Price')], aggregates: [aggregate('Order')] })),
      { level: 'aggregate', targets: ['Order'] },
    );
    expect(files.has('src/sales/read-model.types.ts')).toBe(false);
    expect(files.get('src/sales/index.ts')).not.toContain('read-model');
  });
});
