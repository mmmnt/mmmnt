import { describe, it, expect } from 'vitest';
import type {
  IntermediateRepresentation,
  ContextDefinition,
  AggregateDefinition,
  CommandDefinition,
  EventDefinition,
  FieldDefinition,
  InvariantDefinition,
} from '@mmmnt/core';
import type {
  TestSuiteTopology,
  TestSuiteDefinition,
  TestCaseDefinition,
  AssertionPoint,
  SetupStep,
  TopologyMetadata,
  PayloadValidationStep,
  FieldConstraint,
} from '@mmmnt/derive';
import { TestScaffoldEmitter } from '../../services/test-scaffold-emitter.js';

function makeField(overrides: Partial<FieldDefinition> = {}): FieldDefinition {
  return {
    name: 'value',
    type: 'string',
    isArray: false,
    required: true,
    ...overrides,
  };
}

function makeFieldConstraint(overrides: Partial<FieldConstraint> = {}): FieldConstraint {
  return {
    fieldName: 'orderId',
    expectedType: 'string',
    required: true,
    ...overrides,
  };
}

function makePayloadValidationStep(
  overrides: Partial<PayloadValidationStep> = {},
): PayloadValidationStep {
  return {
    eventType: 'OrderPlaced',
    expectedFields: [makeFieldConstraint()],
    ...overrides,
  };
}

function makeSetupStep(overrides: Partial<SetupStep> = {}): SetupStep {
  return {
    contextName: 'OrderManagement',
    aggregateName: 'Order',
    precondition: 'Order must exist',
    ...overrides,
  };
}

function makeAssertionPoint(overrides: Partial<AssertionPoint> = {}): AssertionPoint {
  return {
    crossingId: 'crossing-1',
    sourceContext: 'OrderManagement',
    targetContext: 'Shipping',
    schemaContract: makePayloadValidationStep(),
    assertionType: 'payload',
    ...overrides,
  };
}

function makeTestCase(overrides: Partial<TestCaseDefinition> = {}): TestCaseDefinition {
  return {
    momentId: 'moment-1',
    momentName: 'Order Placement',
    assertions: [makeAssertionPoint()],
    setupSteps: [makeSetupStep()],
    ...overrides,
  };
}

function makeSuiteDefinition(overrides: Partial<TestSuiteDefinition> = {}): TestSuiteDefinition {
  return {
    flowId: 'flow-1',
    flowName: 'Order Fulfillment Flow',
    testCases: [makeTestCase()],
    contextsCovered: ['OrderManagement', 'Shipping'],
    ...overrides,
  };
}

