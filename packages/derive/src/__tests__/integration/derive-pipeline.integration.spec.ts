import { describe, it, expect } from 'vitest';
import type {
  IntermediateRepresentation,
  FlowDefinition,
  MomentDefinition,
  ConnectionDefinition,
  ContextDefinition,
  SchemaFieldDefinition,
} from '@mmmnt/core';
import { deriveTopology } from '../../engine/derivation-engine.js';

// ---------------------------------------------------------------------------
// Helpers to build IR fixtures in-memory
// ---------------------------------------------------------------------------

function makeMetadata(): IntermediateRepresentation['metadata'] {
  return {
    name: 'integration-test-spec',
    version: '1.0.0',
    description: 'Integration test specification',
    generatedAt: '2026-01-01T00:00:00Z',
  };
}

function makeContext(
  id: string,
  name: string,
  events: ContextDefinition['events'] = [],
): ContextDefinition {
  return {
    id,
    name,
    classification: 'Core',
    aggregates: [],
    domainServices: [],
    commands: [],
    events,
    policies: [],
    sagas: [],
    valueObjects: [],
    invariants: [],
  };
}

function makeMoment(
  id: string,
  name: string,
  contextId: string,
  nodeName: string,
): MomentDefinition {
  return {
    id,
    name,
    contextEntries: [
      {
        contextId,
        nodeName,
        nodeKind: 'command',
      },
    ],
  };
}

function makeCrossingConnection(
  id: string,
  sourceMomentId: string,
  targetContextId: string,
  eventType: string,
  fields: SchemaFieldDefinition[] = [{ name: 'id', type: 'string', required: true }],
  relationshipType = 'Partnership',
): ConnectionDefinition {
  return {
    id,
    sourceMomentId,
    targetContextId,
    eventId: `${eventType}-event`,
    connectionType: 'crosses-to',
    schemaContract: {
      eventType,
      fields,
      relationshipType,
    },
  };
}

function makeTriggeredByConnection(
  id: string,
  sourceMomentId: string,
  targetContextId: string,
  eventId: string,
): ConnectionDefinition {
  return {
    id,
    sourceMomentId,
    targetContextId,
    eventId,
    connectionType: 'triggered-by',
  };
}

function makeFlow(
  id: string,
  name: string,
  moments: MomentDefinition[],
  connections: ConnectionDefinition[],
): FlowDefinition {
  return { id, name, lanes: [], moments, connections };
}

function makeIR(overrides: Partial<IntermediateRepresentation> = {}): IntermediateRepresentation {
  return {
    contexts: overrides.contexts ?? [],
    flows: overrides.flows ?? [],
    glossary: overrides.glossary ?? [],
    relationships: overrides.relationships ?? [],
    metadata: overrides.metadata ?? makeMetadata(),
  };
}

// ---------------------------------------------------------------------------
// Integration tests for the derive pipeline
// ---------------------------------------------------------------------------

