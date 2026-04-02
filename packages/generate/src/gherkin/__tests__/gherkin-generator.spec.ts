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
              events: [
                { id: 'evt-PaymentInitiated', name: 'PaymentInitiated', fields: [] },
              ],
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
          moments: [
            {
              id: 'moment-0',
              name: 'Payment step',
              contextEntries: [
                { contextId: 'ctx-Payments', nodeName: 'PaymentInitiated', nodeKind: 'event' as const },
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
              events: [
                { id: 'evt-LoggedIn', name: 'LoggedIn', fields: [] },
              ],
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
                    { contextId: 'ctx-Auth', nodeName: 'Rejected', nodeKind: 'event' as const, terminal: true },
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
    // Should find the precondition from the non-terminal sibling
    expect(output).toContain('When accountActive is not satisfied');
    expect(output).toContain('Then the flow terminates because Account is active');

    // The success branch should have @happy-path
    expect(output).toContain('Scenario: Authentication [success]');
    expect(output).toContain('@happy-path');
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
                    { contextId: 'ctx-Proc', nodeName: 'FailedEvent', nodeKind: 'event' as const, terminal: true },
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
                    { contextId: 'ctx-Order', nodeName: 'OrderReceived', nodeKind: 'event' as const },
                  ],
                },
                {
                  condition: 'invalid',
                  entries: [
                    { contextId: 'ctx-Order', nodeName: 'OrderRejected', nodeKind: 'event' as const, terminal: true },
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
          moments: [
            {
              id: 'moment-0',
              name: 'Create Shipment',
              contextEntries: [
                { contextId: 'ctx-Shipping', nodeName: 'ShipmentCreated', nodeKind: 'event' as const },
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
          moments: [
            {
              id: 'moment-0',
              name: 'Adjust Stock',
              contextEntries: [
                { contextId: 'ctx-Inventory', nodeName: 'AdjustStock', nodeKind: 'command' as const },
                { contextId: 'ctx-Inventory', nodeName: 'StockAdjusted', nodeKind: 'event' as const },
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
          moments: [
            {
              id: 'moment-0',
              name: 'Send Notification',
              contextEntries: [
                { contextId: 'ctx-Notify', nodeName: 'EmailSent', nodeKind: 'event' as const, optional: true },
              ],
            },
            {
              id: 'moment-1',
              name: 'End Flow',
              contextEntries: [
                { contextId: 'ctx-Notify', nodeName: 'FlowEnded', nodeKind: 'event' as const, terminal: true },
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
          moments: [
            {
              id: 'moment-0',
              name: 'Multi Context Step',
              contextEntries: [],
              branches: [
                {
                  condition: 'route-A',
                  entries: [
                    { contextId: 'ctx-A', nodeName: 'EventA', nodeKind: 'event' as const },
                  ],
                },
                {
                  condition: 'route-B',
                  entries: [
                    { contextId: 'ctx-B', nodeName: 'EventB', nodeKind: 'event' as const },
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

  it('renders "And trigger has occurred" for triggered-by connections', () => {
    const ir = makeBasicIR();
    const output = renderFeatureFromIr(ir.flows[0], ir);
    // conn-1 is a triggered-by from moment-1-Fulfillment, eventId: evt-OrderPlaced
    expect(output).toContain('And OrderPlaced has occurred');
  });

  it('renders event carrying fields', () => {
    const ir = makeBasicIR();
    const output = renderFeatureFromIr(ir.flows[0], ir);
    // FulfillmentInitiated has field reqId
    expect(output).toContain('carrying reqId');
  });
});
