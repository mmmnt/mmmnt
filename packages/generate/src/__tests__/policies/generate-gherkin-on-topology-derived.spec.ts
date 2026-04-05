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
  TopologyDerivedHook,
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
    id: id ?? `ctx-${name}`,
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

function makeFlow(id: string, name: string) {
  return {
    id,
    name,
    lanes: [],
    moments: [
      {
        id: 'moment-0',
        name: 'Step',
        contextEntries: [
          { contextId: 'ctx-Ordering', nodeName: 'DoSomething', nodeKind: 'command' as const },
        ],
      },
    ],
    connections: [],
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
  momentId: string,
  momentName: string,
  opts: {
    assertions?: AssertionPoint[];
    setupSteps?: SetupStep[];
    variant?: string;
  } = {},
): TestCaseDefinition {
  return {
    momentId,
    momentName,
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
      contexts: [makeContext('Ordering'), makeContext('Shipping')],
      flows: [makeFlow('f1', 'Place Order')],
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
  });

  // 2. GenerationManifest includes .feature files + markdown docs
  it('GenerationManifest includes .feature files and markdown docs', () => {
    const suiteA = makeSuite('f1', 'Flow Alpha', [makeTestCase('fr1', 'Moment A')]);
    const suiteB = makeSuite('f2', 'Flow Beta', [makeTestCase('fr2', 'Moment B')]);
    const topology = makeTopology([suiteA, suiteB]);
    const ir = makeIR({
      contexts: [makeContext('Sales')],
      flows: [makeFlow('f1', 'Flow Alpha'), makeFlow('f2', 'Flow Beta')],
    });

    const manifest = policy.execute(ir, topology);

    // Two feature files
    expect(manifest.featuresGenerated).toHaveLength(2);
    expect(manifest.featuresGenerated[0].filePath).toContain('.feature');
    expect(manifest.featuresGenerated[1].filePath).toContain('.feature');

    // Single consolidated specification document
    expect(manifest.docsGenerated).toHaveLength(1);
    expect(manifest.docsGenerated[0].filePath).toBe('specification.md');
  });

  // 3. Empty topology with contexts -> no features but still produces spec docs
  it('empty topology with contexts produces no features but still produces spec docs', () => {
    const topology = makeTopology([]);
    const ir = makeIR({
      contexts: [makeContext('Ordering'), makeContext('Billing')],
    });

    const manifest = policy.execute(ir, topology);

    // No features generated
    expect(manifest.featuresGenerated).toHaveLength(0);

    // Spec docs are still generated from the IR
    expect(manifest.docsGenerated.length).toBe(1);
    const docTypes = manifest.docsGenerated.map((d) => d.documentType);
    expect(docTypes).toContain('specification');

    // Per-context inventories
  });

  // 4. Works as a hook from DeriveOnSpecificationParsed (callable interface)
  it('works as a TopologyDerivedHook callback via handle method', () => {
    const suite = makeSuite('f1', 'Hook Flow', [makeTestCase('fr1', 'Moment 1')]);
    const topology = makeTopology([suite]);
    const ir = makeIR({
      contexts: [makeContext('Payments')],
      flows: [makeFlow('f1', 'Hook Flow')],
    });

    // Type-safe: policy.handle conforms to TopologyDerivedHook signature
    const hook: TopologyDerivedHook = policy.handle.bind(policy);

    // Invoke as DeriveOnSpecificationParsed would — no errors
    hook(topology, ir);

    // Verify execute still produces correct manifest
    const manifest = policy.execute(ir, topology);
    expect(manifest.featuresGenerated).toHaveLength(1);
    expect(manifest.docsGenerated.length).toBeGreaterThanOrEqual(1);
  });

  // 5. Empty IR (no contexts, no flows) produces nothing
  it('empty IR produces no features and no docs', () => {
    const topology = makeTopology([]);
    const ir = makeIR(); // no contexts, no flows

    const manifest = policy.execute(ir, topology);

    expect(manifest.featuresGenerated).toHaveLength(0);
    expect(manifest.docsGenerated).toHaveLength(0);
  });
});
