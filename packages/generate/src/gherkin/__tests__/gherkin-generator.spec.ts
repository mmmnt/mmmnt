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
        lanes: [],
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

  it('renders Background block for shared preconditions', () => {
    const ir = makeIR({
      contexts: [
        {
          id: 'ctx-Sales',
          name: 'Sales',
          aggregates: [
            {
              id: 'agg-Deal',
              name: 'Deal',
              identityField: { name: 'dealId', type: 'UUID', isArray: false, required: true },
              commands: [
                {
                  id: 'cmd-CreateDeal',
                  name: 'CreateDeal',
                  inputs: [{ name: 'name', type: 'string', isArray: false, required: true }],
                  preconditions: [{ name: 'authenticated', description: 'User is authenticated' }],
                  emitsEvent: 'DealCreated',
                },
                {
                  id: 'cmd-ApproveDeal',
                  name: 'ApproveDeal',
                  inputs: [{ name: 'dealId', type: 'UUID', isArray: false, required: true }],
                  preconditions: [{ name: 'authenticated', description: 'User is authenticated' }],
                  emitsEvent: 'DealApproved',
                },
              ],
              events: [
                { id: 'evt-DealCreated', name: 'DealCreated', fields: [] },
                { id: 'evt-DealApproved', name: 'DealApproved', fields: [] },
              ],
              valueObjects: [],
              invariants: [],
            },
          ],
          domainServices: [],
          commands: [
            {
              id: 'cmd-CreateDeal',
              name: 'CreateDeal',
              inputs: [{ name: 'name', type: 'string', isArray: false, required: true }],
              preconditions: [{ name: 'authenticated', description: 'User is authenticated' }],
              emitsEvent: 'DealCreated',
            },
            {
              id: 'cmd-ApproveDeal',
              name: 'ApproveDeal',
              inputs: [{ name: 'dealId', type: 'UUID', isArray: false, required: true }],
              preconditions: [{ name: 'authenticated', description: 'User is authenticated' }],
              emitsEvent: 'DealApproved',
            },
          ],
          events: [
            { id: 'evt-DealCreated', name: 'DealCreated', fields: [] },
            { id: 'evt-DealApproved', name: 'DealApproved', fields: [] },
          ],
          policies: [],
          sagas: [],
          valueObjects: [],
          invariants: [],
        },
      ],
      flows: [
        {
          id: 'flow-deals',
          name: 'deal-flow',
          lanes: [],
          moments: [
            {
              id: 'moment-0',
              name: 'Create deal',
              contextEntries: [
                { contextId: 'ctx-Sales', nodeName: 'CreateDeal', nodeKind: 'command' as const },
                { contextId: 'ctx-Sales', nodeName: 'DealCreated', nodeKind: 'event' as const },
              ],
            },
            {
              id: 'moment-1',
              name: 'Approve deal',
              contextEntries: [
                { contextId: 'ctx-Sales', nodeName: 'ApproveDeal', nodeKind: 'command' as const },
                { contextId: 'ctx-Sales', nodeName: 'DealApproved', nodeKind: 'event' as const },
              ],
            },
          ],
          connections: [],
        },
      ],
    });

    const output = renderFeatureFromIr(ir.flows[0], ir);
    expect(output).toContain('Background:');
    expect(output).toContain('Given User is authenticated');
    // The shared precondition should appear once in Background, not in individual scenarios
    const bgIndex = output.indexOf('Background:');
    const firstScenarioIndex = output.indexOf('Scenario:');
    expect(bgIndex).toBeLessThan(firstScenarioIndex);
  });

  it('renders saga scenarios with state transitions and compensation', () => {
    const ir = makeIR({
      contexts: [
        {
          id: 'ctx-Payments',
          name: 'Payments',
          aggregates: [
            {
              id: 'agg-Payment',
              name: 'Payment',
              identityField: { name: 'paymentId', type: 'UUID', isArray: false, required: true },
              commands: [],
              events: [{ id: 'evt-PaymentInitiated', name: 'PaymentInitiated', fields: [] }],
              valueObjects: [],
              invariants: [],
            },
          ],
          domainServices: [],
          commands: [],
          events: [{ id: 'evt-PaymentInitiated', name: 'PaymentInitiated', fields: [] }],
          policies: [],
          sagas: [
            {
              id: 'saga-PaymentProcess',
              name: 'PaymentProcess',
              trigger: 'PaymentInitiated',
              states: ['Pending', 'Processing', 'Completed'],
              compensation: 'RefundPayment',
              timeout: '30 minutes',
            },
          ],
          valueObjects: [],
          invariants: [],
        },
      ],
      flows: [
        {
          id: 'flow-pay',
          name: 'payment-flow',
          lanes: [],
          moments: [
            {
              id: 'moment-0',
              name: 'Payment step',
              contextEntries: [
                {
                  contextId: 'ctx-Payments',
                  nodeName: 'PaymentInitiated',
                  nodeKind: 'event' as const,
                },
              ],
            },
          ],
          connections: [],
        },
      ],
    });

    const output = renderFeatureFromIr(ir.flows[0], ir);
    expect(output).toContain('@saga:PaymentProcess');
    expect(output).toContain('Scenario: PaymentProcess state transitions');
    expect(output).toContain('Given the saga is triggered by PaymentInitiated');
    expect(output).toContain('Pending');
    expect(output).toContain('Scenario: PaymentProcess compensation');
    expect(output).toContain('When 30 minutes is exceeded');
    expect(output).toContain('Then RefundPayment is executed');
  });

  it('renders terminal branch scenarios with @terminal @failure-path tags', () => {
    const ir = makeIR({
      contexts: [
        {
          id: 'ctx-Auth',
          name: 'Auth',
          aggregates: [
            {
              id: 'agg-Account',
              name: 'Account',
              identityField: { name: 'accountId', type: 'UUID', isArray: false, required: true },
              commands: [
                {
                  id: 'cmd-Login',
                  name: 'Login',
                  inputs: [{ name: 'email', type: 'string', isArray: false, required: true }],
                  preconditions: [{ name: 'accountActive', description: 'Account is active' }],
                  emitsEvent: 'LoggedIn',
                },
              ],
              events: [{ id: 'evt-LoggedIn', name: 'LoggedIn', fields: [] }],
              valueObjects: [],
              invariants: [],
            },
          ],
          domainServices: [],
          commands: [
            {
              id: 'cmd-Login',
              name: 'Login',
              inputs: [{ name: 'email', type: 'string', isArray: false, required: true }],
              preconditions: [{ name: 'accountActive', description: 'Account is active' }],
              emitsEvent: 'LoggedIn',
            },
          ],
          events: [{ id: 'evt-LoggedIn', name: 'LoggedIn', fields: [] }],
          policies: [],
          sagas: [],
          valueObjects: [],
          invariants: [],
        },
      ],
      flows: [
        {
          id: 'flow-auth',
          name: 'auth-flow',
          lanes: [],
          moments: [
            {
              id: 'moment-0',
              name: 'Authentication',
              contextEntries: [
                { contextId: 'ctx-Auth', nodeName: 'Login', nodeKind: 'command' as const },
              ],
              branches: [
                {
                  condition: 'success',
                  entries: [
                    { contextId: 'ctx-Auth', nodeName: 'Login', nodeKind: 'command' as const },
                    { contextId: 'ctx-Auth', nodeName: 'LoggedIn', nodeKind: 'event' as const },
                  ],
                },
                {
                  condition: 'invalid credentials',
                  entries: [
                    {
                      contextId: 'ctx-Auth',
                      nodeName: 'Rejected',
                      nodeKind: 'event' as const,
                      terminal: true,
                    },
                  ],
                },
              ],
            },
          ],
          connections: [],
        },
      ],
    });

    const output = renderFeatureFromIr(ir.flows[0], ir);
    expect(output).toContain('@terminal @failure-path');
    expect(output).toContain('Scenario: Authentication [invalid credentials]');
    expect(output).toContain('Given the authentication is evaluated');
    // The precondition belongs to the command evaluated in this moment itself
    expect(output).toContain('When accountActive is not satisfied');
    // The terminal branch renders its actual entries
    expect(output).toContain('Then Auth emits Rejected (terminal)');
    expect(output).toContain('Then the flow terminates because Account is active');

    // Branches are tagged by their nature, never guessed as happy
    expect(output).toContain('Scenario: Authentication [success]');
    expect(output).not.toContain('@happy-path');
    expect(output).toContain('@alt-path');
  });

  it('renders terminal branch without failed precondition when none found', () => {
    const ir = makeIR({
      contexts: [
        {
          id: 'ctx-Proc',
          name: 'Processing',
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
          id: 'flow-proc',
          name: 'processing-flow',
          lanes: [],
          moments: [
            {
              id: 'moment-0',
              name: 'Check',
              contextEntries: [
                { contextId: 'ctx-Proc', nodeName: 'SomeEvent', nodeKind: 'event' as const },
              ],
              branches: [
                {
                  condition: 'ok',
                  entries: [
                    { contextId: 'ctx-Proc', nodeName: 'AnotherEvent', nodeKind: 'event' as const },
                  ],
                },
                {
                  condition: 'failed',
                  entries: [
                    {
                      contextId: 'ctx-Proc',
                      nodeName: 'FailedEvent',
                      nodeKind: 'event' as const,
                      terminal: true,
                    },
                  ],
                },
              ],
            },
          ],
          connections: [],
        },
      ],
    });

    const output = renderFeatureFromIr(ir.flows[0], ir);
    expect(output).toContain('Scenario: Check [failed]');
    expect(output).toContain('When the outcome is failed');
    expect(output).toContain('Then the flow terminates');
  });

  it('renders terminal branch with saga compensation', () => {
    const ir = makeIR({
      contexts: [
        {
          id: 'ctx-Order',
          name: 'Order',
          aggregates: [
            {
              id: 'agg-Ord',
              name: 'Ord',
              identityField: { name: 'id', type: 'UUID', isArray: false, required: true },
              commands: [],
              events: [],
              valueObjects: [],
              invariants: [],
            },
          ],
          domainServices: [],
          commands: [],
          events: [],
          policies: [],
          sagas: [
            {
              id: 'saga-OrderFulfillment',
              name: 'OrderFulfillment',
              trigger: 'OrderReceived',
              states: ['Pending', 'Shipped'],
              compensation: 'CancelOrder',
              timeout: '1 hour',
            },
          ],
          valueObjects: [],
          invariants: [],
        },
      ],
      flows: [
        {
          id: 'flow-ord',
          name: 'order-flow',
          lanes: [],
          moments: [
            {
              id: 'moment-0',
              name: 'Evaluate Order',
              contextEntries: [
                { contextId: 'ctx-Order', nodeName: 'OrderReceived', nodeKind: 'event' as const },
              ],
              branches: [
                {
                  condition: 'valid',
                  entries: [
                    {
                      contextId: 'ctx-Order',
                      nodeName: 'OrderReceived',
                      nodeKind: 'event' as const,
                    },
                  ],
                },
                {
                  condition: 'invalid',
                  entries: [
                    {
                      contextId: 'ctx-Order',
                      nodeName: 'OrderRejected',
                      nodeKind: 'event' as const,
                      terminal: true,
                    },
                  ],
                },
              ],
            },
          ],
          connections: [],
        },
      ],
    });

    const output = renderFeatureFromIr(ir.flows[0], ir);
    expect(output).toContain('Scenario: Evaluate Order [invalid]');
    expect(output).toContain('And saga OrderFulfillment compensation is triggered: CancelOrder');
  });

  it('collects policy tags for entries', () => {
    const ir = makeIR({
      contexts: [
        {
          id: 'ctx-Billing',
          name: 'Billing',
          aggregates: [
            {
              id: 'agg-Invoice',
              name: 'Invoice',
              identityField: { name: 'invoiceId', type: 'UUID', isArray: false, required: true },
              commands: [
                {
                  id: 'cmd-SendInvoice',
                  name: 'SendInvoice',
                  inputs: [],
                  preconditions: [],
                  emitsEvent: 'InvoiceSent',
                },
              ],
              events: [{ id: 'evt-InvoiceSent', name: 'InvoiceSent', fields: [] }],
              valueObjects: [],
              invariants: [],
            },
          ],
          domainServices: [],
          commands: [
            {
              id: 'cmd-SendInvoice',
              name: 'SendInvoice',
              inputs: [],
              preconditions: [],
              emitsEvent: 'InvoiceSent',
            },
          ],
          events: [{ id: 'evt-InvoiceSent', name: 'InvoiceSent', fields: [] }],
          policies: [
            {
              id: 'pol-AutoSend',
              name: 'AutoSend',
              trigger: 'InvoiceCreated',
              action: 'Send invoice automatically',
              chainsTo: 'SendInvoice',
            },
          ],
          sagas: [],
          valueObjects: [],
          invariants: [],
        },
      ],
      flows: [
        {
          id: 'flow-billing',
          name: 'billing-flow',
          lanes: [],
          moments: [
            {
              id: 'moment-0',
              name: 'Send Invoice',
              contextEntries: [
                { contextId: 'ctx-Billing', nodeName: 'SendInvoice', nodeKind: 'command' as const },
                { contextId: 'ctx-Billing', nodeName: 'InvoiceSent', nodeKind: 'event' as const },
              ],
            },
          ],
          connections: [],
        },
      ],
    });

    const output = renderFeatureFromIr(ir.flows[0], ir);
    expect(output).toContain('@policy:AutoSend');
  });

  it('collects saga tags for entries that match saga triggers', () => {
    const ir = makeIR({
      contexts: [
        {
          id: 'ctx-Shipping',
          name: 'Shipping',
          aggregates: [
            {
              id: 'agg-Shipment',
              name: 'Shipment',
              identityField: { name: 'shipmentId', type: 'UUID', isArray: false, required: true },
              commands: [],
              events: [{ id: 'evt-ShipmentCreated', name: 'ShipmentCreated', fields: [] }],
              valueObjects: [],
              invariants: [],
            },
          ],
          domainServices: [],
          commands: [],
          events: [{ id: 'evt-ShipmentCreated', name: 'ShipmentCreated', fields: [] }],
          policies: [],
          sagas: [
            {
              id: 'saga-ShipmentTracking',
              name: 'ShipmentTracking',
              trigger: 'ShipmentCreated',
              states: ['Created', 'InTransit', 'Delivered'],
              compensation: 'ReturnShipment',
              timeout: '7 days',
            },
          ],
          valueObjects: [],
          invariants: [],
        },
      ],
      flows: [
        {
          id: 'flow-ship',
          name: 'shipping-flow',
          lanes: [],
          moments: [
            {
              id: 'moment-0',
              name: 'Create Shipment',
              contextEntries: [
                {
                  contextId: 'ctx-Shipping',
                  nodeName: 'ShipmentCreated',
                  nodeKind: 'event' as const,
                },
              ],
            },
          ],
          connections: [],
        },
      ],
    });

    const output = renderFeatureFromIr(ir.flows[0], ir);
    expect(output).toContain('@saga:ShipmentTracking');
  });

  it('collects invariant tags for matching aggregate scopes', () => {
    const ir = makeIR({
      contexts: [
        {
          id: 'ctx-Inventory',
          name: 'Inventory',
          aggregates: [
            {
              id: 'agg-Stock',
              name: 'Stock',
              identityField: { name: 'stockId', type: 'UUID', isArray: false, required: true },
              commands: [
                {
                  id: 'cmd-AdjustStock',
                  name: 'AdjustStock',
                  inputs: [{ name: 'qty', type: 'number', isArray: false, required: true }],
                  preconditions: [],
                  emitsEvent: 'StockAdjusted',
                },
              ],
              events: [{ id: 'evt-StockAdjusted', name: 'StockAdjusted', fields: [] }],
              valueObjects: [],
              invariants: [],
            },
          ],
          domainServices: [],
          commands: [
            {
              id: 'cmd-AdjustStock',
              name: 'AdjustStock',
              inputs: [{ name: 'qty', type: 'number', isArray: false, required: true }],
              preconditions: [],
              emitsEvent: 'StockAdjusted',
            },
          ],
          events: [{ id: 'evt-StockAdjusted', name: 'StockAdjusted', fields: [] }],
          policies: [],
          sagas: [],
          valueObjects: [],
          invariants: [
            { id: 'inv-positive-stock', description: 'Stock cannot go negative', scope: 'Stock' },
          ],
        },
      ],
      flows: [
        {
          id: 'flow-inv',
          name: 'inventory-flow',
          lanes: [],
          moments: [
            {
              id: 'moment-0',
              name: 'Adjust Stock',
              contextEntries: [
                {
                  contextId: 'ctx-Inventory',
                  nodeName: 'AdjustStock',
                  nodeKind: 'command' as const,
                },
                {
                  contextId: 'ctx-Inventory',
                  nodeName: 'StockAdjusted',
                  nodeKind: 'event' as const,
                },
              ],
            },
          ],
          connections: [],
        },
      ],
    });

    const output = renderFeatureFromIr(ir.flows[0], ir);
    expect(output).toContain('@invariant:inv-positive-stock');
    expect(output).toContain('@aggregate:Stock');
  });

  it('renders optional and terminal event modifiers', () => {
    const ir = makeIR({
      contexts: [
        {
          id: 'ctx-Notify',
          name: 'Notify',
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
          id: 'flow-notify',
          name: 'notify-flow',
          lanes: [],
          moments: [
            {
              id: 'moment-0',
              name: 'Send Notification',
              contextEntries: [
                {
                  contextId: 'ctx-Notify',
                  nodeName: 'EmailSent',
                  nodeKind: 'event' as const,
                  optional: true,
                },
              ],
            },
            {
              id: 'moment-1',
              name: 'End Flow',
              contextEntries: [
                {
                  contextId: 'ctx-Notify',
                  nodeName: 'FlowEnded',
                  nodeKind: 'event' as const,
                  terminal: true,
                },
              ],
            },
          ],
          connections: [],
        },
      ],
    });

    const output = renderFeatureFromIr(ir.flows[0], ir);
    expect(output).toContain('Then Notify emits EmailSent (optional)');
    expect(output).toContain('Then Notify emits FlowEnded (terminal)');
  });

  it('collects context IDs from branches for feature tags', () => {
    const ir = makeIR({
      contexts: [
        {
          id: 'ctx-A',
          name: 'ContextA',
          classification: 'Core',
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
          id: 'ctx-B',
          name: 'ContextB',
          classification: 'Supporting',
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
          id: 'flow-multi',
          name: 'multi-ctx-flow',
          lanes: [],
          moments: [
            {
              id: 'moment-0',
              name: 'Multi Context Step',
              contextEntries: [],
              branches: [
                {
                  condition: 'route-A',
                  entries: [{ contextId: 'ctx-A', nodeName: 'EventA', nodeKind: 'event' as const }],
                },
                {
                  condition: 'route-B',
                  entries: [{ contextId: 'ctx-B', nodeName: 'EventB', nodeKind: 'event' as const }],
                },
              ],
            },
          ],
          connections: [],
        },
      ],
    });

    const output = renderFeatureFromIr(ir.flows[0], ir);
    expect(output).toContain('@context:ContextA');
    expect(output).toContain('@context:ContextB');
    expect(output).toContain('@classification:Core');
    expect(output).toContain('@classification:Supporting');
  });

  it('handles context without classification in tags', () => {
    const ir = makeIR({
      contexts: [
        {
          id: 'ctx-Plain',
          name: 'Plain',
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
          id: 'flow-plain',
          name: 'plain-flow',
          lanes: [],
          moments: [
            {
              id: 'moment-0',
              name: 'Step',
              contextEntries: [
                { contextId: 'ctx-Plain', nodeName: 'Evt', nodeKind: 'event' as const },
              ],
            },
          ],
          connections: [],
        },
      ],
    });

    const output = renderFeatureFromIr(ir.flows[0], ir);
    expect(output).toContain('@context:Plain');
    expect(output).not.toContain('@classification');
  });

  it('uses ctxId fallback when context is not in IR', () => {
    const ir = makeIR({
      contexts: [],
      flows: [
        {
          id: 'flow-orphan',
          name: 'orphan-flow',
          lanes: [],
          moments: [
            {
              id: 'moment-0',
              name: 'Orphan Step',
              contextEntries: [
                { contextId: 'ctx-Missing', nodeName: 'SomeEvent', nodeKind: 'event' as const },
              ],
            },
          ],
          connections: [],
        },
      ],
    });

    const output = renderFeatureFromIr(ir.flows[0], ir);
    // Should use fallback: ctxId stripped of 'ctx-' prefix
    expect(output).toContain('Rule: Missing');
    expect(output).toContain('Then Missing emits SomeEvent');
  });

  it('renders Rule with context classification', () => {
    const ir = makeIR({
      contexts: [
        {
          id: 'ctx-Core',
          name: 'CoreCtx',
          classification: 'Core',
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
          id: 'flow-core',
          name: 'core-flow',
          lanes: [],
          moments: [
            {
              id: 'moment-0',
              name: 'Core Step',
              contextEntries: [
                { contextId: 'ctx-Core', nodeName: 'Evt', nodeKind: 'event' as const },
              ],
            },
          ],
          connections: [],
        },
      ],
    });

    const output = renderFeatureFromIr(ir.flows[0], ir);
    expect(output).toContain('Rule: CoreCtx [Core]');
  });

  it('renders trigger step for triggered-by connections, promoted to Given when leading', () => {
    const ir = makeBasicIR();
    const output = renderFeatureFromIr(ir.flows[0], ir);
    // conn-1 is a triggered-by from moment-1-Fulfillment, eventId: evt-OrderPlaced.
    // It is the scenario's first step, so the leading And is promoted to Given.
    expect(output).toContain('Given OrderPlaced has occurred');
  });

  it('never emits a scenario whose first step is And', () => {
    const ir = makeBasicIR();
    const output = renderFeatureFromIr(ir.flows[0], ir);
    const scenarios = output.split(/Scenario: [^\n]*\n/).slice(1);
    for (const scenario of scenarios) {
      const firstStep = scenario
        .split('\n')
        .map((l) => l.trim())
        .find((l) => /^(Given|When|Then|And) /.test(l));
      if (firstStep) {
        expect(firstStep.startsWith('And ')).toBe(false);
      }
    }
  });

  it('attributes triggered-by to the node carrying the annotation, not moment membership', () => {
    const ir = makeBasicIR();
    // Give the connection explicit endpoints: the annotation is carried by
    // InitiateFulfillment. OrderPlaced lives in moment-0 but must not pick it up.
    ir.flows[0].connections = [
      {
        id: 'conn-1',
        sourceMomentId: 'moment-1-Fulfillment',
        targetContextId: 'ctx-Fulfillment',
        eventId: 'evt-OrderPlaced',
        sourceNodeName: 'OrderPlaced',
        targetNodeName: 'InitiateFulfillment',
        connectionType: 'triggered-by' as const,
      },
    ];
    const output = renderFeatureFromIr(ir.flows[0], ir);
    const fulfillment = output.slice(output.indexOf('Scenario: Fulfillment initiation'));
    expect(fulfillment).toContain('OrderPlaced has occurred');
    // The trigger must not leak into the Order submission scenario
    const orderSubmission = output.slice(
      output.indexOf('Scenario: Order submission'),
      output.indexOf('Rule: Fulfillment'),
    );
    expect(orderSubmission).not.toContain('has occurred');
  });

  it('renders each crossing of a multi-target event with its own contract', () => {
    const ir = makeBasicIR();
    const flow = ir.flows[0];
    // OrderPlaced crosses to Fulfillment from moment-0 and (hypothetically)
    // to Ordering itself from moment-1 with a different contract.
    flow.moments[1].contextEntries.push({
      contextId: 'ctx-Ordering',
      nodeName: 'OrderPlaced',
      nodeKind: 'event',
    });
    flow.connections = [
      {
        id: 'conn-0',
        sourceMomentId: 'moment-0-Order-submission',
        targetContextId: 'ctx-Fulfillment',
        eventId: 'evt-OrderPlaced',
        sourceNodeName: 'OrderPlaced',
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
        id: 'conn-2',
        sourceMomentId: 'moment-1-Fulfillment',
        targetContextId: 'ctx-Ordering',
        eventId: 'evt-OrderPlaced',
        sourceNodeName: 'OrderPlaced',
        connectionType: 'crosses-to' as const,
        schemaContract: {
          eventType: 'OrderPlaced',
          fields: [{ name: 'confirmationId', type: 'UUID', required: true }],
          relationshipType: 'Partnership',
        },
      },
    ];

    const output = renderFeatureFromIr(flow, ir);
    // Each mention resolves to the crossing declared in its own moment
    expect(output).toContain('Then OrderPlaced crosses to Fulfillment via CustomerSupplier');
    expect(output).toContain('Then OrderPlaced crosses to Ordering via Partnership');
    expect(output).toContain('| orderId | items |');
    expect(output).toContain('| confirmationId |');
    // The first contract must not be repeated for the second mention
    const fulfillmentScenario = output.slice(output.indexOf('Scenario: Fulfillment initiation'));
    expect(fulfillmentScenario).not.toContain('crosses to Fulfillment');
  });

  it('tags returns-to branches @retry-path and renders the loop step', () => {
    const ir = makeIR({
      contexts: [],
      flows: [
        {
          id: 'flow-loop',
          name: 'loop-flow',
          lanes: [],
          moments: [
            {
              id: 'moment-0-Start',
              name: 'M1 · A request arrives',
              contextEntries: [
                { contextId: 'messaging', nodeName: 'InboundRecorded', nodeKind: 'event' as const },
              ],
            },
            {
              id: 'moment-1-Throttle',
              name: 'Cold sender throttled',
              contextEntries: [],
              branches: [
                {
                  condition: 'SenderWarmOrActive',
                  entries: [
                    {
                      contextId: 'messaging',
                      nodeName: 'ThrottleExempt',
                      nodeKind: 'event' as const,
                    },
                  ],
                },
                {
                  condition: 'ColdSenderThrottled',
                  entries: [
                    {
                      contextId: 'refusals',
                      nodeName: 'RejectInboundMessage',
                      nodeKind: 'event' as const,
                    },
                    {
                      contextId: 'refusals',
                      nodeName: 'ThrottleNoticeSent',
                      nodeKind: 'event' as const,
                    },
                  ],
                },
              ],
            },
          ],
          connections: [
            {
              id: 'conn-r',
              sourceMomentId: 'moment-1-Throttle',
              targetContextId: 'refusals',
              eventId: 'evt-ThrottleNoticeSent',
              sourceNodeName: 'ThrottleNoticeSent',
              connectionType: 'returns-to' as const,
              targetMomentLabel: 'M1 · A request arrives',
              targetMomentId: 'moment-0-Start',
              branchCondition: 'ColdSenderThrottled',
            },
          ],
        },
      ],
    });

    const output = renderFeatureFromIr(ir.flows[0], ir);
    const retryScenario = output.slice(
      output.indexOf('Scenario: Cold sender throttled [ColdSenderThrottled]') - 200,
    );
    expect(output).toContain('@retry-path');
    expect(output).toContain('Then the flow returns to "M1 · A request arrives"');
    expect(retryScenario).toContain('ThrottleNoticeSent');
    // The non-looping branch is an alternative, not a fabricated happy path
    expect(output).toContain('@alt-path');
    expect(output).not.toContain('@happy-path');
  });

  it('renders event carrying fields', () => {
    const ir = makeBasicIR();
    const output = renderFeatureFromIr(ir.flows[0], ir);
    // FulfillmentInitiated has field reqId
    expect(output).toContain('carrying reqId');
  });
});