describe('Derive Pipeline Integration', () => {
  // -------------------------------------------------------------------------
  // DV-01: Single-flow IR produces exactly one TestSuiteDefinition
  // -------------------------------------------------------------------------
  describe('DV-01: single-flow IR -> one TestSuiteDefinition', () => {
    it('single-flow IR produces topology with exactly one TestSuiteDefinition', () => {
      const ctx = makeContext('ctx-ordering', 'Ordering');
      const moment = makeMoment('fr-place', 'Place Order', 'ctx-ordering', 'PlaceOrder');
      const flow = makeFlow('flow-order', 'Order Flow', [moment], []);
      const ir = makeIR({ contexts: [ctx], flows: [flow] });

      const topology = deriveTopology(ir);

      expect(topology.suites).toHaveLength(1);
      expect(topology.suites[0].flowId).toBe('flow-order');
      expect(topology.suites[0].flowName).toBe('Order Flow');
      expect(topology.suites[0].testCases).toHaveLength(1);
      expect(topology.suites[0].testCases[0].momentId).toBe('fr-place');
      expect(topology.metadata.sourceIrHash).toBeDefined();
      expect(topology.metadata.derivedAt).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // DV-01: Multi-flow IR -> one TestSuiteDefinition per flow
  // -------------------------------------------------------------------------
  describe('DV-01: multi-flow IR -> one TestSuiteDefinition per flow', () => {
    it('multi-flow IR produces one suite per flow with correct flowId and flowName', () => {
      const ctxOrdering = makeContext('ctx-ordering', 'Ordering');
      const ctxShipping = makeContext('ctx-shipping', 'Shipping');
      const ctxBilling = makeContext('ctx-billing', 'Billing');

      const flowOrder = makeFlow(
        'flow-order',
        'Order Processing',
        [makeMoment('fr-o1', 'Place Order', 'ctx-ordering', 'PlaceOrder')],
        [],
      );
      const flowShip = makeFlow(
        'flow-ship',
        'Shipment Handling',
        [makeMoment('fr-s1', 'Ship Order', 'ctx-shipping', 'ShipOrder')],
        [],
      );
      const flowBill = makeFlow(
        'flow-bill',
        'Billing Cycle',
        [makeMoment('fr-b1', 'Generate Invoice', 'ctx-billing', 'GenerateInvoice')],
        [],
      );

      const ir = makeIR({
        contexts: [ctxOrdering, ctxShipping, ctxBilling],
        flows: [flowOrder, flowShip, flowBill],
      });

      const topology = deriveTopology(ir);

      expect(topology.suites).toHaveLength(3);

      const sortedSuites = [...topology.suites].sort((a, b) => a.flowId.localeCompare(b.flowId));

      const suiteIds = sortedSuites.map((s) => s.flowId);
      expect(suiteIds).toEqual(['flow-bill', 'flow-order', 'flow-ship']);

      const suiteNames = sortedSuites.map((s) => s.flowName);
      expect(suiteNames).toEqual(['Billing Cycle', 'Order Processing', 'Shipment Handling']);
    });
  });

  // -------------------------------------------------------------------------
  // DV-02: Flow with crossings -> each crossing produces an AssertionPoint
  // -------------------------------------------------------------------------
  describe('DV-02: crossings -> AssertionPoints', () => {
    it('flow with crossings produces one AssertionPoint per crossing with correct context mapping', () => {
      const ctxOrdering = makeContext('ctx-ordering', 'Ordering');
      const ctxShipping = makeContext('ctx-shipping', 'Shipping');
      const ctxBilling = makeContext('ctx-billing', 'Billing');

      const moment1 = makeMoment('fr-place', 'Place Order', 'ctx-ordering', 'PlaceOrder');
      const moment2 = makeMoment('fr-ship', 'Ship Order', 'ctx-shipping', 'ShipOrder');

      const crossToShipping = makeCrossingConnection(
        'conn-to-ship',
        'fr-place',
        'ctx-shipping',
        'OrderPlaced',
        [
          { name: 'orderId', type: 'string', required: true },
          { name: 'items', type: 'array', required: true },
        ],
      );
      const crossToBilling = makeCrossingConnection(
        'conn-to-bill',
        'fr-place',
        'ctx-billing',
        'OrderPlacedForBilling',
        [{ name: 'orderId', type: 'string', required: true }],
      );
      const crossBackToOrdering = makeCrossingConnection(
        'conn-shipped',
        'fr-ship',
        'ctx-ordering',
        'OrderShipped',
        [{ name: 'trackingId', type: 'string', required: true }],
      );

      const flow = makeFlow(
        'flow-full',
        'Full Order Flow',
        [moment1, moment2],
        [crossToShipping, crossToBilling, crossBackToOrdering],
      );

      const ir = makeIR({
        contexts: [ctxOrdering, ctxShipping, ctxBilling],
        flows: [flow],
      });

      const topology = deriveTopology(ir);

      const allAssertions = topology.suites
        .flatMap((s) => s.testCases)
        .flatMap((tc) => tc.assertions);
      expect(allAssertions).toHaveLength(3);

      // Verify crossing IDs
      const crossingIds = allAssertions.map((a) => a.crossingId);
      expect(crossingIds).toContain('conn-to-ship');
      expect(crossingIds).toContain('conn-to-bill');
      expect(crossingIds).toContain('conn-shipped');

      // Verify source/target context mapping
      const shipAssertion = allAssertions.find((a) => a.crossingId === 'conn-to-ship');
      expect(shipAssertion?.sourceContext).toBe('ctx-ordering');
      expect(shipAssertion?.targetContext).toBe('ctx-shipping');
      expect(shipAssertion?.assertionType).toBe('payload');

      const billAssertion = allAssertions.find((a) => a.crossingId === 'conn-to-bill');
      expect(billAssertion?.sourceContext).toBe('ctx-ordering');
      expect(billAssertion?.targetContext).toBe('ctx-billing');
    });
  });

  // -------------------------------------------------------------------------
  // DV-03: Moment ordering -- test cases match moment temporal ordering
  // -------------------------------------------------------------------------
  describe('DV-03: moment ordering preserved in test cases', () => {
    it('test cases are produced in the same order as moments in the flow', () => {
      const ctx = makeContext('ctx-ordering', 'Ordering');

      const moments: MomentDefinition[] = [
        makeMoment('fr-validate', 'Validate Order', 'ctx-ordering', 'ValidateOrder'),
        makeMoment('fr-reserve', 'Reserve Inventory', 'ctx-ordering', 'ReserveInventory'),
        makeMoment('fr-confirm', 'Confirm Order', 'ctx-ordering', 'ConfirmOrder'),
        makeMoment('fr-notify', 'Notify Customer', 'ctx-ordering', 'NotifyCustomer'),
      ];

      const flow = makeFlow('flow-seq', 'Sequential Order Flow', moments, []);
      const ir = makeIR({ contexts: [ctx], flows: [flow] });

      const topology = deriveTopology(ir);
      const testCases = topology.suites[0].testCases;

      expect(testCases).toHaveLength(4);
      expect(testCases[0].momentId).toBe('fr-validate');
      expect(testCases[0].momentName).toBe('Validate Order');
      expect(testCases[1].momentId).toBe('fr-reserve');
      expect(testCases[1].momentName).toBe('Reserve Inventory');
      expect(testCases[2].momentId).toBe('fr-confirm');
      expect(testCases[2].momentName).toBe('Confirm Order');
      expect(testCases[3].momentId).toBe('fr-notify');
      expect(testCases[3].momentName).toBe('Notify Customer');
    });
  });

  // -------------------------------------------------------------------------
  // DV-04: Schema contract fields in PayloadValidationStep
  // -------------------------------------------------------------------------
  describe('DV-04: schema contract fields -> PayloadValidationStep', () => {
    it('crossing schema contract fields map to FieldConstraint entries in PayloadValidationStep', () => {
      const ctxOrdering = makeContext('ctx-ordering', 'Ordering');
      const ctxFulfillment = makeContext('ctx-fulfillment', 'Fulfillment');

      const moment = makeMoment('fr-place', 'Place Order', 'ctx-ordering', 'PlaceOrder');

      const schemaFields: SchemaFieldDefinition[] = [
        { name: 'orderId', type: 'string', required: true },
        { name: 'customerId', type: 'string', required: true },
        { name: 'totalAmount', type: 'number', required: true },
        { name: 'shippingNotes', type: 'string', required: false },
        { name: 'lineItems', type: 'array', required: true },
      ];

      const crossing = makeCrossingConnection(
        'conn-fulfill',
        'fr-place',
        'ctx-fulfillment',
        'OrderSubmitted',
        schemaFields,
      );

      const flow = makeFlow('flow-fulfill', 'Fulfillment Flow', [moment], [crossing]);

      const ir = makeIR({
        contexts: [ctxOrdering, ctxFulfillment],
        flows: [flow],
      });

      const topology = deriveTopology(ir);

      const assertion = topology.suites[0].testCases[0].assertions[0];
      expect(assertion.schemaContract.eventType).toBe('OrderSubmitted');

      const fields = assertion.schemaContract.expectedFields;
      expect(fields).toHaveLength(5);

      // Verify individual field constraints
      const orderIdField = fields.find((f) => f.fieldName === 'orderId');
      expect(orderIdField?.expectedType).toBe('string');
      expect(orderIdField?.required).toBe(true);

      const totalAmountField = fields.find((f) => f.fieldName === 'totalAmount');
      expect(totalAmountField?.expectedType).toBe('number');
      expect(totalAmountField?.required).toBe(true);

      const shippingNotesField = fields.find((f) => f.fieldName === 'shippingNotes');
      expect(shippingNotesField?.expectedType).toBe('string');
      expect(shippingNotesField?.required).toBe(false);

      const lineItemsField = fields.find((f) => f.fieldName === 'lineItems');
      expect(lineItemsField?.expectedType).toBe('array');
      expect(lineItemsField?.required).toBe(true);

      // Required vs optional count
      const requiredCount = fields.filter((f) => f.required).length;
      const optionalCount = fields.filter((f) => !f.required).length;
      expect(requiredCount).toBe(4);
      expect(optionalCount).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // DV-01 boundary: Flow with no crossings still produces TestSuiteDefinition
  // -------------------------------------------------------------------------
  describe('DV-01 boundary: flow with no crossings', () => {
    it('flow with no crossings still produces a TestSuiteDefinition with test cases and empty assertions', () => {
      const ctx = makeContext('ctx-internal', 'InternalProcessing');

      const moments: MomentDefinition[] = [
        makeMoment('fr-init', 'Initialize', 'ctx-internal', 'Initialize'),
        makeMoment('fr-process', 'Process', 'ctx-internal', 'Process'),
        makeMoment('fr-complete', 'Complete', 'ctx-internal', 'Complete'),
      ];

      // Use a triggered-by connection (not a crossing) to confirm it does not produce assertions
      const triggeredConn = makeTriggeredByConnection(
        'conn-trigger',
        'fr-init',
        'ctx-internal',
        'Initialized-event',
      );

      const flow = makeFlow('flow-internal', 'Internal Processing', moments, [triggeredConn]);
      const ir = makeIR({ contexts: [ctx], flows: [flow] });

      const topology = deriveTopology(ir);

      expect(topology.suites).toHaveLength(1);
      expect(topology.suites[0].flowId).toBe('flow-internal');
      expect(topology.suites[0].flowName).toBe('Internal Processing');

      // 3 moments => 3 test cases
      expect(topology.suites[0].testCases).toHaveLength(3);

      // No crossings => all test cases should have empty assertion arrays
      for (const testCase of topology.suites[0].testCases) {
        expect(testCase.assertions).toHaveLength(0);
        expect(testCase.setupSteps).toHaveLength(0);
      }

      // contextsCovered should still include the context
      expect(topology.suites[0].contextsCovered).toContain('ctx-internal');
    });
  });

  // -------------------------------------------------------------------------
  // Additional: End-to-end multi-context flow with branches and crossings
  // -------------------------------------------------------------------------
  describe('end-to-end: multi-context flow with branches and crossings', () => {
    it('complex flow with branches, crossings, and multiple contexts produces correct topology', () => {
      const ctxOrdering = makeContext('ctx-ordering', 'Ordering');
      const ctxPayment = makeContext('ctx-payment', 'Payment');
      const ctxShipping = makeContext('ctx-shipping', 'Shipping');

      const momentPlace = makeMoment('fr-place', 'Place Order', 'ctx-ordering', 'PlaceOrder');

      const momentBranch: MomentDefinition = {
        id: 'fr-decide',
        name: 'Payment Decision',
        contextEntries: [
          { contextId: 'ctx-ordering', nodeName: 'EvaluatePayment', nodeKind: 'policy' },
        ],
        branches: [
          {
            condition: 'order.total > 500',
            entries: [
              { contextId: 'ctx-ordering', nodeName: 'RequireManualApproval', nodeKind: 'command' },
            ],
          },
          {
            condition: 'order.total <= 500',
            entries: [{ contextId: 'ctx-ordering', nodeName: 'AutoApprove', nodeKind: 'command' }],
          },
        ],
      };

      const momentShip = makeMoment('fr-ship', 'Ship Order', 'ctx-shipping', 'ShipOrder');

      const crossToPayment = makeCrossingConnection(
        'conn-pay',
        'fr-place',
        'ctx-payment',
        'OrderReadyForPayment',
        [
          { name: 'orderId', type: 'string', required: true },
          { name: 'amount', type: 'number', required: true },
        ],
      );

      const crossToShipping = makeCrossingConnection(
        'conn-ship',
        'fr-decide',
        'ctx-shipping',
        'OrderApproved',
        [{ name: 'orderId', type: 'string', required: true }],
      );

      const flow = makeFlow(
        'flow-complex',
        'Complex Order Flow',
        [momentPlace, momentBranch, momentShip],
        [crossToPayment, crossToShipping],
      );

      const ir = makeIR({
        contexts: [ctxOrdering, ctxPayment, ctxShipping],
        flows: [flow],
      });

      const topology = deriveTopology(ir);

      expect(topology.suites).toHaveLength(1);
      const suite = topology.suites[0];

      // momentPlace => 1 test case, momentBranch => 2 (one per branch), momentShip => 1
      expect(suite.testCases).toHaveLength(4);

      // Moment ordering preserved: place first, then branch variants (any order), then ship
      expect(suite.testCases[0].momentId).toBe('fr-place');
      expect(suite.testCases[1].momentId).toBe('fr-decide');
      expect(suite.testCases[2].momentId).toBe('fr-decide');
      expect(suite.testCases[3].momentId).toBe('fr-ship');

      // Both decision variants exist, regardless of internal ordering
      const decideVariants = suite.testCases
        .filter((tc) => tc.momentId === 'fr-decide')
        .map((tc) => tc.variant);
      expect(decideVariants).toHaveLength(2);
      expect(decideVariants).toContain('order.total > 500');
      expect(decideVariants).toContain('order.total <= 500');

      // crossToPayment is on fr-place => assertions on first test case
      expect(suite.testCases[0].assertions).toHaveLength(1);
      expect(suite.testCases[0].assertions[0].crossingId).toBe('conn-pay');

      // crossToShipping is on fr-decide => both branch variants get it
      expect(suite.testCases[1].assertions).toHaveLength(1);
      expect(suite.testCases[1].assertions[0].crossingId).toBe('conn-ship');
      expect(suite.testCases[2].assertions).toHaveLength(1);
      expect(suite.testCases[2].assertions[0].crossingId).toBe('conn-ship');

      // contextsCovered includes all contexts
      expect(suite.contextsCovered).toContain('ctx-ordering');
      expect(suite.contextsCovered).toContain('ctx-payment');
      expect(suite.contextsCovered).toContain('ctx-shipping');

      // Metadata is populated
      expect(topology.metadata.sourceIrHash).toBeTruthy();
      expect(topology.metadata.derivedAt).toBeTruthy();
    });
  });
});
