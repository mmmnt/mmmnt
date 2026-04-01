import { describe, it, expect } from 'vitest';
import type { IntermediateRepresentation } from '@mmmnt/core';
import type { TestSuiteTopology } from '@mmmnt/derive';
import { TestRunner } from '../test-runner.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeIR(overrides: Partial<IntermediateRepresentation> = {}): IntermediateRepresentation {
  return {
    contexts: overrides.contexts ?? [
      {
        id: 'ctx-ordering',
        name: 'Ordering',
        aggregates: [],
        domainServices: [],
        commands: [],
        events: [],
        policies: [],
        sagas: [],
        valueObjects: [],
        invariants: [],
      },
      {
        id: 'ctx-shipping',
        name: 'Shipping',
        aggregates: [],
        domainServices: [],
        commands: [],
        events: [],
        policies: [],
        sagas: [],
        valueObjects: [],
        invariants: [],
      },
    ],
    flows: overrides.flows ?? [
      {
        id: 'flow-1',
        name: 'Place Order',
        moments: [
          {
            id: 'moment-1',
            name: 'Accept Order',
            contextEntries: [
              { contextId: 'ctx-ordering', nodeName: 'PlaceOrder', nodeKind: 'command' as const },
            ],
          },
          {
            id: 'moment-2',
            name: 'Ship Order',
            contextEntries: [
              { contextId: 'ctx-shipping', nodeName: 'ShipOrder', nodeKind: 'command' as const },
            ],
          },
        ],
        connections: [],
      },
    ],
    glossary: overrides.glossary ?? [],
    relationships: overrides.relationships ?? [],
    metadata: overrides.metadata ?? {
      name: 'test-spec',
      version: '1.0.0',
      description: 'Test specification',
    },
  };
}

function makeTopology(overrides: Partial<TestSuiteTopology> = {}): TestSuiteTopology {
  return {
    suites: overrides.suites ?? [
      {
        flowId: 'flow-1',
        flowName: 'Place Order',
        contextsCovered: ['Ordering', 'Shipping'],
        testCases: [
          {
            momentId: 'moment-1',
            momentName: 'Accept Order',
            setupSteps: [
              { contextName: 'Ordering', aggregateName: 'Order', precondition: 'order exists' },
            ],
            assertions: [
              {
                crossingId: 'crossing-1',
                sourceContext: 'ctx-ordering',
                targetContext: 'ctx-shipping',
                schemaContract: { eventType: 'OrderPlaced', expectedFields: [] },
                assertionType: 'payload' as const,
              },
            ],
          },
          {
            momentId: 'moment-2',
            momentName: 'Ship Order',
            setupSteps: [],
            assertions: [],
          },
        ],
      },
    ],
    metadata: overrides.metadata ?? {
      sourceIrHash: 'abc123',
      derivedAt: '2026-01-01T00:00:00Z',
    },
  };
}

// ---------------------------------------------------------------------------
// Tests — MMNT-108: TestRunner
// ---------------------------------------------------------------------------