function makeTopologyMetadata(overrides: Partial<TopologyMetadata> = {}): TopologyMetadata {
  return {
    sourceIrHash: 'abc123',
    derivedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeTopology(suites: TestSuiteDefinition[] = [makeSuiteDefinition()]): TestSuiteTopology {
  return {
    suites,
    metadata: makeTopologyMetadata(),
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

function makeInvariant(overrides: Partial<InvariantDefinition> = {}): InvariantDefinition {
  return {
    id: 'inv-1',
    description: 'Order total must be positive',
    scope: 'aggregate',
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
    valueObjects: [],
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

describe('TestScaffoldEmitter', () => {
  const emitter = new TestScaffoldEmitter();

  // Test 1: TG-03 — every flow in topology produces a .spec.ts file
  it('TG-03: every flow in topology produces a .spec.ts file', () => {
    const topology = makeTopology([
      makeSuiteDefinition({ flowId: 'flow-1', flowName: 'Order Fulfillment Flow' }),
      makeSuiteDefinition({ flowId: 'flow-2', flowName: 'Return Processing Flow' }),
    ]);
    const ir = makeIR();
    const output = emitter.emit(ir, topology);

    const flowSpecFiles = output.result.specFilesWritten.filter((f) =>
      f.startsWith('__tests__/flows/'),
    );
    expect(flowSpecFiles).toHaveLength(2);
    expect(flowSpecFiles).toContain('__tests__/flows/order-fulfillment-flow.spec.ts');
    expect(flowSpecFiles).toContain('__tests__/flows/return-processing-flow.spec.ts');
  });

  // Test 2: per-aggregate unit test scaffold with describe block
  it('per-aggregate unit test scaffold with describe block', () => {
    const ir = makeIR([makeContext({ aggregates: [makeAggregate({ name: 'Order' })] })]);
    const topology = makeTopology([]);
    const output = emitter.emit(ir, topology);

    const aggSpec = output.files.get('__tests__/order-management/order.spec.ts');
    expect(aggSpec).toBeDefined();
    expect(aggSpec).toContain("describe('Order', () => {");
  });

  // Test 3: per-flow integration test scaffold with describe/it
  it('per-flow integration test scaffold with describe/it', () => {
    const topology = makeTopology([
      makeSuiteDefinition({
        flowName: 'Order Fulfillment Flow',
        testCases: [
          makeTestCase({
            momentName: 'Order Placement',
            assertions: [makeAssertionPoint()],
          }),
        ],
      }),
    ]);
    const ir = makeIR();
    const output = emitter.emit(ir, topology);

    const flowSpec = output.files.get('__tests__/flows/order-fulfillment-flow.spec.ts');
    expect(flowSpec).toBeDefined();
    expect(flowSpec).toContain("describe('Order Fulfillment Flow', () => {");
    expect(flowSpec).toContain("describe('Order Placement', () => {");
    expect(flowSpec).toContain("it('should verify");
  });

  // Test 4: per-crossing contract test scaffold with assertion point info
  it('per-crossing contract test scaffold includes assertion point info', () => {
    const assertion = makeAssertionPoint({
      crossingId: 'xing-42',
      sourceContext: 'Ordering',
      targetContext: 'Fulfillment',
      schemaContract: makePayloadValidationStep({
        eventType: 'OrderShipped',
        expectedFields: [
          makeFieldConstraint({
            fieldName: 'trackingNumber',
            expectedType: 'string',
            required: true,
          }),
        ],
      }),
    });
    const topology = makeTopology([
      makeSuiteDefinition({
        testCases: [makeTestCase({ assertions: [assertion] })],
      }),
    ]);
    const ir = makeIR();
    const output = emitter.emit(ir, topology);

    const flowSpec = output.files.get('__tests__/flows/order-fulfillment-flow.spec.ts');
    expect(flowSpec).toBeDefined();
    expect(flowSpec).toContain('should verify OrderShipped crosses from Ordering to Fulfillment');
    expect(flowSpec).toContain('// Crossing: xing-42');
    expect(flowSpec).toContain('trackingNumber: string (required)');
  });

  // Test 5: beforeEach blocks from setup steps
  it('beforeEach blocks generated from setup steps', () => {
    const setupSteps: SetupStep[] = [
      makeSetupStep({
        contextName: 'Ordering',
        aggregateName: 'Order',
        precondition: 'Order must be in draft state',
      }),
      makeSetupStep({
        contextName: 'Inventory',
        aggregateName: 'Stock',
        precondition: 'Stock must be available',
      }),
    ];
    const topology = makeTopology([
      makeSuiteDefinition({
        testCases: [makeTestCase({ setupSteps })],
      }),
    ]);
    const ir = makeIR();
    const output = emitter.emit(ir, topology);

    const flowSpec = output.files.get('__tests__/flows/order-fulfillment-flow.spec.ts');
    expect(flowSpec).toBeDefined();
    expect(flowSpec).toContain('beforeEach(() => {');
    expect(flowSpec).toContain('// Setup: Ordering.Order');
    expect(flowSpec).toContain('Order must be in draft state');
    expect(flowSpec).toContain('// Setup: Inventory.Stock');
    expect(flowSpec).toContain('Stock must be available');
  });

  // Test 6: invariant violation test case placeholders
  it('invariant violation test case placeholders generated', () => {
    const aggregate = makeAggregate({
      name: 'Order',
      invariants: [
        makeInvariant({ description: 'Order total must be positive' }),
        makeInvariant({ id: 'inv-2', description: 'Line items cannot be empty' }),
      ],
    });
    const ir = makeIR([makeContext({ aggregates: [aggregate] })]);
    const topology = makeTopology([]);
    const output = emitter.emit(ir, topology);

    const aggSpec = output.files.get('__tests__/order-management/order.spec.ts');
    expect(aggSpec).toBeDefined();
    expect(aggSpec).toContain('should enforce invariant: Order total must be positive');
    expect(aggSpec).toContain('should enforce invariant: Line items cannot be empty');
    expect(aggSpec).toContain('// TODO: implement invariant violation test');
  });

  // Test 7: empty topology produces no flow spec files
  it('empty topology produces no flow spec files', () => {
    const topology = makeTopology([]);
    const ir = makeIR([]);
    const output = emitter.emit(ir, topology);

    expect(output.result.specFilesWritten).toEqual([]);
    expect(output.files.size).toBe(0);
  });

  // Test 8: multiple flows produce multiple spec files
  it('multiple flows produce multiple spec files', () => {
    const topology = makeTopology([
      makeSuiteDefinition({ flowId: 'f1', flowName: 'Flow Alpha' }),
      makeSuiteDefinition({ flowId: 'f2', flowName: 'Flow Beta' }),
      makeSuiteDefinition({ flowId: 'f3', flowName: 'Flow Gamma' }),
    ]);
    const ir = makeIR([]);
    const output = emitter.emit(ir, topology);

    const flowFiles = output.result.specFilesWritten.filter((f) =>
      f.startsWith('__tests__/flows/'),
    );
    expect(flowFiles).toHaveLength(3);
    expect(output.files.size).toBe(3);
  });

  // Test 9: describe blocks organized by aggregate name
  it('describe blocks organized by aggregate name', () => {
    const ir = makeIR([
      makeContext({
        name: 'Sales',
        aggregates: [
          makeAggregate({ name: 'Order' }),
          makeAggregate({ id: 'agg-2', name: 'Invoice' }),
        ],
      }),
    ]);
    const topology = makeTopology([]);
    const output = emitter.emit(ir, topology);

    const orderSpec = output.files.get('__tests__/sales/order.spec.ts');
    const invoiceSpec = output.files.get('__tests__/sales/invoice.spec.ts');
    expect(orderSpec).toBeDefined();
    expect(invoiceSpec).toBeDefined();
    expect(orderSpec).toContain("describe('Order', () => {");
    expect(invoiceSpec).toContain("describe('Invoice', () => {");
  });

  // Test 10: it blocks for each behavioral scenario (command)
  it('it blocks for each behavioral scenario', () => {
    const aggregate = makeAggregate({
      commands: [
        makeCommand({ name: 'CreateOrder' }),
        makeCommand({ id: 'cmd-2', name: 'CancelOrder', emitsEvent: 'OrderCancelled' }),
      ],
    });
    const ir = makeIR([makeContext({ aggregates: [aggregate] })]);
    const topology = makeTopology([]);
    const output = emitter.emit(ir, topology);

    const aggSpec = output.files.get('__tests__/order-management/order.spec.ts');
    expect(aggSpec).toBeDefined();
    expect(aggSpec).toContain('should handle CreateOrder');
    expect(aggSpec).toContain('should handle CancelOrder');
  });

  // Test 11: generated output is valid TypeScript syntax
  it('generated output is valid TypeScript syntax', () => {
    const topology = makeTopology([
      makeSuiteDefinition({
        testCases: [
          makeTestCase({
            assertions: [makeAssertionPoint()],
            setupSteps: [makeSetupStep()],
          }),
        ],
      }),
    ]);
    const ir = makeIR();
    const output = emitter.emit(ir, topology);

    for (const [path, content] of output.files) {
      expect(path).toMatch(/\.spec\.ts$/);
      // Verify structural correctness: balanced braces, proper imports
      expect(content).toContain('import {');
      expect(content).toContain("} from 'vitest';");
      // Balanced braces
      const openBraces = (content.match(/\{/g) ?? []).length;
      const closeBraces = (content.match(/\}/g) ?? []).length;
      expect(openBraces).toBe(closeBraces);
      // Balanced parens
      const openParens = (content.match(/\(/g) ?? []).length;
      const closeParens = (content.match(/\)/g) ?? []).length;
      expect(openParens).toBe(closeParens);
    }
  });

  // Test 12: TestScaffoldResult includes specFilesWritten and scenariosGenerated counts
  it('TestScaffoldResult includes specFilesWritten and scenariosGenerated counts', () => {
    const topology = makeTopology([
      makeSuiteDefinition({
        testCases: [
          makeTestCase({
            assertions: [makeAssertionPoint(), makeAssertionPoint({ crossingId: 'c2' })],
          }),
          makeTestCase({
            momentId: 'f2',
            momentName: 'Shipping',
            assertions: [makeAssertionPoint({ crossingId: 'c3' })],
          }),
        ],
      }),
    ]);
    const aggregate = makeAggregate({
      commands: [makeCommand(), makeCommand({ id: 'cmd-2', name: 'ShipOrder' })],
      invariants: [makeInvariant()],
    });
    const ir = makeIR([makeContext({ aggregates: [aggregate] })]);
    const output = emitter.emit(ir, topology);

    // 3 assertions from flow + 2 commands + 1 invariant = 6 scenarios
    expect(output.result.scenariosGenerated).toBe(6);
    // 1 flow spec + 1 aggregate spec = 2 files
    expect(output.result.specFilesWritten).toHaveLength(2);
  });

  // Test 13: flow spec files use vitest imports including beforeEach
  it('flow spec files use vitest imports including beforeEach', () => {
    const topology = makeTopology();
    const ir = makeIR();
    const output = emitter.emit(ir, topology);

    const flowSpec = output.files.get('__tests__/flows/order-fulfillment-flow.spec.ts');
    expect(flowSpec).toBeDefined();
    expect(flowSpec).toContain("import { describe, it, beforeEach, expect } from 'vitest';");
  });

  // Test 14: aggregate spec files import describe, it, expect from vitest
  it('aggregate spec files import describe, it, expect from vitest', () => {
    const ir = makeIR();
    const topology = makeTopology([]);
    const output = emitter.emit(ir, topology);

    const aggSpec = output.files.get('__tests__/order-management/order.spec.ts');
    expect(aggSpec).toBeDefined();
    expect(aggSpec).toContain("import { describe, it, expect } from 'vitest';");
  });

  // Test 15: test case without setup steps omits beforeEach
  it('test case without setup steps omits beforeEach block', () => {
    const topology = makeTopology([
      makeSuiteDefinition({
        testCases: [makeTestCase({ setupSteps: [], assertions: [makeAssertionPoint()] })],
      }),
    ]);
    const ir = makeIR([]);
    const output = emitter.emit(ir, topology);

    const flowSpec = output.files.get('__tests__/flows/order-fulfillment-flow.spec.ts');
    expect(flowSpec).toBeDefined();
    expect(flowSpec).not.toContain('beforeEach');
  });
});
