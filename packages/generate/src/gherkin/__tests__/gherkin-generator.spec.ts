import { describe, it, expect } from 'vitest';
import type { IntermediateRepresentation, FlowDefinition } from '@mmmnt/core';
import { GherkinGenerator } from '../gherkin-generator.js';
import { renderFeatureFromIr } from '../feature-renderer.js';

function makeIR(overrides: Partial<IntermediateRepresentation> = {}): IntermediateRepresentation {
  return {
    contexts: overrides.contexts ?? [],
    flows: overrides.flows ?? [],
    glossary: [],
    relationships: [],
    metadata: { name: 'test', version: '1.0.0' },
  };
}

function makeBasicIR(): IntermediateRepresentation {
  return makeIR({
    contexts: [
      {
        id: 'ctx-Ordering',
        name: 'Ordering',
        classification: 'Core',
        aggregates: [
          {
            id: 'agg-Order',
            name: 'Order',
            identityField: { name: 'orderId', type: 'UUID', isArray: false, required: true },
            commands: [
              {
                id: 'cmd-PlaceOrder',
                name: 'PlaceOrder',
                inputs: [
                  { name: 'customerId', type: 'UUID', isArray: false, required: true },
                  { name: 'items', type: 'OrderItem', isArray: true, required: true },
                ],
                preconditions: [
                  { name: 'orderNotPlaced', description: 'Order has not been placed' },
                ],
                emitsEvent: 'OrderPlaced',
              },
            ],
            events: [
              {
                id: 'evt-OrderPlaced',
                name: 'OrderPlaced',
                fields: [
                  { name: 'orderId', type: 'UUID', isArray: false, required: true },
                  { name: 'customerId', type: 'UUID', isArray: false, required: true },
                  { name: 'items', type: 'OrderItem', isArray: true, required: true },
                ],
              },
            ],
            valueObjects: [],
            invariants: [],
          },
        ],
        domainServices: [],
        commands: [
          {
            id: 'cmd-PlaceOrder',
            name: 'PlaceOrder',
            inputs: [
              { name: 'customerId', type: 'UUID', isArray: false, required: true },
              { name: 'items', type: 'OrderItem', isArray: true, required: true },
            ],
            preconditions: [{ name: 'orderNotPlaced', description: 'Order has not been placed' }],
            emitsEvent: 'OrderPlaced',
          },
        ],
        events: [
          {
            id: 'evt-OrderPlaced',
            name: 'OrderPlaced',
            fields: [
              { name: 'orderId', type: 'UUID', isArray: false, required: true },
              { name: 'customerId', type: 'UUID', isArray: false, required: true },
              { name: 'items', type: 'OrderItem', isArray: true, required: true },
            ],
          },
        ],
        policies: [],
        sagas: [],
        valueObjects: [],
        invariants: [],
      },
      {
        id: 'ctx-Fulfillment',
        name: 'Fulfillment',
        classification: 'Supporting',
        aggregates: [
          {
            id: 'agg-Request',
            name: 'FulfillmentRequest',
            identityField: { name: 'reqId', type: 'UUID', isArray: false, required: true },
            commands: [
              {
                id: 'cmd-Initiate',
                name: 'InitiateFulfillment',
                inputs: [{ name: 'orderId', type: 'UUID', isArray: false, required: true }],
                preconditions: [],
                emitsEvent: 'FulfillmentInitiated',
              },
            ],
            events: [
              {
                id: 'evt-Initiated',
                name: 'FulfillmentInitiated',
                fields: [{ name: 'reqId', type: 'UUID', isArray: false, required: true }],
              },
            ],
            valueObjects: [],
            invariants: [],
          },
        ],
        domainServices: [],
        commands: [
          {
            id: 'cmd-Initiate',
            name: 'InitiateFulfillment',
            inputs: [{ name: 'orderId', type: 'UUID', isArray: false, required: true }],
            preconditions: [],
            emitsEvent: 'FulfillmentInitiated',
          },
        ],
        events: [
          {
            id: 'evt-Initiated',
            name: 'FulfillmentInitiated',
            fields: [{ name: 'reqId', type: 'UUID', isArray: false, required: true }],
          },
        ],
        policies: [],
        sagas: [],
        valueObjects: [],
        invariants: [],
      },
    ],
    flows: [
      {
        id: 'flow-order',
        name: 'order-placed',
        description: 'Order triggers fulfillment',
        moments: [
          {
            id: 'moment-0-Order-submission',
            name: 'Order submission',
            contextEntries: [
              { contextId: 'ctx-Ordering', nodeName: 'PlaceOrder', nodeKind: 'command' },
              { contextId: 'ctx-Ordering', nodeName: 'OrderPlaced', nodeKind: 'event' },
            ],
          },
          {
            id: 'moment-1-Fulfillment',
            name: 'Fulfillment initiation',
            contextEntries: [
              {
                contextId: 'ctx-Fulfillment',
                nodeName: 'InitiateFulfillment',
                nodeKind: 'command',
              },
              { contextId: 'ctx-Fulfillment', nodeName: 'FulfillmentInitiated', nodeKind: 'event' },
            ],
          },
        ],
        connections: [
          {
            id: 'conn-0',
            sourceMomentId: 'moment-0-Order-submission',
            targetContextId: 'ctx-Fulfillment',
            eventId: 'evt-OrderPlaced',
            connectionType: 'crosses-to' as const,
            schemaContract: {
              eventType: 'OrderPlaced',
              fields: [
                { name: 'orderId', type: 'UUID', required: true },
                { name: 'items', type: 'OrderItem[]', required: true },
              ],
              relationshipType: 'CustomerSupplier',
            },
          },
          {
            id: 'conn-1',
            sourceMomentId: 'moment-1-Fulfillment',
            targetContextId: 'ctx-Fulfillment',
            eventId: 'evt-OrderPlaced',
            connectionType: 'triggered-by' as const,
          },
        ],
      },
    ],
  });
}