describe('saga single-owner rendering', () => {
  // Two flows share the saga-declaring context. Only the flow containing the
  // saga's trigger node may render the synthetic saga scenarios (mirrors the
  // test-suite single-owner rule); with no owning flow, the first flow does.
  function makeTwoFlowIR(triggerInFlow: 'first' | 'second' | 'none'): IntermediateRepresentation {
    const trigger = 'PaymentInitiated';
    const flowNode = (name: string) => ({
      contextId: 'ctx-Payments',
      nodeName: name,
      nodeKind: 'event' as const,
    });

    const flowA: FlowDefinition = {
      id: 'flow-a',
      name: 'flow-a',
      lanes: [],
      moments: [
        {
          id: 'fa-0',
          name: 'Step A',
          contextEntries: [flowNode(triggerInFlow === 'first' ? trigger : 'OtherEventA')],
        },
      ],
      connections: [],
    };
    const flowB: FlowDefinition = {
      id: 'flow-b',
      name: 'flow-b',
      lanes: [],
      moments: [
        {
          id: 'fb-0',
          name: 'Step B',
          contextEntries: [flowNode(triggerInFlow === 'second' ? trigger : 'OtherEventB')],
        },
      ],
      connections: [],
    };

    return makeIR({
      contexts: [
        {
          id: 'ctx-Payments',
          name: 'Payments',
          aggregates: [],
          domainServices: [],
          commands: [],
          events: [{ id: 'evt-PaymentInitiated', name: trigger, fields: [] }],
          policies: [],
          sagas: [
            {
              id: 'saga-PaymentProcess',
              name: 'PaymentProcess',
              trigger,
              states: ['Pending', 'Completed'],
              compensation: 'RefundPayment',
              timeout: '30 minutes',
            },
          ],
          valueObjects: [],
          invariants: [],
        },
      ],
      flows: [flowA, flowB],
    });
  }

  it('renders saga scenarios only in the flow containing the trigger', () => {
    const ir = makeTwoFlowIR('second');

    const featureA = renderFeatureFromIr(ir.flows[0], ir);
    const featureB = renderFeatureFromIr(ir.flows[1], ir);

    expect(featureA).not.toContain('Scenario: PaymentProcess state transitions');
    expect(featureA).not.toContain('Scenario: PaymentProcess compensation');
    expect(featureB).toContain('Scenario: PaymentProcess state transitions');
    expect(featureB).toContain('Scenario: PaymentProcess compensation');
  });

  it('falls back to the first flow when no flow contains the trigger', () => {
    const ir = makeTwoFlowIR('none');

    const featureA = renderFeatureFromIr(ir.flows[0], ir);
    const featureB = renderFeatureFromIr(ir.flows[1], ir);

    expect(featureA).toContain('Scenario: PaymentProcess state transitions');
    expect(featureB).not.toContain('Scenario: PaymentProcess state transitions');
  });

  it('renders fallback-owned sagas under their own Rule when the owning flow never touches the context', () => {
    const ir = makeTwoFlowIR('none');
    // Rewire the first flow to a different context entirely.
    const foreignFlow: FlowDefinition = {
      ...ir.flows[0],
      moments: [
        {
          id: 'fa-0',
          name: 'Foreign step',
          contextEntries: [
            { contextId: 'ctx-Other', nodeName: 'SomethingHappened', nodeKind: 'event' as const },
          ],
        },
      ],
    };
    const rewired = makeIR({ contexts: ir.contexts, flows: [foreignFlow, ir.flows[1]] });

    const featureA = renderFeatureFromIr(rewired.flows[0], rewired);
    const featureB = renderFeatureFromIr(rewired.flows[1], rewired);

    // Owner (first flow) renders the saga under an added Payments Rule.
    expect(featureA).toContain('Rule: Payments');
    expect(featureA).toContain('Scenario: PaymentProcess state transitions');
    // The non-owning flow that DOES touch Payments renders no saga scenarios.
    expect(featureB).not.toContain('Scenario: PaymentProcess state transitions');
  });
});
