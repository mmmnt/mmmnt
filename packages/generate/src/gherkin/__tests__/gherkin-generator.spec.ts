import { describe, it, expect } from 'vitest';
import type { IntermediateRepresentation } from '@mmmnt/core';
import type {
  TestSuiteTopology,
  TestSuiteDefinition,
  TestCaseDefinition,
  SetupStep,
  AssertionPoint,
  FieldConstraint,
  PayloadValidationStep,
} from '@mmmnt/derive';
import { GherkinGenerator } from '../gherkin-generator.js';
import { renderFeature } from '../feature-renderer.js';

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

describe('GherkinGenerator', () => {
  const generator = new GherkinGenerator();

  // 1. Single flow -> one .feature file with correct Feature title
  it('single flow produces one .feature file with correct Feature title', () => {
    const suite = makeSuite('f1', 'Place Order', [makeTestCase('mo1', 'Accept Order')]);
    const topology = makeTopology([suite]);
    const ir = makeIR();

    const manifest = generator.generate(ir, topology);

    expect(manifest.featuresGenerated).toHaveLength(1);
    expect(manifest.featuresGenerated[0].content).toContain('Feature: Place Order');
    expect(manifest.featuresGenerated[0].flowId).toBe('f1');
  });

  // 2. Multiple flows -> one .feature per flow (GN-01)
  it('multiple flows produce one .feature per flow (GN-01)', () => {
    const suiteA = makeSuite('f1', 'Flow Alpha', [makeTestCase('mo1', 'Moment A')]);
    const suiteB = makeSuite('f2', 'Flow Beta', [makeTestCase('mo2', 'Moment B')]);
    const suiteC = makeSuite('f3', 'Flow Gamma', [makeTestCase('mo3', 'Moment C')]);
    const topology = makeTopology([suiteA, suiteB, suiteC]);
    const ir = makeIR();

    const manifest = generator.generate(ir, topology);

    expect(manifest.featuresGenerated).toHaveLength(3);
    expect(manifest.featuresGenerated[0].flowId).toBe('f1');
    expect(manifest.featuresGenerated[1].flowId).toBe('f2');
    expect(manifest.featuresGenerated[2].flowId).toBe('f3');
  });

  // 3. Moment -> Scenario with moment name
  it('moment produces Scenario with moment name', () => {
    const suite = makeSuite('f1', 'Order Flow', [makeTestCase('mo1', 'Accept Order')]);
    const topology = makeTopology([suite]);
    const ir = makeIR();

    const manifest = generator.generate(ir, topology);

    expect(manifest.featuresGenerated[0].content).toContain('Scenario: Accept Order');
  });

  // 4. Setup steps -> Given steps
  it('setup steps produce Given steps', () => {
    const suite = makeSuite('f1', 'Order Flow', [
      makeTestCase('fr1', 'Accept Order', {
        setupSteps: [
          makeSetupStep('Ordering', 'Order', 'order exists in pending state'),
          makeSetupStep('Inventory', 'Stock', 'stock is available'),
        ],
      }),
    ]);
    const topology = makeTopology([suite]);
    const ir = makeIR();

    const manifest = generator.generate(ir, topology);
    const content = manifest.featuresGenerated[0].content;

    expect(content).toContain('Given order exists in pending state');
    expect(content).toContain('Given stock is available');
  });

  // 5. Command nodes -> When steps (assertion crossings produce When steps)
  it('command/crossing nodes produce When steps', () => {
    const suite = makeSuite('f1', 'Order Flow', [
      makeTestCase('fr1', 'Accept Order', {
        assertions: [makeAssertion('c1', 'Ordering', 'Shipping', 'OrderPlaced')],
      }),
    ]);
    const topology = makeTopology([suite]);
    const ir = makeIR();

    const manifest = generator.generate(ir, topology);
    const content = manifest.featuresGenerated[0].content;

    expect(content).toContain('When OrderPlaced crosses from Ordering to Shipping');
  });

  // 6. Event/assertion nodes -> Then steps
  it('event/assertion nodes produce Then steps', () => {
    const suite = makeSuite('f1', 'Order Flow', [
      makeTestCase('fr1', 'Accept Order', {
        assertions: [makeAssertion('c1', 'Ordering', 'Shipping', 'OrderPlaced')],
      }),
    ]);
    const topology = makeTopology([suite]);
    const ir = makeIR();

    const manifest = generator.generate(ir, topology);
    const content = manifest.featuresGenerated[0].content;

    expect(content).toContain('Then OrderPlaced payload is valid');
  });

  // 7. Crossing assertion points -> cross-context verification Then steps
  it('crossing assertion points produce cross-context verification steps', () => {
    const suite = makeSuite('f1', 'Cross Flow', [
      makeTestCase('fr1', 'Cross Moment', {
        assertions: [
          makeAssertion('c1', 'Sales', 'Fulfillment', 'OrderAccepted', [
            makeFieldConstraint('orderId', 'string', true),
          ]),
        ],
      }),
    ]);
    const topology = makeTopology([suite]);
    const ir = makeIR();

    const manifest = generator.generate(ir, topology);
    const content = manifest.featuresGenerated[0].content;

    expect(content).toContain('When OrderAccepted crosses from Sales to Fulfillment');
    expect(content).toContain('Then OrderAccepted payload is valid');
  });

  // 8. Schema contract fields -> Examples table parameters
  it('schema contract fields produce Examples table parameters', () => {
    const suite = makeSuite('f1', 'Contract Flow', [
      makeTestCase('fr1', 'Contract Moment', {
        assertions: [
          makeAssertion('c1', 'Ordering', 'Billing', 'OrderPlaced', [
            makeFieldConstraint('orderId', 'string', true),
            makeFieldConstraint('amount', 'number', true),
            makeFieldConstraint('notes', 'string', false),
          ]),
        ],
      }),
    ]);
    const topology = makeTopology([suite]);
    const ir = makeIR();

    const manifest = generator.generate(ir, topology);
    const content = manifest.featuresGenerated[0].content;

    expect(content).not.toContain('Examples:');
    expect(content).toContain('| orderId | amount | notes |');
    expect(content).toContain('| string | number | string |');
    expect(content).toContain('| required | required | optional |');
  });

  // 9. Deterministic: same input twice -> identical output
  it('deterministic: same input twice produces identical output', () => {
    const suite = makeSuite('f1', 'Deterministic Flow', [
      makeTestCase('fr1', 'Moment 1', {
        setupSteps: [makeSetupStep('Ctx', 'Agg', 'state is ready')],
        assertions: [
          makeAssertion('c1', 'Ctx', 'Other', 'SomeEvent', [
            makeFieldConstraint('id', 'string', true),
          ]),
        ],
      }),
      makeTestCase('fr2', 'Moment 2'),
    ]);
    const topology = makeTopology([suite]);
    const ir = makeIR();

    const manifest1 = generator.generate(ir, topology);
    const manifest2 = generator.generate(ir, topology);

    expect(manifest1).toEqual(manifest2);
  });

  // 10. Empty topology -> empty manifest
  it('empty topology produces empty manifest', () => {
    const topology = makeTopology([]);
    const ir = makeIR();

    const manifest = generator.generate(ir, topology);

    expect(manifest.featuresGenerated).toHaveLength(0);
    expect(manifest.docsGenerated).toHaveLength(0);
  });

  // 11. Flow with multiple moments -> multiple Scenarios
  it('flow with multiple moments produces multiple Scenarios', () => {
    const suite = makeSuite('f1', 'Multi Moment Flow', [
      makeTestCase('fr1', 'Step One'),
      makeTestCase('fr2', 'Step Two'),
      makeTestCase('fr3', 'Step Three'),
    ]);
    const topology = makeTopology([suite]);
    const ir = makeIR();

    const manifest = generator.generate(ir, topology);
    const content = manifest.featuresGenerated[0].content;

    expect(content).toContain('Scenario: Step One');
    expect(content).toContain('Scenario: Step Two');
    expect(content).toContain('Scenario: Step Three');
  });

  // 12. Branch moment -> multiple Scenarios for each branch (via variant)
  it('branch moment produces multiple Scenarios for each branch variant', () => {
    const suite = makeSuite('f1', 'Branch Flow', [
      makeTestCase('fr1', 'Decision Moment', { variant: 'order.amount > 100' }),
      makeTestCase('fr1', 'Decision Moment', { variant: 'order.amount <= 100' }),
    ]);
    const topology = makeTopology([suite]);
    const ir = makeIR();

    const manifest = generator.generate(ir, topology);
    const content = manifest.featuresGenerated[0].content;

    expect(content).toContain('Scenario: Decision Moment [order.amount > 100]');
    expect(content).toContain('Scenario: Decision Moment [order.amount <= 100]');
    expect(manifest.featuresGenerated[0].scenarioCount).toBe(2);
  });

  // 13. GenerationManifest has correct scenarioCount
  it('GenerationManifest has correct scenarioCount', () => {
    const suite = makeSuite('f1', 'Count Flow', [
      makeTestCase('fr1', 'Moment A'),
      makeTestCase('fr2', 'Moment B'),
      makeTestCase('fr3', 'Moment C'),
      makeTestCase('fr4', 'Moment D'),
    ]);
    const topology = makeTopology([suite]);
    const ir = makeIR();

    const manifest = generator.generate(ir, topology);

    expect(manifest.featuresGenerated[0].scenarioCount).toBe(4);
  });

  // 14. Feature file path uses kebab-case
  it('feature file path uses kebab-case of flow name', () => {
    const suite = makeSuite('f1', 'Place Order Flow', [makeTestCase('fr1', 'Moment 1')]);
    const topology = makeTopology([suite]);
    const ir = makeIR();

    const manifest = generator.generate(ir, topology);

    expect(manifest.featuresGenerated[0].filePath).toBe('features/place-order-flow.feature');
  });
});