describe('GherkinGenerator', () => {
  const generator = new GherkinGenerator();

  it('produces one feature per flow', () => {
    const ir = makeBasicIR();
    const topo = { suites: [], metadata: { sourceIrHash: '', derivedAt: '' } };
    const manifest = generator.generate(ir, topo);

    expect(manifest.featuresGenerated).toHaveLength(1);
    expect(manifest.featuresGenerated[0].flowId).toBe('flow-order');
  });

  it('generates Given steps from preconditions', () => {
    const ir = makeBasicIR();
    const topo = { suites: [], metadata: { sourceIrHash: '', derivedAt: '' } };
    const content = generator.generate(ir, topo).featuresGenerated[0].content;

    expect(content).toContain('Given Order has not been placed');
  });

  it('generates When steps from commands with inputs', () => {
    const ir = makeBasicIR();
    const topo = { suites: [], metadata: { sourceIrHash: '', derivedAt: '' } };
    const content = generator.generate(ir, topo).featuresGenerated[0].content;

    expect(content).toContain('When Ordering performs PlaceOrder with customerId, items');
  });

  it('generates Then steps for internal events', () => {
    const ir = makeBasicIR();
    const topo = { suites: [], metadata: { sourceIrHash: '', derivedAt: '' } };
    const content = generator.generate(ir, topo).featuresGenerated[0].content;

    expect(content).toContain('Then Fulfillment emits FulfillmentInitiated');
  });

  it('generates Then steps for crossing events with contract', () => {
    const ir = makeBasicIR();
    const topo = { suites: [], metadata: { sourceIrHash: '', derivedAt: '' } };
    const content = generator.generate(ir, topo).featuresGenerated[0].content;

    expect(content).toContain('Then OrderPlaced crosses to Fulfillment via CustomerSupplier');
    expect(content).toContain('| orderId | items |');
    expect(content).toContain('| UUID | OrderItem[] |');
  });

  it('preserves flow description', () => {
    const ir = makeBasicIR();
    const topo = { suites: [], metadata: { sourceIrHash: '', derivedAt: '' } };
    const content = generator.generate(ir, topo).featuresGenerated[0].content;

    expect(content).toContain('Order triggers fulfillment');
  });

  it('generates scenario per moment', () => {
    const ir = makeBasicIR();
    const topo = { suites: [], metadata: { sourceIrHash: '', derivedAt: '' } };
    const content = generator.generate(ir, topo).featuresGenerated[0].content;

    expect(content).toContain('Scenario: Order submission');
    expect(content).toContain('Scenario: Fulfillment initiation');
  });

  it('returns empty for IR with no flows', () => {
    const ir = makeIR({ contexts: [makeBasicIR().contexts[0]] });
    const topo = { suites: [], metadata: { sourceIrHash: '', derivedAt: '' } };
    const manifest = generator.generate(ir, topo);

    expect(manifest.featuresGenerated).toHaveLength(0);
  });
});

describe('renderFeatureFromIr', () => {
  it('renders Feature header with flow name', () => {
    const ir = makeBasicIR();
    const output = renderFeatureFromIr(ir.flows[0], ir);

    expect(output).toContain('Feature: order-placed');
    // Tags now precede the Feature line
    expect(output).toContain('@context:Ordering');
  });

  it('every moment produces a non-empty scenario', () => {
    const ir = makeBasicIR();
    const output = renderFeatureFromIr(ir.flows[0], ir);
    const scenarios = output.split('Scenario:').slice(1);

    for (const scenario of scenarios) {
      const hasSteps =
        scenario.includes('Given') || scenario.includes('When') || scenario.includes('Then');
      expect(hasSteps).toBe(true);
    }
  });
});
