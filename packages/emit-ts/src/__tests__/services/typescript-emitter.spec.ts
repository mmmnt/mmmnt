import { describe, it, expect } from 'vitest';
import type {
  IntermediateRepresentation,
  ContextDefinition,
  AggregateDefinition,
  ValueObjectDefinition,
  CommandDefinition,
  EventDefinition,
  FieldDefinition,
} from '@mmmnt/core';
import { TypeScriptEmitter } from '../../services/typescript-emitter.js';
import type { EmitOptions } from '../../services/typescript-emitter.js';

function makeField(overrides: Partial<FieldDefinition> = {}): FieldDefinition {
  return {
    name: 'value',
    type: 'string',
    isArray: false,
    required: true,
    ...overrides,
  };
}

function makeValueObject(overrides: Partial<ValueObjectDefinition> = {}): ValueObjectDefinition {
  return {
    id: 'vo-1',
    name: 'EmailAddress',
    fields: [makeField({ name: 'address', type: 'string' })],
    ...overrides,
  };
}

function makeCommand(overrides: Partial<CommandDefinition> = {}): CommandDefinition {
  return {
    id: 'cmd-1',
    name: 'CreateOrder',
    inputs: [makeField({ name: 'orderId', type: 'uuid' })],
    preconditions: [],
    emitsEvent: 'OrderCreated',
    ...overrides,
  };
}

function makeEvent(overrides: Partial<EventDefinition> = {}): EventDefinition {
  return {
    id: 'evt-1',
    name: 'OrderCreated',
    fields: [makeField({ name: 'orderId', type: 'uuid' })],
    ...overrides,
  };
}

function makeAggregate(overrides: Partial<AggregateDefinition> = {}): AggregateDefinition {
  return {
    id: 'agg-1',
    name: 'Order',
    identityField: makeField({ name: 'orderId', type: 'uuid' }),
    commands: [makeCommand()],
    events: [makeEvent()],
    valueObjects: [makeValueObject()],
    invariants: [],
    ...overrides,
  };
}

function makeContext(overrides: Partial<ContextDefinition> = {}): ContextDefinition {
  return {
    id: 'ctx-1',
    name: 'OrderManagement',
    aggregates: [makeAggregate()],
    domainServices: [],
    commands: [],
    events: [],
    policies: [],
    sagas: [],
    valueObjects: [],
    invariants: [],
    ...overrides,
  };
}

function makeIR(contexts: ContextDefinition[] = [makeContext()]): IntermediateRepresentation {
  return {
    contexts,
    flows: [],
    glossary: [],
    relationships: [],
    metadata: {
      name: 'TestSpec',
      version: '1.0.0',
    },
  };
}

function defaultOptions(overrides: Partial<EmitOptions> = {}): EmitOptions {
  return {
    scope: { level: 'system' },
    ...overrides,
  };
}

