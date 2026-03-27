import { describe, it, expect } from 'vitest';
import type { IntermediateRepresentation, ContextDefinition } from '@mmmnt/core';
import type {
  TestSuiteTopology,
  TestSuiteDefinition,
  TestCaseDefinition,
  SetupStep,
  AssertionPoint,
  FieldConstraint,
  PayloadValidationStep,
} from '@mmmnt/derive';
import { GenerateGherkinOnTopologyDerived } from '../../policies/generate-gherkin-on-topology-derived.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeIR(overrides: Partial<IntermediateRepresentation> = {}): IntermediateRepresentation {
  return {
    contexts: overrides.contexts ?? [],
    flows: overrides.flows ?? [],
    glossary: overrides.glossary ?? [],
    relationships: overrides.relationships ?? [],
    metadata: overrides.metadata ?? {
      name: 'test-spec',
      version: '1.0.0',
      description: 'Test specification',
      generatedAt: '2026-01-01T00:00:00Z',
    },
  };
}

function makeContext(name: string, id?: string): ContextDefinition {
  return {
    id: id ?? name.toLowerCase(),
    name,
    aggregates: [],
    commands: [],
    events: [],
    valueObjects: [],
    domainServices: [],
    policies: [],
    sagas: [],
    invariants: [],
  };
}

function makeFieldConstraint(
  fieldName: string,
  expectedType: string,
  required: boolean,
): FieldConstraint {
  return { fieldName, expectedType, required };
}

function makePayloadValidation(
  eventType: string,
  fields: FieldConstraint[] = [],
): PayloadValidationStep {
  return { eventType, expectedFields: fields };
}

function makeAssertion(
  crossingId: string,
  sourceContext: string,
  targetContext: string,
  eventType: string,
  fields: FieldConstraint[] = [],
): AssertionPoint {
  return {
    crossingId,
    sourceContext,
    targetContext,
    schemaContract: makePayloadValidation(eventType, fields),
    assertionType: 'payload',
  };
}

function makeSetupStep(
  contextName: string,
  aggregateName: string,
  precondition: string,
): SetupStep {
  return { contextName, aggregateName, precondition };
}

function makeTestCase(
  frameId: string,
  frameName: string,
  opts: {
    assertions?: AssertionPoint[];
    setupSteps?: SetupStep[];
    variant?: string;
  } = {},
): TestCaseDefinition {
  return {
    frameId,
    frameName,
    assertions: opts.assertions ?? [],
    setupSteps: opts.setupSteps ?? [],
    variant: opts.variant,
  };
}

function makeSuite(
  flowId: string,
  flowName: string,
  testCases: TestCaseDefinition[],
  contextsCovered: string[] = [],
): TestSuiteDefinition {
  return { flowId, flowName, testCases, contextsCovered };
}

