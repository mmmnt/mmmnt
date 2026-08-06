import { describe, it, expect } from 'vitest';
import type { IntermediateRepresentation } from '@mmmnt/core';
import type { TestSuiteTopology } from '@mmmnt/derive';
import { generateCucumberJson } from '../../cucumber/cucumber-json-formatter.js';
import type { GenerationManifest } from '../../types/index.js';

const FEATURE_CONTENT = `@context:Ordering
Feature: order-placed

  Rule: Ordering

    @aggregate:Order
    Scenario: Order submission
      When Ordering performs PlaceOrder
      Then OrderPlaced crosses to Fulfillment via CustomerSupplier

    Scenario: Unmatched step
      Then Ordering emits SomethingElse
`;

function makeIr(): IntermediateRepresentation {
  return {
    contexts: [],
    flows: [
      {
        id: 'flow-order',
        name: 'order-placed',
        description: 'Order flow',
        lanes: [],
        moments: [
          {
            id: 'moment-0',
            name: 'Order submission',
            contextEntries: [
              { contextId: 'ctx-Ordering', nodeName: 'PlaceOrder', nodeKind: 'command' },
            ],
          },
        ],
        connections: [],
      },
    ],
    glossary: [],
    relationships: [],
    metadata: { name: 'test', version: '1.0.0' },
  };
}

function makeManifest(): GenerationManifest {
  return {
    featuresGenerated: [
      {
        flowId: 'flow-order',
        filePath: 'features/order-placed.feature',
        content: FEATURE_CONTENT,
        scenarioCount: 2,
      },
    ],
    docsGenerated: [],
  };
}

function makeTopology(): TestSuiteTopology {
  return {
    suites: [
      {
        flowId: 'flow-order',
        flowName: 'order-placed',
        testCases: [
          {
            momentId: 'moment-0',
            momentName: 'Order submission',
            assertions: [],
            setupSteps: [],
          },
        ],
        contextsCovered: ['ctx-Ordering'],
      },
    ],
    metadata: { sourceIrHash: 'x', derivedAt: '2026-01-01T00:00:00Z' },
  };
}

describe('generateCucumberJson', () => {
  it('never reports passed — nothing is executed at generation time', () => {
    const features = generateCucumberJson(makeManifest(), makeTopology(), makeIr());

    const statuses = features
      .flatMap((f) => f.elements)
      .flatMap((s) => s.steps)
      .map((step) => step.result.status);

    expect(statuses.length).toBeGreaterThan(0);
    expect(statuses).not.toContain('passed');
  });

  it('marks steps of a scenario backed by a derived test case as pending', () => {
    const features = generateCucumberJson(makeManifest(), makeTopology(), makeIr());

    const backed = features[0].elements.find((s) => s.name === 'Order submission');
    expect(backed).toBeDefined();
    for (const step of backed!.steps) {
      expect(step.result.status).toBe('pending');
    }
  });

  it('marks scenarios with no backing test case as skipped', () => {
    const features = generateCucumberJson(makeManifest(), makeTopology(), makeIr());

    const unbacked = features[0].elements.find((s) => s.name === 'Unmatched step');
    expect(unbacked).toBeDefined();
    for (const step of unbacked!.steps) {
      expect(step.result.status).toBe('skipped');
    }
  });

  it('marks every scenario skipped when no suite exists for the flow', () => {
    const topology: TestSuiteTopology = {
      suites: [],
      metadata: { sourceIrHash: 'x', derivedAt: '2026-01-01T00:00:00Z' },
    };
    const features = generateCucumberJson(makeManifest(), topology, makeIr());

    for (const scenario of features[0].elements) {
      for (const step of scenario.steps) {
        expect(step.result.status).toBe('skipped');
      }
    }
  });

  it('marks saga scenarios pending when saga test cases exist', () => {
    const content = `Feature: order-placed

    @saga:PaymentProcess
    Scenario: PaymentProcess state transitions
      Given the saga is triggered by PaymentInitiated
      Then states progress: Pending → Completed
`;
    const manifest: GenerationManifest = {
      featuresGenerated: [
        {
          flowId: 'flow-order',
          filePath: 'features/order-placed.feature',
          content,
          scenarioCount: 1,
        },
      ],
      docsGenerated: [],
    };
    const topology = makeTopology();
    topology.suites[0].testCases.push({
      momentId: 'saga-PaymentProcess-initiated',
      momentName: 'saga PaymentProcess starts on PaymentInitiated',
      assertions: [],
      setupSteps: [],
    });

    const features = generateCucumberJson(manifest, topology, makeIr());
    const sagaScenario = features[0].elements[0];
    for (const step of sagaScenario.steps) {
      expect(step.result.status).toBe('pending');
    }
  });
});