describe('TypeScriptEmitter', () => {
  const emitter = new TypeScriptEmitter();

  // Test 1: TG-01 — emitted interface names match IR names exactly
  it('TG-01: emitted interface names match IR context/aggregate/VO names exactly', () => {
    const ir = makeIR();
    const output = emitter.emit(ir, defaultOptions());

    const typesContent = output.files.get('src/order-management/order.types.ts');
    expect(typesContent).toBeDefined();
    expect(typesContent).toContain('export interface EmailAddress {');
    expect(typesContent).toContain('export interface CreateOrder {');
    expect(typesContent).toContain('export interface OrderCreated {');
  });

  // Test 2: TG-02 — deterministic output
  it('TG-02: calling emit twice with same IR produces identical output', () => {
    const ir = makeIR();
    const opts = defaultOptions();

    const output1 = emitter.emit(ir, opts);
    const output2 = emitter.emit(ir, opts);

    expect(output1.result).toEqual(output2.result);
    expect([...output1.files.entries()]).toEqual([...output2.files.entries()]);
  });

  // Test 3: TG-04 — all value object fields are readonly
  it('TG-04: all value object interfaces have readonly on every field', () => {
    const vo = makeValueObject({
      fields: [
        makeField({ name: 'street', type: 'string' }),
        makeField({ name: 'city', type: 'string' }),
        makeField({ name: 'zip', type: 'string' }),
      ],
    });
    const ir = makeIR([
      makeContext({
        aggregates: [makeAggregate({ valueObjects: [vo] })],
      }),
    ]);
    const output = emitter.emit(ir, defaultOptions());

    const typesContent = output.files.get('src/order-management/order.types.ts');
    expect(typesContent).toBeDefined();
    const lines = typesContent!.split('\n');
    const fieldLines = lines.filter((l) => l.trim().startsWith('readonly ') && l.includes(':'));
    // All 3 VO fields + command fields + event fields should be readonly
    expect(fieldLines.length).toBeGreaterThanOrEqual(3);
    for (const line of fieldLines) {
      expect(line.trim()).toMatch(/^readonly /);
    }
  });

  // Test 4: TG-05 — dryRun=true returns result with dryRun=true
  it('TG-05: dryRun=true returns result with dryRun=true and same file list', () => {
    const ir = makeIR();
    const output = emitter.emit(ir, defaultOptions({ dryRun: true }));

    expect(output.result.dryRun).toBe(true);
    expect(output.result.filesWritten.length).toBeGreaterThan(0);
    expect(output.files.size).toBeGreaterThan(0);
  });

  // Test 5: per-aggregate .types.ts includes value object interfaces
  it('per-aggregate .types.ts includes value object interfaces', () => {
    const ir = makeIR();
    const output = emitter.emit(ir, defaultOptions());

    const typesContent = output.files.get('src/order-management/order.types.ts');
    expect(typesContent).toBeDefined();
    expect(typesContent).toContain('export interface EmailAddress {');
    expect(typesContent).toContain('readonly address: string;');
  });

  // Test 6: per-aggregate .aggregate.ts includes aggregate interface
  it('per-aggregate .aggregate.ts includes aggregate interface with command handler methods', () => {
    const ir = makeIR();
    const output = emitter.emit(ir, defaultOptions());

    const aggContent = output.files.get('src/order-management/order.aggregate.ts');
    expect(aggContent).toBeDefined();
    expect(aggContent).toContain('export interface OrderAggregate {');
    expect(aggContent).toContain('CreateOrder');
    expect(aggContent).toContain('OrderCreated');
  });

  // Test 7: per-context index.ts re-exports all aggregates
  it('per-context index.ts re-exports all aggregates', () => {
    const ir = makeIR();
    const output = emitter.emit(ir, defaultOptions());

    const indexContent = output.files.get('src/order-management/index.ts');
    expect(indexContent).toBeDefined();
    expect(indexContent).toContain("export * from './order.types.js';");
    expect(indexContent).toContain("export * from './order.aggregate.js';");
  });

  // Test 8: JSDoc comments generated for aggregates
  it('JSDoc comments generated for aggregates', () => {
    const ir = makeIR();
    const output = emitter.emit(ir, defaultOptions());

    const typesContent = output.files.get('src/order-management/order.types.ts');
    expect(typesContent).toBeDefined();
    expect(typesContent).toContain('/**');
    expect(typesContent).toContain('* Types for the Order aggregate.');
    expect(typesContent).toContain('*/');

    const aggContent = output.files.get('src/order-management/order.aggregate.ts');
    expect(aggContent).toBeDefined();
    expect(aggContent).toContain('* Aggregate root for Order.');
  });

  // Test 9: value objects with fields emit correct interfaces
  it('value objects with fields emit correct interfaces', () => {
    const enumVO = makeValueObject({
      name: 'OrderStatus',
      fields: [makeField({ name: 'status', type: 'string' })],
    });
    const ir = makeIR([
      makeContext({
        aggregates: [makeAggregate({ valueObjects: [enumVO] })],
      }),
    ]);
    const output = emitter.emit(ir, defaultOptions());

    const typesContent = output.files.get('src/order-management/order.types.ts');
    expect(typesContent).toBeDefined();
    expect(typesContent).toContain('export interface OrderStatus {');
  });

  // Test 10: output path follows convention src/{kebab-context}/{kebab-aggregate}.types.ts
  it('output path: src/{kebab-context}/{kebab-aggregate}.types.ts', () => {
    const ir = makeIR([
      makeContext({
        name: 'InventoryControl',
        aggregates: [
          makeAggregate({
            name: 'StockItem',
          }),
        ],
      }),
    ]);
    const output = emitter.emit(ir, defaultOptions());

    expect(output.result.filesWritten).toContain('src/inventory-control/stock-item.types.ts');
    expect(output.result.filesWritten).toContain('src/inventory-control/stock-item.aggregate.ts');
    expect(output.result.filesWritten).toContain('src/inventory-control/index.ts');
  });

  // Test 11: empty IR → no files generated
  it('empty IR (no contexts) produces no files and empty result', () => {
    const ir = makeIR([]);
    const output = emitter.emit(ir, defaultOptions());

    expect(output.result.filesWritten).toEqual([]);
    expect(output.result.filesUnchanged).toEqual([]);
    expect(output.result.filesRemoved).toEqual([]);
    expect(output.files.size).toBe(0);
  });

  // Test 12: IR with multiple contexts → files organized by context directory
  it('IR with multiple contexts generates files organized by context directory', () => {
    const ir = makeIR([
      makeContext({
        id: 'ctx-1',
        name: 'OrderManagement',
        aggregates: [makeAggregate({ name: 'Order' })],
      }),
      makeContext({
        id: 'ctx-2',
        name: 'Shipping',
        aggregates: [
          makeAggregate({
            id: 'agg-2',
            name: 'Shipment',
          }),
        ],
      }),
    ]);
    const output = emitter.emit(ir, defaultOptions());

    const paths = output.result.filesWritten;
    const orderPaths = paths.filter((p) => p.startsWith('src/order-management/'));
    const shippingPaths = paths.filter((p) => p.startsWith('src/shipping/'));

    expect(orderPaths.length).toBeGreaterThan(0);
    expect(shippingPaths.length).toBeGreaterThan(0);
  });

  // Test 13: value object fields in emitted code are all readonly
  it('value object fields in emitted code are all readonly', () => {
    const vo = makeValueObject({
      name: 'Money',
      fields: [
        makeField({ name: 'amount', type: 'number' }),
        makeField({ name: 'currency', type: 'string' }),
      ],
    });
    const ir = makeIR([
      makeContext({
        aggregates: [makeAggregate({ valueObjects: [vo], commands: [], events: [] })],
      }),
    ]);
    const output = emitter.emit(ir, defaultOptions());

    const typesContent = output.files.get('src/order-management/order.types.ts');
    expect(typesContent).toBeDefined();
    expect(typesContent).toContain('readonly amount: number;');
    expect(typesContent).toContain('readonly currency: string;');
  });

  // Test 14: command handler methods have correct parameter types
  it('command handler methods have correct parameter types', () => {
    const ir = makeIR();
    const output = emitter.emit(ir, defaultOptions());

    const aggContent = output.files.get('src/order-management/order.aggregate.ts');
    expect(aggContent).toBeDefined();
    expect(aggContent).toContain('createOrder(command: CreateOrder): OrderCreated;');
  });

  // Test 15: GenerationResult.filesWritten count matches generated file count
  it('GenerationResult.filesWritten count matches generated file count', () => {
    const ir = makeIR();
    const output = emitter.emit(ir, defaultOptions());

    expect(output.result.filesWritten.length).toBe(output.files.size);
  });

  // Test 16: scope filtering — level='context' with targets → only matching contexts
  it('scope filtering: level=context with targets only emits matching contexts', () => {
    const ir = makeIR([
      makeContext({
        id: 'ctx-1',
        name: 'OrderManagement',
        aggregates: [makeAggregate({ name: 'Order' })],
      }),
      makeContext({
        id: 'ctx-2',
        name: 'Shipping',
        aggregates: [makeAggregate({ id: 'agg-2', name: 'Shipment' })],
      }),
    ]);
    const output = emitter.emit(ir, {
      scope: { level: 'context', targets: ['Shipping'] },
    });

    const paths = output.result.filesWritten;
    // All context-specific files should be under src/shipping/; the root barrel src/index.ts is also emitted
    expect(paths.every((p) => p.startsWith('src/shipping/') || p === 'src/index.ts')).toBe(true);
    expect(paths.some((p) => p.startsWith('src/order-management/'))).toBe(false);
  });

  // Test 17: dryRun defaults to false when not specified
  it('dryRun defaults to false when not specified', () => {
    const ir = makeIR();
    const output = emitter.emit(ir, defaultOptions());

    expect(output.result.dryRun).toBe(false);
  });

  // Test 18: aggregate file imports types from .types.ts
  it('aggregate file imports types from corresponding .types.ts', () => {
    const ir = makeIR();
    const output = emitter.emit(ir, defaultOptions());

    const aggContent = output.files.get('src/order-management/order.aggregate.ts');
    expect(aggContent).toBeDefined();
    expect(aggContent).toContain(
      "import type { CreateOrder, EmailAddress, OrderCreated } from './order.types.js';",
    );
  });

  // Test 19: optional fields are marked with ?
  it('optional fields are marked with ? in generated interfaces', () => {
    const vo = makeValueObject({
      name: 'Address',
      fields: [
        makeField({ name: 'street', type: 'string', required: true }),
        makeField({ name: 'apt', type: 'string', required: false }),
      ],
    });
    const ir = makeIR([
      makeContext({
        aggregates: [makeAggregate({ valueObjects: [vo], commands: [], events: [] })],
      }),
    ]);
    const output = emitter.emit(ir, defaultOptions());

    const typesContent = output.files.get('src/order-management/order.types.ts');
    expect(typesContent).toBeDefined();
    expect(typesContent).toContain('readonly street: string;');
    expect(typesContent).toContain('readonly apt?: string;');
  });

  // Test 20: array fields are typed correctly
  it('array fields use readonly array syntax', () => {
    const vo = makeValueObject({
      name: 'LineItems',
      fields: [
        makeField({
          name: 'items',
          type: 'string',
          isArray: true,
        }),
      ],
    });
    const ir = makeIR([
      makeContext({
        aggregates: [makeAggregate({ valueObjects: [vo], commands: [], events: [] })],
      }),
    ]);
    const output = emitter.emit(ir, defaultOptions());

    const typesContent = output.files.get('src/order-management/order.types.ts');
    expect(typesContent).toBeDefined();
    expect(typesContent).toContain('readonly items: readonly string[];');
  });

  // Test 21: aggregate identity field is included in aggregate interface
  it('aggregate identity field is included as readonly in aggregate interface', () => {
    const ir = makeIR();
    const output = emitter.emit(ir, defaultOptions());

    const aggContent = output.files.get('src/order-management/order.aggregate.ts');
    expect(aggContent).toBeDefined();
    expect(aggContent).toContain('readonly orderId: string;');
  });

  // Test 22: scope level='context' without targets includes all contexts
  it('scope level=context without targets includes all contexts', () => {
    const ir = makeIR([
      makeContext({ name: 'Ordering' }),
      makeContext({
        id: 'ctx-2',
        name: 'Shipping',
        aggregates: [makeAggregate({ name: 'Shipment' })],
      }),
    ]);
    const output = emitter.emit(ir, { scope: { level: 'context' } });

    expect(output.result.filesWritten.length).toBeGreaterThanOrEqual(4);
  });

  // Test 23: scope level='aggregate' with targets filters to matching aggregates
  it('scope level=aggregate with targets filters to matching aggregates only', () => {
    const ir = makeIR([
      makeContext({
        aggregates: [
          makeAggregate({ name: 'Order' }),
          makeAggregate({ id: 'agg-2', name: 'Invoice' }),
        ],
      }),
    ]);
    const output = emitter.emit(ir, { scope: { level: 'aggregate', targets: ['Order'] } });

    const paths = output.result.filesWritten;
    expect(paths.some((p) => p.includes('order.'))).toBe(true);
    expect(paths.some((p) => p.includes('invoice.'))).toBe(false);
  });
});
