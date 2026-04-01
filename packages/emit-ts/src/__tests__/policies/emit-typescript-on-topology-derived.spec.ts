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
  TopologyDerivedHook,
} from '@mmmnt/derive';
import { EmitTypeScriptOnTopologyDerived } from '../../policies/emit-typescript-on-topology-derived.js';

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

describe('EmitTypeScriptOnTopologyDerived', () => {
  const policy = new EmitTypeScriptOnTopologyDerived();

  // Test 1: Topology triggers both TypeScriptEmitter and TestScaffoldEmitter
  it('triggers both TypeScriptEmitter and TestScaffoldEmitter', () => {
    const ir = makeIR();
    const topology = makeTopology();

    const result = policy.execute(ir, topology);

    expect(result.typeScriptOutput).toBeDefined();
    expect(result.typeScriptOutput.result).toBeDefined();
    expect(result.typeScriptOutput.files).toBeInstanceOf(Map);

    expect(result.scaffoldOutput).toBeDefined();
    expect(result.scaffoldOutput.result).toBeDefined();
    expect(result.scaffoldOutput.files).toBeInstanceOf(Map);
  });

  // Test 2: GenerationResult and TestScaffoldResult both produced with correct file counts
  it('produces GenerationResult and TestScaffoldResult with correct file counts', () => {
    const ir = makeIR([
      makeContext({
        name: 'OrderManagement',
        aggregates: [makeAggregate({ name: 'Order' })],
      }),
    ]);
    const topology = makeTopology([makeSuiteDefinition({ flowName: 'Order Fulfillment Flow' })]);

    const result = policy.execute(ir, topology);

    // TypeScriptEmitter produces types, aggregate, and index files per context/aggregate
    // For 1 context with 1 aggregate: types.ts + aggregate.ts + index.ts = 3 files
    expect(result.typeScriptOutput.result.filesWritten).toHaveLength(3);
    expect(result.typeScriptOutput.files.size).toBe(3);

    // TestScaffoldEmitter produces 1 flow spec + 1 aggregate spec = 2 files
    expect(result.scaffoldOutput.result.specFilesWritten).toHaveLength(2);
    expect(result.scaffoldOutput.files.size).toBe(2);
  });

  // Test 3: Empty IR + empty topology → empty results from both emitters
  it('returns empty results for empty IR and empty topology', () => {
    const ir = makeIR([]);
    const topology = makeTopology([]);

    const result = policy.execute(ir, topology);

    expect(result.typeScriptOutput.result.filesWritten).toHaveLength(0);
    expect(result.typeScriptOutput.files.size).toBe(0);

    expect(result.scaffoldOutput.result.specFilesWritten).toHaveLength(0);
    expect(result.scaffoldOutput.files.size).toBe(0);
    expect(result.scaffoldOutput.result.scenariosGenerated).toBe(0);
  });

  // Test 4: Works as a hook from DeriveOnSpecificationParsed (callable interface)
  it('works as a TopologyDerivedHook callback via handle method', () => {
    const ir = makeIR();
    const topology = makeTopology();

    // Type-safe: policy.handle conforms to TopologyDerivedHook signature
    const hook: TopologyDerivedHook = policy.handle.bind(policy);

    // Invoke as DeriveOnSpecificationParsed would — no errors
    expect(() => hook(topology, ir)).not.toThrow();

    // Verify execute still produces correct results
    const result = policy.execute(ir, topology);
    expect(result.typeScriptOutput.result.filesWritten.length).toBeGreaterThan(0);
    expect(result.scaffoldOutput.result.specFilesWritten.length).toBeGreaterThan(0);
  });

  // Test 5: TypeScript output uses system-level scope
  it('emits TypeScript with system-level scope', () => {
    const ir = makeIR([
      makeContext({ name: 'Sales', aggregates: [makeAggregate({ name: 'Order' })] }),
      makeContext({
        id: 'ctx-2',
        name: 'Shipping',
        aggregates: [
          makeAggregate({
            id: 'agg-2',
            name: 'Shipment',
            commands: [makeCommand({ name: 'DispatchShipment' })],
            events: [makeEvent({ name: 'ShipmentDispatched' })],
          }),
        ],
      }),
    ]);
    const topology = makeTopology([]);

    const result = policy.execute(ir, topology);

    // System-level scope should include all contexts
    const filePaths = result.typeScriptOutput.result.filesWritten;
    const salesFiles = filePaths.filter((f) => f.includes('sales'));
    const shippingFiles = filePaths.filter((f) => f.includes('shipping'));
    expect(salesFiles.length).toBeGreaterThan(0);
    expect(shippingFiles.length).toBeGreaterThan(0);
  });
});
