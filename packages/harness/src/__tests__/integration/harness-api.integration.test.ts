import { describe, it, expect } from 'vitest';
import type { IntermediateRepresentation } from '@mmmnt/core';
import type { TestSuiteTopology } from '@mmmnt/derive';

// EXIT-C1: public API imports only — barrel export from package root
import { TestRunner, EventReplayEngine, ContractAssertionEngine } from '../../index.js';
import type { TestRunResult, ReplayResult, ContractValidationResult } from '../../index.js';

// ---------------------------------------------------------------------------
// Shared fixture: multi-context IR representative of real usage
// ---------------------------------------------------------------------------

const sampleIR: IntermediateRepresentation = {
  contexts: [
    {
      id: 'ctx-ordering',
      name: 'Ordering',
      classification: 'Core',
      aggregates: [
        {
          id: 'agg-order',
          name: 'Order',
          identityField: { name: 'orderId', type: 'string', isArray: false, required: true },
          commands: [
            {
              id: 'cmd-place',
              name: 'PlaceOrder',
              inputs: [{ name: 'orderId', type: 'string', isArray: false, required: true }],
              preconditions: [],
              emitsEvent: 'evt-order-placed',
            },
          ],
          events: [
            {
              id: 'evt-order-placed',
              name: 'OrderPlaced',
              fields: [
                { name: 'orderId', type: 'string', isArray: false, required: true },
                { name: 'amount', type: 'number', isArray: false, required: true },
              ],
            },
          ],
          valueObjects: [],
          invariants: [],
        },
      ],
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
  flows: [
    {
      id: 'flow-order-to-ship',
      name: 'Order to Ship',
      moments: [
        {
          id: 'moment-place',
          name: 'Place Order',
          contextEntries: [
            { contextId: 'ctx-ordering', nodeName: 'PlaceOrder', nodeKind: 'command' as const },
          ],
        },
        {
          id: 'moment-ship',
          name: 'Ship Order',
          contextEntries: [
            { contextId: 'ctx-shipping', nodeName: 'ShipOrder', nodeKind: 'command' as const },
          ],
        },
      ],
      connections: [
        {
          id: 'conn-order-ship',
          sourceMomentId: 'moment-place',
          targetContextId: 'ctx-shipping',
          eventId: 'evt-order-placed',
          connectionType: 'crosses-to' as const,
          schemaContract: {
            eventType: 'OrderPlaced',
            fields: [
              { name: 'orderId', type: 'string', required: true },
              { name: 'amount', type: 'number', required: true },
            ],
            relationshipType: 'customer-supplier',
          },
        },
      ],
    },
  ],
  glossary: [{ term: 'Order', definition: 'A purchase request' }],
  relationships: [
    {
      sourceContextId: 'ctx-ordering',
      targetContextId: 'ctx-shipping',
      relationshipType: 'Customer-Supplier',
      contract: 'OrderPlaced',
    },
  ],
  metadata: { name: 'e-commerce', version: '1.0.0', description: 'Sample e-commerce spec' },
};

const sampleTopology: TestSuiteTopology = {
  suites: [
    {
      flowId: 'flow-order-to-ship',
      flowName: 'Order to Ship',
      contextsCovered: ['ctx-ordering', 'ctx-shipping'],
      testCases: [
        {
          momentId: 'moment-place',
          momentName: 'Place Order',
          setupSteps: [
            { contextName: 'Ordering', aggregateName: 'Order', precondition: 'order exists' },
          ],
          assertions: [
            {
              crossingId: 'conn-order-ship',
              sourceContext: 'ctx-ordering',
              targetContext: 'ctx-shipping',
              schemaContract: {
                eventType: 'OrderPlaced',
                expectedFields: [
                  { fieldName: 'orderId', expectedType: 'string', required: true },
                  { fieldName: 'amount', expectedType: 'number', required: true },
                ],
              },
              assertionType: 'payload' as const,
            },
          ],
        },
        {
          momentId: 'moment-ship',
          momentName: 'Ship Order',
          setupSteps: [],
          assertions: [],
        },
      ],
    },
  ],
  metadata: { sourceIrHash: 'integration-test', derivedAt: '2026-01-01T00:00:00Z' },
};

// ---------------------------------------------------------------------------
// Integration Tests — MMNT-109
// ---------------------------------------------------------------------------

describe('Harness API Integration', () => {
  it('TestRunner produces TestRunResult with traceabilityMap (TE-01)', () => {
    const runner = new TestRunner();
    const result: TestRunResult = runner.run(sampleTopology, sampleIR);

    expect(result.suitesRun).toBe(1);
    expect(result.testsPassed + result.testsFailed + result.testsSkipped).toBe(2);

    // TE-01: every test result includes traceability
    const keys = Object.keys(result.traceabilityMap);
    expect(keys.length).toBe(2);
    for (const specElement of Object.values(result.traceabilityMap)) {
      expect(specElement).toBeTruthy();
    }
  });

  it('EventReplayEngine replays cross-context event chain', () => {
    const engine = new EventReplayEngine();
    const flow = sampleIR.flows[0];
    const result: ReplayResult = engine.replay(flow, sampleIR);

    expect(result.flowId).toBe('flow-order-to-ship');
    expect(result.stepsReplayed).toBe(2);
    expect(result.divergencePoints).toHaveLength(0);
    expect(result.finalStateMatch).toBe(true);
  });

  it('ContractAssertionEngine validates valid contract', () => {
    const engine = new ContractAssertionEngine();
    const contract = sampleIR.flows[0].connections[0];
    if (contract.connectionType !== 'crosses-to') throw new Error('Expected crossing');

    const payload = { orderId: 'ord-001', amount: 42.5 };
    const result: ContractValidationResult = engine.validate(
      contract.id,
      payload,
      contract.schemaContract,
    );

    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
    expect(result.crossingId).toBe('conn-order-ship');
  });

  it('ContractAssertionEngine detects missing required field', () => {
    const engine = new ContractAssertionEngine();
    const contract = sampleIR.flows[0].connections[0];
    if (contract.connectionType !== 'crosses-to') throw new Error('Expected crossing');

    // Missing 'amount' which is required
    const payload = { orderId: 'ord-001' };
    const result = engine.validate(contract.id, payload, contract.schemaContract);

    expect(result.valid).toBe(false);
    expect(result.violations.length).toBeGreaterThanOrEqual(1);
    const amountViolation = result.violations.find((v) => v.fieldName === 'amount');
    expect(amountViolation).toBeDefined();
    expect(amountViolation!.constraintViolated).toBe('required field missing');
  });

  it('EventReplayEngine detects divergence (TE-02)', () => {
    const engine = new EventReplayEngine();
    // Flow referencing a context not in the IR
    const divergentFlow = {
      ...sampleIR.flows[0],
      id: 'flow-divergent',
      moments: [
        {
          id: 'moment-ghost',
          name: 'Ghost Frame',
          contextEntries: [
            { contextId: 'ctx-nonexistent', nodeName: 'GhostCmd', nodeKind: 'command' as const },
          ],
        },
      ],
    };

    const result = engine.replay(divergentFlow, sampleIR);

    expect(result.finalStateMatch).toBe(false);
    expect(result.divergencePoints.length).toBeGreaterThanOrEqual(1);
    expect(result.divergencePoints[0].momentIndex).toBe(0);
    expect(result.divergencePoints[0].eventThatCaused).toBe('GhostCmd');
  });

  // ---------------------------------------------------------------------------
  // TE-03: Saga structural validation — MMNT-4369
  // ---------------------------------------------------------------------------

  it('TE-03: saga init passes when trigger event exists in context (structural)', () => {
    const ir: IntermediateRepresentation = {
      ...sampleIR,
      contexts: [
        {
          ...sampleIR.contexts[0],
          sagas: [
            {
              id: 'saga-order-fulfillment',
              name: 'OrderFulfillment',
              trigger: 'OrderPlaced',
              states: ['Pending', 'Processing', 'Complete'],
              compensation: 'Cancel order and refund',
              timeout: 'fulfillmentTimeout',
            },
          ],
        },
        sampleIR.contexts[1],
      ],
    };

    const topology: TestSuiteTopology = {
      ...sampleTopology,
      suites: [
        {
          ...sampleTopology.suites[0],
          testCases: [
            {
              momentId: 'saga-OrderFulfillment-initiated',
              momentName: 'Saga: OrderFulfillment initiated',
              assertions: [
                {
                  crossingId: 'saga-init-OrderFulfillment',
                  sourceContext: 'ctx-ordering',
                  targetContext: 'ctx-ordering',
                  schemaContract: { eventType: 'OrderPlaced', expectedFields: [] },
                  assertionType: 'saga' as const,
                },
              ],
              setupSteps: [
                {
                  contextName: 'Ordering',
                  aggregateName: 'OrderFulfillment',
                  precondition: 'OrderPlaced occurs',
                },
              ],
            },
          ],
        },
      ],
    };

    const runner = new TestRunner();
    const result = runner.run(topology, ir);
    expect(result.testsPassed).toBe(1);
    expect(result.testsFailed).toBe(0);
  });

  it('TE-03: saga init fails when trigger event missing from context', () => {
    const ir: IntermediateRepresentation = {
      ...sampleIR,
      contexts: [
        {
          ...sampleIR.contexts[0],
          aggregates: [],
          events: [],
          sagas: [
            {
              id: 'saga-ghost',
              name: 'GhostSaga',
              trigger: 'NonExistentEvent',
              states: ['A', 'B'],
              compensation: 'rollback',
              timeout: 'ghostTimeout',
            },
          ],
        },
        sampleIR.contexts[1],
      ],
    };

    const topology: TestSuiteTopology = {
      ...sampleTopology,
      suites: [
        {
          ...sampleTopology.suites[0],
          testCases: [
            {
              momentId: 'saga-GhostSaga-initiated',
              momentName: 'Saga: GhostSaga initiated',
              assertions: [
                {
                  crossingId: 'saga-init-GhostSaga',
                  sourceContext: 'ctx-ordering',
                  targetContext: 'ctx-ordering',
                  schemaContract: { eventType: 'NonExistentEvent', expectedFields: [] },
                  assertionType: 'saga' as const,
                },
              ],
              setupSteps: [
                {
                  contextName: 'Ordering',
                  aggregateName: 'GhostSaga',
                  precondition: 'NonExistentEvent occurs',
                },
              ],
            },
          ],
        },
      ],
    };

    const runner = new TestRunner();
    const result = runner.run(topology, ir);
    expect(result.testsPassed).toBe(0);
    expect(result.testsFailed).toBe(1);
  });

  it('TE-03: saga transition passes for adjacent states', () => {
    const ir: IntermediateRepresentation = {
      ...sampleIR,
      contexts: [
        {
          ...sampleIR.contexts[0],
          sagas: [
            {
              id: 'saga-order-fulfillment',
              name: 'OrderFulfillment',
              trigger: 'OrderPlaced',
              states: ['Pending', 'Processing', 'Complete'],
              compensation: 'Cancel order',
              timeout: 'fulfillmentTimeout',
            },
          ],
        },
        sampleIR.contexts[1],
      ],
    };

    const topology: TestSuiteTopology = {
      ...sampleTopology,
      suites: [
        {
          ...sampleTopology.suites[0],
          testCases: [
            {
              momentId: 'saga-OrderFulfillment-Pending-to-Processing',
              momentName: 'Saga: OrderFulfillment Pending → Processing',
              assertions: [
                {
                  crossingId: 'saga-transition-OrderFulfillment-0',
                  sourceContext: 'ctx-ordering',
                  targetContext: 'ctx-ordering',
                  schemaContract: { eventType: 'OrderFulfillment.Processing', expectedFields: [] },
                  assertionType: 'saga' as const,
                },
              ],
              setupSteps: [
                {
                  contextName: 'Ordering',
                  aggregateName: 'OrderFulfillment',
                  precondition: 'Saga is in Pending state',
                },
              ],
            },
          ],
        },
      ],
    };

    const runner = new TestRunner();
    const result = runner.run(topology, ir);
    expect(result.testsPassed).toBe(1);
    expect(result.testsFailed).toBe(0);
  });

  it('TE-03: saga transition fails for non-adjacent states', () => {
    const ir: IntermediateRepresentation = {
      ...sampleIR,
      contexts: [
        {
          ...sampleIR.contexts[0],
          sagas: [
            {
              id: 'saga-order-fulfillment',
              name: 'OrderFulfillment',
              trigger: 'OrderPlaced',
              states: ['Pending', 'Processing', 'Complete'],
              compensation: 'Cancel order',
              timeout: 'fulfillmentTimeout',
            },
          ],
        },
        sampleIR.contexts[1],
      ],
    };

    const topology: TestSuiteTopology = {
      ...sampleTopology,
      suites: [
        {
          ...sampleTopology.suites[0],
          testCases: [
            {
              momentId: 'saga-OrderFulfillment-Pending-to-Complete',
              momentName: 'Saga: OrderFulfillment Pending → Complete',
              assertions: [
                {
                  crossingId: 'saga-transition-OrderFulfillment-skip',
                  sourceContext: 'ctx-ordering',
                  targetContext: 'ctx-ordering',
                  schemaContract: { eventType: 'OrderFulfillment.Complete', expectedFields: [] },
                  assertionType: 'saga' as const,
                },
              ],
              setupSteps: [
                {
                  contextName: 'Ordering',
                  aggregateName: 'OrderFulfillment',
                  precondition: 'Saga is in Pending state',
                },
              ],
            },
          ],
        },
      ],
    };

    const runner = new TestRunner();
    const result = runner.run(topology, ir);
    expect(result.testsPassed).toBe(0);
    expect(result.testsFailed).toBe(1);
  });

  it('TE-03: saga compensation passes when compensation and timeout are defined', () => {
    const ir: IntermediateRepresentation = {
      ...sampleIR,
      contexts: [
        {
          ...sampleIR.contexts[0],
          sagas: [
            {
              id: 'saga-order-fulfillment',
              name: 'OrderFulfillment',
              trigger: 'OrderPlaced',
              states: ['Pending', 'Processing', 'Complete'],
              compensation: 'Cancel order and refund payment',
              timeout: 'fulfillmentTimeout',
            },
          ],
        },
        sampleIR.contexts[1],
      ],
    };

    const topology: TestSuiteTopology = {
      ...sampleTopology,
      suites: [
        {
          ...sampleTopology.suites[0],
          testCases: [
            {
              momentId: 'saga-OrderFulfillment-compensation',
              momentName: 'Saga: OrderFulfillment compensation',
              assertions: [
                {
                  crossingId: 'saga-comp-OrderFulfillment',
                  sourceContext: 'ctx-ordering',
                  targetContext: 'ctx-ordering',
                  schemaContract: { eventType: 'OrderFulfillment.Compensated', expectedFields: [] },
                  assertionType: 'saga' as const,
                },
              ],
              setupSteps: [
                {
                  contextName: 'Ordering',
                  aggregateName: 'OrderFulfillment',
                  precondition: 'Cancel order and refund payment',
                },
              ],
            },
          ],
        },
      ],
    };

    const runner = new TestRunner();
    const result = runner.run(topology, ir);
    expect(result.testsPassed).toBe(1);
    expect(result.testsFailed).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // TE-04: Policy chain structural validation — MMNT-4369
  // ---------------------------------------------------------------------------

  it('TE-04: policy chain passes when trigger event and chainsTo command both exist', () => {
    const ir: IntermediateRepresentation = {
      ...sampleIR,
      contexts: [
        {
          ...sampleIR.contexts[0],
          policies: [
            {
              id: 'pol-fulfill-on-placed',
              name: 'FulfillOnOrderPlaced',
              trigger: 'OrderPlaced',
              action: 'Initiate fulfillment after order is placed',
              chainsTo: 'PlaceOrder',
            },
          ],
        },
        sampleIR.contexts[1],
      ],
    };

    const topology: TestSuiteTopology = {
      ...sampleTopology,
      suites: [
        {
          ...sampleTopology.suites[0],
          testCases: [
            {
              momentId: 'policy-FulfillOnOrderPlaced',
              momentName: 'Policy: FulfillOnOrderPlaced',
              assertions: [
                {
                  crossingId: 'policy-chain-FulfillOnOrderPlaced',
                  sourceContext: 'ctx-ordering',
                  targetContext: 'ctx-ordering',
                  schemaContract: { eventType: 'PlaceOrder', expectedFields: [] },
                  assertionType: 'policy-chain' as const,
                },
              ],
              setupSteps: [
                {
                  contextName: 'Ordering',
                  aggregateName: 'FulfillOnOrderPlaced',
                  precondition: 'OrderPlaced occurs → PlaceOrder must follow',
                },
              ],
            },
          ],
        },
      ],
    };

    const runner = new TestRunner();
    const result = runner.run(topology, ir);
    expect(result.testsPassed).toBe(1);
    expect(result.testsFailed).toBe(0);
  });

  it('TE-04: policy chain fails when chainsTo command does not exist', () => {
    const ir: IntermediateRepresentation = {
      ...sampleIR,
      contexts: [
        {
          ...sampleIR.contexts[0],
          policies: [
            {
              id: 'pol-ghost',
              name: 'GhostPolicy',
              trigger: 'OrderPlaced',
              action: 'Do something',
              chainsTo: 'NonExistentCommand',
            },
          ],
        },
        sampleIR.contexts[1],
      ],
    };

    const topology: TestSuiteTopology = {
      ...sampleTopology,
      suites: [
        {
          ...sampleTopology.suites[0],
          testCases: [
            {
              momentId: 'policy-GhostPolicy',
              momentName: 'Policy: GhostPolicy',
              assertions: [
                {
                  crossingId: 'policy-chain-GhostPolicy',
                  sourceContext: 'ctx-ordering',
                  targetContext: 'ctx-ordering',
                  schemaContract: { eventType: 'NonExistentCommand', expectedFields: [] },
                  assertionType: 'policy-chain' as const,
                },
              ],
              setupSteps: [
                {
                  contextName: 'Ordering',
                  aggregateName: 'GhostPolicy',
                  precondition: 'OrderPlaced occurs → NonExistentCommand must follow',
                },
              ],
            },
          ],
        },
      ],
    };

    const runner = new TestRunner();
    const result = runner.run(topology, ir);
    expect(result.testsPassed).toBe(0);
    expect(result.testsFailed).toBe(1);
  });

  it('TE-04: policy chain fails when trigger event does not exist', () => {
    const ir: IntermediateRepresentation = {
      ...sampleIR,
      contexts: [
        {
          ...sampleIR.contexts[0],
          policies: [
            {
              id: 'pol-bad-trigger',
              name: 'BadTriggerPolicy',
              trigger: 'NonExistentEvent',
              action: 'Do something',
              chainsTo: 'PlaceOrder',
            },
          ],
        },
        sampleIR.contexts[1],
      ],
    };

    const topology: TestSuiteTopology = {
      ...sampleTopology,
      suites: [
        {
          ...sampleTopology.suites[0],
          testCases: [
            {
              momentId: 'policy-BadTriggerPolicy',
              momentName: 'Policy: BadTriggerPolicy',
              assertions: [
                {
                  crossingId: 'policy-chain-BadTriggerPolicy',
                  sourceContext: 'ctx-ordering',
                  targetContext: 'ctx-ordering',
                  schemaContract: { eventType: 'PlaceOrder', expectedFields: [] },
                  assertionType: 'policy-chain' as const,
                },
              ],
              setupSteps: [
                {
                  contextName: 'Ordering',
                  aggregateName: 'BadTriggerPolicy',
                  precondition: 'NonExistentEvent occurs → PlaceOrder must follow',
                },
              ],
            },
          ],
        },
      ],
    };

    const runner = new TestRunner();
    const result = runner.run(topology, ir);
    expect(result.testsPassed).toBe(0);
    expect(result.testsFailed).toBe(1);
  });

  it('consumer ergonomics — single import, full API accessible', () => {
    // Verify all public types and classes are importable from @mmmnt/harness
    expect(TestRunner).toBeDefined();
    expect(EventReplayEngine).toBeDefined();
    expect(ContractAssertionEngine).toBeDefined();

    // Verify instances can be created
    const runner = new TestRunner();
    const replay = new EventReplayEngine();
    const contract = new ContractAssertionEngine();

    expect(typeof runner.run).toBe('function');
    expect(typeof replay.replay).toBe('function');
    expect(typeof contract.validate).toBe('function');
  });
});