describe('TestRunner', () => {
  const runner = new TestRunner();

  it('produces TestRunResult with correct suite/test counts', () => {
    const ir = makeIR();
    const topology = makeTopology();

    const result = runner.run(topology, ir);

    expect(result.suitesRun).toBe(1);
    expect(result.testsPassed).toBe(2);
    expect(result.testsFailed).toBe(0);
    expect(result.testsSkipped).toBe(0);
  });

  it('TE-01: every test result includes traceability to spec element', () => {
    const ir = makeIR();
    const topology = makeTopology();

    const result = runner.run(topology, ir);

    // Every test case must have an entry in traceabilityMap
    const totalTests = result.testsPassed + result.testsFailed + result.testsSkipped;
    expect(Object.keys(result.traceabilityMap)).toHaveLength(totalTests);

    // Each value should be a non-empty string referencing a spec element
    for (const specElement of Object.values(result.traceabilityMap)) {
      expect(specElement).toBeTruthy();
      expect(typeof specElement).toBe('string');
    }
  });

  it('handles empty test suite', () => {
    const ir = makeIR();
    const topology = makeTopology({
      suites: [],
    });

    const result = runner.run(topology, ir);

    expect(result.suitesRun).toBe(0);
    expect(result.testsPassed).toBe(0);
    expect(result.testsFailed).toBe(0);
    expect(result.testsSkipped).toBe(0);
    expect(Object.keys(result.traceabilityMap)).toHaveLength(0);
  });

  it('reports failed tests correctly', () => {
    const ir = makeIR();
    // Topology references a frame that doesn't exist in the IR flow
    const topology = makeTopology({
      suites: [
        {
          flowId: 'flow-1',
          flowName: 'Place Order',
          contextsCovered: ['Ordering'],
          testCases: [
            {
              momentId: 'nonexistent-frame',
              momentName: 'Ghost Frame',
              setupSteps: [],
              assertions: [],
            },
          ],
        },
      ],
    });

    const result = runner.run(topology, ir);

    expect(result.testsFailed).toBe(1);
    expect(result.testsPassed).toBe(0);
  });

  it('reports skipped tests correctly', () => {
    const ir = makeIR();
    // Topology references a flow that doesn't exist in the IR
    const topology = makeTopology({
      suites: [
        {
          flowId: 'nonexistent-flow',
          flowName: 'Missing Flow',
          contextsCovered: [],
          testCases: [
            {
              momentId: 'moment-x',
              momentName: 'Skipped Frame',
              setupSteps: [],
              assertions: [],
            },
          ],
        },
      ],
    });

    const result = runner.run(topology, ir);

    expect(result.testsSkipped).toBe(1);
    expect(result.testsPassed).toBe(0);
    expect(result.testsFailed).toBe(0);
  });

  it('fails when setup step references missing context', () => {
    const ir = makeIR({
      contexts: [
        {
          id: 'ctx-ordering',
          name: 'Ordering',
          aggregates: [],
          domainServices: [],
          commands: [],
          events: [],
          policies: [],
          sagas: [],
          valueObjects: [],
          invariants: [],
        },
      ],
      flows: [
        {
          id: 'flow-1',
          name: 'Place Order',
          moments: [{ id: 'moment-1', name: 'Accept', contextEntries: [] }],
          connections: [],
        },
      ],
    });
    const topology = makeTopology({
      suites: [
        {
          flowId: 'flow-1',
          flowName: 'Place Order',
          contextsCovered: [],
          testCases: [
            {
              momentId: 'moment-1',
              momentName: 'Accept',
              setupSteps: [
                { contextName: 'NonExistent', aggregateName: 'Agg', precondition: 'exists' },
              ],
              assertions: [],
            },
          ],
        },
      ],
    });

    const result = runner.run(topology, ir);
    expect(result.testsFailed).toBe(1);
  });

  it('fails when assertion references missing context', () => {
    const ir = makeIR({
      contexts: [
        {
          id: 'ctx-ordering',
          name: 'Ordering',
          aggregates: [],
          domainServices: [],
          commands: [],
          events: [],
          policies: [],
          sagas: [],
          valueObjects: [],
          invariants: [],
        },
      ],
      flows: [
        {
          id: 'flow-1',
          name: 'Place Order',
          moments: [{ id: 'moment-1', name: 'Accept', contextEntries: [] }],
          connections: [],
        },
      ],
    });
    const topology = makeTopology({
      suites: [
        {
          flowId: 'flow-1',
          flowName: 'Place Order',
          contextsCovered: [],
          testCases: [
            {
              momentId: 'moment-1',
              momentName: 'Accept',
              setupSteps: [],
              assertions: [
                {
                  crossingId: 'c1',
                  sourceContext: 'ctx-ordering',
                  targetContext: 'ctx-missing',
                  schemaContract: { eventType: 'Evt', expectedFields: [] },
                  assertionType: 'payload' as const,
                },
              ],
            },
          ],
        },
      ],
    });

    const result = runner.run(topology, ir);
    expect(result.testsFailed).toBe(1);
  });

  it('traceabilityMap maps test IDs to spec element IDs', () => {
    const ir = makeIR();
    const topology = makeTopology();

    const result = runner.run(topology, ir);

    // First test case has an assertion → traceability maps to crossingId
    const testId1 = 'flow-1::moment-1';
    expect(result.traceabilityMap[testId1]).toBe('crossing-1');

    // Second test case has no assertions → maps to flowId/frameId
    const testId2 = 'flow-1::moment-2';
    expect(result.traceabilityMap[testId2]).toBe('flow-1/moment-2');
  });
});