function makeTopology(
  suites: TestSuiteDefinition[],
  sourceIrHash = 'abc123',
  derivedAt = '2026-01-01T00:00:00Z',
): TestSuiteTopology {
  return {
    suites,
    metadata: { sourceIrHash, derivedAt },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GenerateGherkinOnTopologyDerived', () => {
  const policy = new GenerateGherkinOnTopologyDerived();

  // 1. Topology triggers both GherkinGenerator and SpecificationDocumentGenerator
  it('triggers both GherkinGenerator and SpecificationDocumentGenerator', () => {
    const suite = makeSuite('f1', 'Place Order', [
      makeTestCase('fr1', 'Accept Order', {
        setupSteps: [makeSetupStep('Ordering', 'Order', 'order is pending')],
        assertions: [makeAssertion('c1', 'Ordering', 'Shipping', 'OrderPlaced')],
      }),
    ]);
    const topology = makeTopology([suite]);
    const ir = makeIR({
      contexts: [makeContext('Ordering', 'ordering'), makeContext('Shipping', 'shipping')],
    });

    const manifest = policy.execute(ir, topology);

    // GherkinGenerator produced feature files
    expect(manifest.featuresGenerated).toHaveLength(1);
    expect(manifest.featuresGenerated[0].flowId).toBe('f1');
    expect(manifest.featuresGenerated[0].content).toContain('Feature: Place Order');

    // SpecificationDocumentGenerator produced docs
    expect(manifest.docsGenerated.length).toBeGreaterThanOrEqual(1);
    const docTypes = manifest.docsGenerated.map((d) => d.documentType);
    expect(docTypes).toContain('specification');
    expect(docTypes).toContain('architecture-palette');
  });

  // 2. GenerationManifest includes .feature files + markdown docs
  it('GenerationManifest includes .feature files and markdown docs', () => {
    const suiteA = makeSuite('f1', 'Flow Alpha', [makeTestCase('fr1', 'Frame A')]);
    const suiteB = makeSuite('f2', 'Flow Beta', [makeTestCase('fr2', 'Frame B')]);
    const topology = makeTopology([suiteA, suiteB]);
    const ir = makeIR({
      contexts: [makeContext('Sales', 'sales')],
    });

    const manifest = policy.execute(ir, topology);

    // Two feature files
    expect(manifest.featuresGenerated).toHaveLength(2);
    expect(manifest.featuresGenerated[0].filePath).toContain('.feature');
    expect(manifest.featuresGenerated[1].filePath).toContain('.feature');

    // Docs include specification.md + architecture-palette.md + per-context inventory
    const filePaths = manifest.docsGenerated.map((d) => d.filePath);
    expect(filePaths).toContain('specification.md');
    expect(filePaths).toContain('architecture-palette.md');
    expect(filePaths).toContain('sales/inventory.md');
  });

  // 3. Empty topology with contexts -> no features but still produces spec docs
  it('empty topology with contexts produces no features but still produces spec docs', () => {
    const topology = makeTopology([]);
    const ir = makeIR({
      contexts: [makeContext('Ordering', 'ordering'), makeContext('Billing', 'billing')],
    });

    const manifest = policy.execute(ir, topology);

    // No features generated
    expect(manifest.featuresGenerated).toHaveLength(0);

    // Spec docs are still generated from the IR
    expect(manifest.docsGenerated.length).toBeGreaterThanOrEqual(2);
    const docTypes = manifest.docsGenerated.map((d) => d.documentType);
    expect(docTypes).toContain('specification');
    expect(docTypes).toContain('architecture-palette');
    // Per-context inventories
    expect(manifest.docsGenerated.some((d) => d.documentType === 'context-inventory')).toBe(true);
  });

  // 4. Works as a hook from DeriveOnSpecificationParsed (callable interface)
  it('works as a TopologyDerivedHook callback', () => {
    const suite = makeSuite('f1', 'Hook Flow', [makeTestCase('fr1', 'Frame 1')]);
    const topology = makeTopology([suite]);
    const ir = makeIR({
      contexts: [makeContext('Payments', 'payments')],
    });

    // Simulate the hook signature: (topology, ir) => void | Promise<void>
    // The policy's execute takes (ir, topology), so a wrapper adapts it.
    let capturedManifest: ReturnType<typeof policy.execute> | undefined;
    const hook = (t: TestSuiteTopology, i: IntermediateRepresentation): void => {
      capturedManifest = policy.execute(i, t);
    };

    // Invoke the hook as DeriveOnSpecificationParsed would
    hook(topology, ir);

    expect(capturedManifest).toBeDefined();
    expect(capturedManifest!.featuresGenerated).toHaveLength(1);
    expect(capturedManifest!.docsGenerated.length).toBeGreaterThanOrEqual(1);
  });

  // 5. Empty IR (no contexts) with topology produces features but no docs
  it('empty IR with topology produces features but no docs', () => {
    const suite = makeSuite('f1', 'Lonely Flow', [makeTestCase('fr1', 'Frame 1')]);
    const topology = makeTopology([suite]);
    const ir = makeIR(); // no contexts

    const manifest = policy.execute(ir, topology);

    expect(manifest.featuresGenerated).toHaveLength(1);
    expect(manifest.docsGenerated).toHaveLength(0);
  });
});
