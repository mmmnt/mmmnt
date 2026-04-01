import { describe, it, expect } from 'vitest';
import type {
  IntermediateRepresentation,
  ContextDefinition,
  AggregateDefinition,
  CommandDefinition,
  EventDefinition,
  FieldDefinition,
  InvariantDefinition,
  FlowDefinition,
  MomentDefinition,
  ConnectionDefinition,
  SchemaContract,
} from '@mmmnt/core';
import type { TestSuiteTopology } from '@mmmnt/derive';
import { DeriveOnSpecificationParsed } from '@mmmnt/derive';
import type { GenerationManifest } from '@mmmnt/generate';
import { GenerateGherkinOnTopologyDerived } from '@mmmnt/generate';
import {
  EmitTypeScriptOnTopologyDerived,
  type EmitTypeScriptResult,
} from '../../policies/emit-typescript-on-topology-derived.js';

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

function makeField(overrides: Partial<FieldDefinition> = {}): FieldDefinition {
  return { name: 'value', type: 'string', isArray: false, required: true, ...overrides };
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

function makeSchemaContract(overrides: Partial<SchemaContract> = {}): SchemaContract {
  return {
    eventType: 'OrderPlaced',
    fields: [{ name: 'orderId', type: 'string', required: true }],
    relationshipType: 'publishes',
    ...overrides,
  };
}

function makeCrossingConnection(
  overrides: Partial<ConnectionDefinition & { connectionType: 'crosses-to' }> = {},
): ConnectionDefinition {
  return {
    id: 'conn-1',
    sourceMomentId: 'moment-1',
    targetContextId: 'ctx-2',
    eventId: 'evt-1',
    connectionType: 'crosses-to' as const,
    schemaContract: makeSchemaContract(),
    ...overrides,
  };
}

function makeMoment(overrides: Partial<MomentDefinition> = {}): MomentDefinition {
  return {
    id: 'moment-1',
    name: 'Order Placement',
    contextEntries: [{ contextId: 'ctx-1', nodeName: 'CreateOrder', nodeKind: 'command' }],
    ...overrides,
  };
}

function makeFlow(overrides: Partial<FlowDefinition> = {}): FlowDefinition {
  return {
    id: 'flow-1',
    name: 'Order Fulfillment Flow',
    moments: [makeMoment()],
    connections: [makeCrossingConnection()],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Minimal IR fixture: two contexts, multiple aggregates, single flow with crossing connection
// ---------------------------------------------------------------------------
function buildMinimalIR(): IntermediateRepresentation {
  const ctx = makeContext({
    id: 'ctx-order',
    name: 'OrderManagement',
    aggregates: [makeAggregate({ id: 'agg-order', name: 'Order' })],
  });
  const ctx2 = makeContext({
    id: 'ctx-shipping',
    name: 'Shipping',
    aggregates: [
      makeAggregate({
        id: 'agg-shipment',
        name: 'Shipment',
        commands: [
          makeCommand({
            id: 'cmd-dispatch',
            name: 'DispatchShipment',
            emitsEvent: 'ShipmentDispatched',
          }),
        ],
        events: [makeEvent({ id: 'evt-dispatched', name: 'ShipmentDispatched' })],
      }),
    ],
  });

  const flow = makeFlow({
    id: 'flow-order',
    name: 'Order Fulfillment',
    moments: [
      makeMoment({
        id: 'moment-order',
        name: 'Place Order',
        contextEntries: [{ contextId: 'ctx-order', nodeName: 'CreateOrder', nodeKind: 'command' }],
      }),
    ],
    connections: [
      makeCrossingConnection({
        id: 'conn-order-shipping',
        sourceMomentId: 'moment-order',
        targetContextId: 'ctx-shipping',
        schemaContract: makeSchemaContract({ eventType: 'OrderPlaced' }),
      }),
    ],
  });

  return {
    contexts: [ctx, ctx2],
    flows: [flow],
    glossary: [],
    relationships: [],
    metadata: { name: 'MinimalSpec', version: '1.0.0' },
  };
}

// ---------------------------------------------------------------------------
// Multi-context IR fixture: 3 contexts, 2 flows with crossings
// ---------------------------------------------------------------------------
function buildMultiContextIR(): IntermediateRepresentation {
  const ctxSales = makeContext({
    id: 'ctx-sales',
    name: 'Sales',
    aggregates: [makeAggregate({ id: 'agg-sale', name: 'Sale' })],
  });
  const ctxInventory = makeContext({
    id: 'ctx-inventory',
    name: 'Inventory',
    aggregates: [
      makeAggregate({
        id: 'agg-stock',
        name: 'Stock',
        commands: [
          makeCommand({ id: 'cmd-reserve', name: 'ReserveStock', emitsEvent: 'StockReserved' }),
        ],
        events: [makeEvent({ id: 'evt-reserved', name: 'StockReserved' })],
      }),
    ],
  });
  const ctxFulfillment = makeContext({
    id: 'ctx-fulfillment',
    name: 'Fulfillment',
    aggregates: [
      makeAggregate({
        id: 'agg-delivery',
        name: 'Delivery',
        commands: [
          makeCommand({ id: 'cmd-ship', name: 'ShipDelivery', emitsEvent: 'DeliveryShipped' }),
        ],
        events: [makeEvent({ id: 'evt-shipped', name: 'DeliveryShipped' })],
        invariants: [
          makeInvariant({ id: 'inv-delivery', description: 'Delivery address must be valid' }),
        ],
      }),
    ],
  });

  const flowSaleToInventory: FlowDefinition = {
    id: 'flow-sale-inventory',
    name: 'Sale To Inventory',
    moments: [
      makeMoment({
        id: 'moment-sale',
        name: 'Register Sale',
        contextEntries: [{ contextId: 'ctx-sales', nodeName: 'CreateOrder', nodeKind: 'command' }],
      }),
    ],
    connections: [
      makeCrossingConnection({
        id: 'conn-sale-inventory',
        sourceMomentId: 'moment-sale',
        targetContextId: 'ctx-inventory',
        schemaContract: makeSchemaContract({ eventType: 'SaleRegistered' }),
      }),
    ],
  };

  const flowInventoryToFulfillment: FlowDefinition = {
    id: 'flow-inventory-fulfillment',
    name: 'Inventory To Fulfillment',
    moments: [
      makeMoment({
        id: 'moment-inventory',
        name: 'Reserve Inventory',
        contextEntries: [
          { contextId: 'ctx-inventory', nodeName: 'ReserveStock', nodeKind: 'command' },
        ],
      }),
    ],
    connections: [
      makeCrossingConnection({
        id: 'conn-inventory-fulfillment',
        sourceMomentId: 'moment-inventory',
        targetContextId: 'ctx-fulfillment',
        schemaContract: makeSchemaContract({ eventType: 'StockReserved' }),
      }),
    ],
  };

  return {
    contexts: [ctxSales, ctxInventory, ctxFulfillment],
    flows: [flowSaleToInventory, flowInventoryToFulfillment],
    glossary: [],
    relationships: [
      {
        sourceContextId: 'ctx-sales',
        targetContextId: 'ctx-inventory',
        relationshipType: 'upstream-downstream',
        contract: 'SaleRegistered',
      },
      {
        sourceContextId: 'ctx-inventory',
        targetContextId: 'ctx-fulfillment',
        relationshipType: 'upstream-downstream',
        contract: 'StockReserved',
      },
    ],
    metadata: { name: 'MultiContextSpec', version: '1.0.0' },
  };
}

// ---------------------------------------------------------------------------
// Pipeline execution helper
// ---------------------------------------------------------------------------
interface PipelineResult {
  topology: TestSuiteTopology;
  generateResult: GenerationManifest;
  emitResult: EmitTypeScriptResult;
}

async function runPipeline(ir: IntermediateRepresentation): Promise<PipelineResult> {
  const generatePolicy = new GenerateGherkinOnTopologyDerived();
  const emitPolicy = new EmitTypeScriptOnTopologyDerived();

  let generateResult: GenerationManifest | undefined;
  let emitResult: EmitTypeScriptResult | undefined;

  const derivePolicy = new DeriveOnSpecificationParsed({
    onTopologyDerived: [
      async (topology, hookIr) => {
        generateResult = generatePolicy.execute(hookIr, topology);
      },
      async (topology, hookIr) => {
        emitResult = emitPolicy.execute(hookIr, topology);
      },
    ],
  });

  const topology = await derivePolicy.execute(ir);

  if (!generateResult || !emitResult) {
    throw new Error('Pipeline hooks did not fire — missing generateResult or emitResult');
  }

  return { topology, generateResult, emitResult };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Full Pipeline Integration — M3 Gate', () => {
  // Test 1: Full pipeline produces all output artifacts
  it('produces all output artifacts: .feature, .spec.ts, .types.ts, .aggregate.ts, specification.md, architecture-palette.md', async () => {
    const ir = buildMinimalIR();
    const { generateResult, emitResult } = await runPipeline(ir);

    // .feature files
    const featureFiles = generateResult.featuresGenerated;
    expect(featureFiles.length).toBeGreaterThanOrEqual(1);
    expect(featureFiles.every((f) => f.filePath.endsWith('.feature'))).toBe(true);

    // specification.md and architecture-palette.md
    const docTypes = generateResult.docsGenerated.map((d) => d.documentType);
    expect(docTypes).toContain('specification');
    expect(docTypes).toContain('architecture-palette');

    // .types.ts files
    const tsFiles = [...emitResult.typeScriptOutput.files.keys()];
    expect(tsFiles.some((f) => f.endsWith('.types.ts'))).toBe(true);

    // .aggregate.ts files
    expect(tsFiles.some((f) => f.endsWith('.aggregate.ts'))).toBe(true);

    // .spec.ts files
    const specFiles = [...emitResult.scaffoldOutput.files.keys()];
    expect(specFiles.some((f) => f.endsWith('.spec.ts'))).toBe(true);
  });

  // Test 2: Minimal sample — single-flow IR with two contexts and crossing
  it('minimal sample: single-flow IR with two contexts produces all outputs', async () => {
    const ir = buildMinimalIR();
    const { topology, generateResult, emitResult } = await runPipeline(ir);

    // Topology has 1 suite (1 flow)
    expect(topology.suites).toHaveLength(1);
    expect(topology.suites[0].flowId).toBe('flow-order');

    // .feature: 1 flow → 1 feature file
    expect(generateResult.featuresGenerated).toHaveLength(1);
    expect(generateResult.featuresGenerated[0].flowId).toBe('flow-order');

    // Docs: specification.md + architecture-palette.md + per-context inventory docs
    expect(generateResult.docsGenerated.length).toBeGreaterThanOrEqual(2);

    // TypeScript: 2 contexts × 1 aggregate each → at least 2 types + 2 aggregate + 2 index = 6 files
    expect(emitResult.typeScriptOutput.files.size).toBeGreaterThanOrEqual(6);

    // Scaffold: 1 flow spec + 2 aggregate specs = 3 spec files
    expect(emitResult.scaffoldOutput.files.size).toBeGreaterThanOrEqual(3);
  });

  // Test 3: Multi-context sample — 3 contexts, crossings
  it('multi-context sample: 3 contexts with 2 flows and crossings produces all outputs', async () => {
    const ir = buildMultiContextIR();
    const { topology, generateResult, emitResult } = await runPipeline(ir);

    // 2 flows → 2 suites
    expect(topology.suites).toHaveLength(2);

    // 2 feature files
    expect(generateResult.featuresGenerated).toHaveLength(2);

    // Docs: spec + architecture-palette + 3 context inventories = 5
    expect(generateResult.docsGenerated.length).toBeGreaterThanOrEqual(5);

    // TypeScript: 3 contexts × 1 aggregate each → at least 9 files (types + aggregate + index)
    expect(emitResult.typeScriptOutput.files.size).toBeGreaterThanOrEqual(9);

    // Scaffold: 2 flow specs + 3 aggregate specs = 5 spec files
    expect(emitResult.scaffoldOutput.files.size).toBeGreaterThanOrEqual(5);

    // Verify contexts covered across suites
    const allContextsCovered = topology.suites.flatMap((s) => s.contextsCovered);
    expect(allContextsCovered).toContain('ctx-sales');
    expect(allContextsCovered).toContain('ctx-inventory');
    expect(allContextsCovered).toContain('ctx-fulfillment');
  });

  // Test 4: Design Principle #2 — every flow has BOTH .feature AND .spec.ts
  it('Design Principle #2: every flow in topology has both a .feature file and a .spec.ts file', async () => {
    const ir = buildMultiContextIR();
    const { topology, generateResult, emitResult } = await runPipeline(ir);

    const featureFlowIds = new Set(generateResult.featuresGenerated.map((f) => f.flowId));
    const flowSpecPaths = [...emitResult.scaffoldOutput.files.keys()].filter(
      (k) => k.includes('__tests__/flows/') && k.endsWith('.spec.ts'),
    );

    for (const suite of topology.suites) {
      // Each flow must have a .feature
      expect(featureFlowIds.has(suite.flowId)).toBe(true);

      // Each flow must have its own .spec.ts under __tests__/flows/
      const hasSpec = flowSpecPaths.some((specPath) =>
        specPath.toLowerCase().includes(suite.flowName.toLowerCase().replace(/\s+/g, '-')),
      );
      expect(hasSpec).toBe(true);
    }

    // Number of feature files == number of spec flow files == number of suites
    expect(generateResult.featuresGenerated).toHaveLength(topology.suites.length);
    expect(flowSpecPaths.length).toBe(topology.suites.length);
  });

  // Test 5: GN-01 — every flow has a .feature file
  it('GN-01: every flow produces a .feature file', async () => {
    const ir = buildMultiContextIR();
    const { topology, generateResult } = await runPipeline(ir);

    const featureFlowIds = generateResult.featuresGenerated.map((f) => f.flowId);

    for (const suite of topology.suites) {
      expect(featureFlowIds).toContain(suite.flowId);
    }

    // Each feature file has non-empty content
    for (const feature of generateResult.featuresGenerated) {
      expect(feature.content.length).toBeGreaterThan(0);
      expect(feature.filePath).toMatch(/\.feature$/);
    }
  });

  // Test 6: TG-03 — every flow has a .spec.ts file
  it('TG-03: every flow produces a .spec.ts file', async () => {
    const ir = buildMultiContextIR();
    const { topology, emitResult } = await runPipeline(ir);

    const specFiles = [...emitResult.scaffoldOutput.files.keys()].filter((k) =>
      k.startsWith('__tests__/flows/'),
    );

    // One spec per flow
    expect(specFiles).toHaveLength(topology.suites.length);

    // Each spec file ends with .spec.ts and has content
    for (const specPath of specFiles) {
      expect(specPath).toMatch(/\.spec\.ts$/);
      const content = emitResult.scaffoldOutput.files.get(specPath);
      expect(content).toBeDefined();
      expect(content!.length).toBeGreaterThan(0);
    }
  });

  // Test 7: Policy chain order — DeriveOnSpecificationParsed fires hooks, both execute
  it('policy chain: DeriveOnSpecificationParsed fires hooks that execute both GenerateGherkin and EmitTypeScript', async () => {
    const ir = buildMinimalIR();

    let generateFired = false;
    let emitFired = false;
    let hookTopology: TestSuiteTopology | undefined;

    const generatePolicy = new GenerateGherkinOnTopologyDerived();
    const emitPolicy = new EmitTypeScriptOnTopologyDerived();

    const derivePolicy = new DeriveOnSpecificationParsed({
      onTopologyDerived: [
        async (topology, hookIr) => {
          generateFired = true;
          hookTopology = topology;
          generatePolicy.execute(hookIr, topology);
        },
        async (topology, hookIr) => {
          emitFired = true;
          emitPolicy.execute(hookIr, topology);
        },
      ],
    });

    const topology = await derivePolicy.execute(ir);

    expect(generateFired).toBe(true);
    expect(emitFired).toBe(true);
    expect(hookTopology).toBeDefined();
    // The topology returned by execute matches what hooks received
    expect(hookTopology!.metadata.sourceIrHash).toBe(topology.metadata.sourceIrHash);
    expect(hookTopology!.suites).toHaveLength(topology.suites.length);
  });

  // Test 8: Deterministic — same IR through full pipeline twice → identical outputs
  it('deterministic: same IR through full pipeline twice yields identical outputs', async () => {
    const ir = buildMultiContextIR();

    const result1 = await runPipeline(ir);
    const result2 = await runPipeline(ir);

    // Same topology hash
    expect(result1.topology.metadata.sourceIrHash).toBe(result2.topology.metadata.sourceIrHash);

    // Same feature files
    expect(result1.generateResult.featuresGenerated).toHaveLength(
      result2.generateResult.featuresGenerated.length,
    );
    for (let i = 0; i < result1.generateResult.featuresGenerated.length; i++) {
      expect(result1.generateResult.featuresGenerated[i].content).toBe(
        result2.generateResult.featuresGenerated[i].content,
      );
      expect(result1.generateResult.featuresGenerated[i].filePath).toBe(
        result2.generateResult.featuresGenerated[i].filePath,
      );
    }

    // Same docs
    expect(result1.generateResult.docsGenerated).toHaveLength(
      result2.generateResult.docsGenerated.length,
    );
    for (let i = 0; i < result1.generateResult.docsGenerated.length; i++) {
      expect(result1.generateResult.docsGenerated[i].content).toBe(
        result2.generateResult.docsGenerated[i].content,
      );
    }

    // Same TypeScript files
    const tsFiles1 = [...result1.emitResult.typeScriptOutput.files.entries()].sort(([a], [b]) =>
      a.localeCompare(b),
    );
    const tsFiles2 = [...result2.emitResult.typeScriptOutput.files.entries()].sort(([a], [b]) =>
      a.localeCompare(b),
    );
    expect(tsFiles1.length).toBe(tsFiles2.length);
    for (let i = 0; i < tsFiles1.length; i++) {
      expect(tsFiles1[i][0]).toBe(tsFiles2[i][0]);
      expect(tsFiles1[i][1]).toBe(tsFiles2[i][1]);
    }

    // Same scaffold files
    const scaffoldFiles1 = [...result1.emitResult.scaffoldOutput.files.entries()].sort(([a], [b]) =>
      a.localeCompare(b),
    );
    const scaffoldFiles2 = [...result2.emitResult.scaffoldOutput.files.entries()].sort(([a], [b]) =>
      a.localeCompare(b),
    );
    expect(scaffoldFiles1.length).toBe(scaffoldFiles2.length);
    for (let i = 0; i < scaffoldFiles1.length; i++) {
      expect(scaffoldFiles1[i][0]).toBe(scaffoldFiles2[i][0]);
      expect(scaffoldFiles1[i][1]).toBe(scaffoldFiles2[i][1]);
    }
  });
});