describe('renderFeature (pure function)', () => {
  it('renders a complete feature file with Given/When/Then structure', () => {
    const suite = makeSuite('f1', 'Complete Flow', [
      makeTestCase('fr1', 'Setup Moment', {
        setupSteps: [makeSetupStep('Ordering', 'Order', 'order is pending')],
        assertions: [
          makeAssertion('c1', 'Ordering', 'Shipping', 'OrderPlaced', [
            makeFieldConstraint('orderId', 'string', true),
          ]),
        ],
      }),
    ]);

    const content = renderFeature(suite);

    expect(content).toMatch(/^Feature: Complete Flow\n/);
    expect(content).toContain('  Scenario: Setup Moment');
    expect(content).toContain('    Given order is pending');
    expect(content).toContain('    When OrderPlaced crosses from Ordering to Shipping');
    expect(content).toContain('    Then OrderPlaced payload is valid');
    expect(content).toContain('      | orderId |');
    expect(content.endsWith('\n')).toBe(true);
  });

  it('same-context assertion uses "is emitted" instead of "crosses from"', () => {
    const suite = makeSuite('f1', 'Same Context', [
      makeTestCase('fr1', 'Internal Moment', {
        assertions: [makeAssertion('c1', 'Ordering', 'Ordering', 'OrderUpdated')],
      }),
    ]);

    const content = renderFeature(suite);

    expect(content).toContain('When OrderUpdated is emitted');
    expect(content).not.toContain('crosses from');
  });
});

describe('Gherkin syntax validation (@cucumber/gherkin)', () => {
  it('generated .feature content parses without errors', async () => {
    const { Parser, AstBuilder, GherkinClassicTokenMatcher } = await import('@cucumber/gherkin');
    const { IdGenerator } = await import('@cucumber/messages');

    const suite = makeSuite('f1', 'Valid Flow', [
      makeTestCase('fr1', 'Step Moment', {
        setupSteps: [makeSetupStep('Ordering', 'Order', 'order exists')],
        assertions: [makeAssertion('c1', 'Ordering', 'Shipping', 'OrderPlaced')],
      }),
    ]);

    const content = renderFeature(suite);

    const uuidFn = IdGenerator.uuid();
    const builder = new AstBuilder(uuidFn);
    const matcher = new GherkinClassicTokenMatcher();
    const parser = new Parser(builder, matcher);

    // Throws on syntax errors
    expect(() => parser.parse(content)).not.toThrow();
  });
});
