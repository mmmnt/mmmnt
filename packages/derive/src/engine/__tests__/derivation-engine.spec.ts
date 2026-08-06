import { describe, it, expect } from 'vitest';
import type {
  IntermediateRepresentation,
  FlowDefinition,
  MomentDefinition,
  ConnectionDefinition,
  ContextDefinition,
  SchemaContract,
} from '@mmmnt/core';
import { deriveTopology } from '../derivation-engine.js';

// ---------------------------------------------------------------------------
// Helpers to build IR fixtures in-memory
// ---------------------------------------------------------------------------

function makeMetadata() {
  return {
    name: 'test-spec',
    version: '1.0.0',
    description: 'Test specification',
    generatedAt: '2026-01-01T00:00:00Z',
  };
}

function makeEvent(
  id: string,
  eventName: string,
): {
  id: string;
  name: string;
  fields: Array<{ name: string; type: string; isArray: boolean; required: boolean }>;
} {
  return {
    id,
    name: eventName,
    fields: [{ name: 'id', type: 'string', isArray: false, required: true }],
  };
}

function makeContext(
  id: string,
  name: string,
  events: Array<{
    id: string;
    name: string;
    fields: Array<{ name: string; type: string; isArray: boolean; required: boolean }>;
  }> = [],
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
  fields: SchemaContract['fields'] = [{ name: 'id', type: 'string', required: true }],
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
// Tests
// ---------------------------------------------------------------------------

describe('DerivationEngine', () => {
  // -----------------------------------------------------------------------
  // DV-01: One TestSuiteDefinition per flow
  // -----------------------------------------------------------------------
  describe('DV-01', () => {
    it('IR with 3 flows produces topology with 3 suites', () => {
      const ctx = makeContext('ctx-1', 'Ordering');
      const flows = [
        makeFlow('f1', 'Flow A', [makeMoment('fr1', 'Moment 1', 'ctx-1', 'PlaceOrder')], []),
        makeFlow('f2', 'Flow B', [makeMoment('fr2', 'Moment 2', 'ctx-1', 'ShipOrder')], []),
        makeFlow('f3', 'Flow C', [makeMoment('fr3', 'Moment 3', 'ctx-1', 'CancelOrder')], []),
      ];
      const ir = makeIR({ contexts: [ctx], flows });

      const topology = deriveTopology(ir);

      expect(topology.suites).toHaveLength(3);
    });

    it('IR with 0 flows produces empty topology', () => {
      const ir = makeIR({ flows: [] });

      const topology = deriveTopology(ir);

      expect(topology.suites).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // DV-02: One AssertionPoint per crossing
  // -----------------------------------------------------------------------
  describe('DV-02', () => {
    it('flow with 2 crossings in separate moments produces 2 assertion points total', () => {
      const ctx1 = makeContext('ctx-1', 'Ordering', [
        makeEvent('OrderShipped-event', 'OrderShipped'),
      ]);
      const ctx2 = makeContext('ctx-2', 'Shipping', [
        makeEvent('OrderPlaced-event', 'OrderPlaced'),
      ]);
      const moment1 = makeMoment('fr1', 'Moment 1', 'ctx-1', 'PlaceOrder');
      const moment2 = makeMoment('fr2', 'Moment 2', 'ctx-2', 'ShipOrder');
      const conn1 = makeCrossingConnection('c1', 'fr1', 'ctx-2', 'OrderPlaced');
      const conn2 = makeCrossingConnection('c2', 'fr2', 'ctx-1', 'OrderShipped');
      const flow = makeFlow('f1', 'Order Flow', [moment1, moment2], [conn1, conn2]);
      const ir = makeIR({ contexts: [ctx1, ctx2], flows: [flow] });

      const topology = deriveTopology(ir);

      const allAssertions = topology.suites
        .flatMap((s) => s.testCases)
        .flatMap((tc) => tc.assertions);
      expect(allAssertions).toHaveLength(2);
    });
  });

  // -----------------------------------------------------------------------
  // DV-03: TestCaseDefinitions ordered by moment position
  // -----------------------------------------------------------------------
  describe('DV-03', () => {
    it('multi-moment flow produces TestCaseDefinitions ordered by moment position', () => {
      const ctx = makeContext('ctx-1', 'Ordering');
      const moments = [
        makeMoment('fr1', 'First Moment', 'ctx-1', 'Step1'),
        makeMoment('fr2', 'Second Moment', 'ctx-1', 'Step2'),
        makeMoment('fr3', 'Third Moment', 'ctx-1', 'Step3'),
      ];
      const flow = makeFlow('f1', 'Sequence Flow', moments, []);
      const ir = makeIR({ contexts: [ctx], flows: [flow] });

      const topology = deriveTopology(ir);

      const suite = topology.suites[0];
      expect(suite.testCases[0].momentId).toBe('fr1');
      expect(suite.testCases[1].momentId).toBe('fr2');
      expect(suite.testCases[2].momentId).toBe('fr3');
    });
  });

  // -----------------------------------------------------------------------
  // DV-04: Schema contract -> FieldConstraint entries
  // -----------------------------------------------------------------------
  describe('DV-04', () => {
    it('crossing with schema contract maps required fields to FieldConstraint entries', () => {
      const ctx1 = makeContext('ctx-1', 'Ordering');
      const ctx2 = makeContext('ctx-2', 'Billing', [makeEvent('OrderPlaced-event', 'OrderPlaced')]);
      const moment = makeMoment('fr1', 'Moment 1', 'ctx-1', 'PlaceOrder');
      const conn = makeCrossingConnection('c1', 'fr1', 'ctx-2', 'OrderPlaced', [
        { name: 'orderId', type: 'string', required: true },
        { name: 'amount', type: 'number', required: true },
      ]);
      const flow = makeFlow('f1', 'Billing Flow', [moment], [conn]);
      const ir = makeIR({ contexts: [ctx1, ctx2], flows: [flow] });

      const topology = deriveTopology(ir);

      const assertions = topology.suites[0].testCases[0].assertions;
      expect(assertions).toHaveLength(1);
      const fieldConstraints = assertions[0].schemaContract.expectedFields;
      expect(fieldConstraints).toHaveLength(2);
      expect(fieldConstraints[0].fieldName).toBe('orderId');
      expect(fieldConstraints[0].required).toBe(true);
      expect(fieldConstraints[1].fieldName).toBe('amount');
      expect(fieldConstraints[1].required).toBe(true);
    });

    it('crossing with minimal single-field contract produces one FieldConstraint', () => {
      const ctx1 = makeContext('ctx-1', 'Ordering');
      const ctx2 = makeContext('ctx-2', 'Shipping', [
        makeEvent('OrderPlaced-event', 'OrderPlaced'),
      ]);
      const moment = makeMoment('fr1', 'Moment 1', 'ctx-1', 'PlaceOrder');
      const conn = makeCrossingConnection('c1', 'fr1', 'ctx-2', 'OrderPlaced', [
        { name: 'orderId', type: 'string', required: true },
      ]);
      const flow = makeFlow('f1', 'Minimal-Contract Flow', [moment], [conn]);
      const ir = makeIR({ contexts: [ctx1, ctx2], flows: [flow] });

      const topology = deriveTopology(ir);

      const assertions = topology.suites[0].testCases[0].assertions;
      expect(assertions).toHaveLength(1);
      expect(assertions[0].schemaContract.expectedFields).toHaveLength(1);
      expect(assertions[0].schemaContract.expectedFields[0].fieldName).toBe('orderId');
    });
  });

  // -----------------------------------------------------------------------
  // deriveTopology operation tests
  // -----------------------------------------------------------------------
  describe('deriveTopology', () => {
    it('single flow, 2 lanes, 2 moments, 1 crossing produces 1 suite, 2 cases, 1 assertion point', () => {
      const ctx1 = makeContext('ctx-1', 'Sales');
      const ctx2 = makeContext('ctx-2', 'Fulfillment', [
        makeEvent('OrderAccepted-event', 'OrderAccepted'),
      ]);
      const moment1 = makeMoment('fr1', 'Accept Order', 'ctx-1', 'AcceptOrder');
      const moment2 = makeMoment('fr2', 'Fulfill Order', 'ctx-2', 'FulfillOrder');
      const conn = makeCrossingConnection('c1', 'fr1', 'ctx-2', 'OrderAccepted');
      const flow = makeFlow('f1', 'Sales Flow', [moment1, moment2], [conn]);
      const ir = makeIR({ contexts: [ctx1, ctx2], flows: [flow] });

      const topology = deriveTopology(ir);

      expect(topology.suites).toHaveLength(1);
      expect(topology.suites[0].testCases).toHaveLength(2);
      const allAssertions = topology.suites[0].testCases.flatMap((tc) => tc.assertions);
      expect(allAssertions).toHaveLength(1);
    });

    it('multiple flows produce one suite per flow with correct flowId and flowName', () => {
      const ctx = makeContext('ctx-1', 'Ordering');
      const flowA = makeFlow('fa', 'Alpha', [makeMoment('fr1', 'F1', 'ctx-1', 'Cmd1')], []);
      const flowB = makeFlow('fb', 'Beta', [makeMoment('fr2', 'F2', 'ctx-1', 'Cmd2')], []);
      const ir = makeIR({ contexts: [ctx], flows: [flowA, flowB] });

      const topology = deriveTopology(ir);

      expect(topology.suites).toHaveLength(2);
      expect(topology.suites[0].flowId).toBe('fa');
      expect(topology.suites[0].flowName).toBe('Alpha');
      expect(topology.suites[1].flowId).toBe('fb');
      expect(topology.suites[1].flowName).toBe('Beta');
    });

    it('flow with no crossings produces suite with test cases and empty assertion lists', () => {
      const ctx = makeContext('ctx-1', 'Ordering');
      const moment = makeMoment('fr1', 'Moment 1', 'ctx-1', 'PlaceOrder');
      const flow = makeFlow('f1', 'No Crossing Flow', [moment], []);
      const ir = makeIR({ contexts: [ctx], flows: [flow] });

      const topology = deriveTopology(ir);

      expect(topology.suites).toHaveLength(1);
      expect(topology.suites[0].testCases).toHaveLength(1);
      expect(topology.suites[0].testCases[0].assertions).toHaveLength(0);
    });

    it('flow with 3 moments produces 3 test cases', () => {
      const ctx = makeContext('ctx-1', 'Ordering');
      const moments = [
        makeMoment('fr1', 'Step 1', 'ctx-1', 'Cmd1'),
        makeMoment('fr2', 'Step 2', 'ctx-1', 'Cmd2'),
        makeMoment('fr3', 'Step 3', 'ctx-1', 'Cmd3'),
      ];
      const flow = makeFlow('f1', 'Three-Step Flow', moments, []);
      const ir = makeIR({ contexts: [ctx], flows: [flow] });

      const topology = deriveTopology(ir);

      expect(topology.suites[0].testCases).toHaveLength(3);
    });

    it('moment with multiple crossings produces multiple assertion points in that test case', () => {
      const ctx1 = makeContext('ctx-1', 'Ordering');
      const ctx2 = makeContext('ctx-2', 'Billing', [makeEvent('OrderPlaced-event', 'OrderPlaced')]);
      const ctx3 = makeContext('ctx-3', 'Shipping', [
        makeEvent('OrderPlaced-event', 'OrderPlaced'),
      ]);
      const moment = makeMoment('fr1', 'Multi-Cross Moment', 'ctx-1', 'PlaceOrder');
      const conn1 = makeCrossingConnection('c1', 'fr1', 'ctx-2', 'OrderPlaced');
      const conn2 = makeCrossingConnection('c2', 'fr1', 'ctx-3', 'OrderPlaced');
      const flow = makeFlow('f1', 'Multi-Cross Flow', [moment], [conn1, conn2]);
      const ir = makeIR({ contexts: [ctx1, ctx2, ctx3], flows: [flow] });

      const topology = deriveTopology(ir);

      const testCase = topology.suites[0].testCases[0];
      expect(testCase.assertions).toHaveLength(2);
    });
  });

  // -----------------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------------
  describe('edge cases', () => {
    it('empty IR (no contexts, no flows) produces empty topology', () => {
      const ir = makeIR({ contexts: [], flows: [] });

      const topology = deriveTopology(ir);

      expect(topology.suites).toHaveLength(0);
    });

    it('IR with contexts but no flows produces empty topology', () => {
      const ctx = makeContext('ctx-1', 'Ordering');
      const ir = makeIR({ contexts: [ctx], flows: [] });

      const topology = deriveTopology(ir);

      expect(topology.suites).toHaveLength(0);
    });

    it('branch moment produces test cases for both branch paths', () => {
      const ctx = makeContext('ctx-1', 'Ordering');
      const branchMoment: MomentDefinition = {
        id: 'fr-branch',
        name: 'Decision Moment',
        contextEntries: [{ contextId: 'ctx-1', nodeName: 'EvaluateOrder', nodeKind: 'command' }],
        branches: [
          {
            condition: 'order.amount > 100',
            entries: [{ contextId: 'ctx-1', nodeName: 'ApproveHighValue', nodeKind: 'command' }],
          },
          {
            condition: 'order.amount <= 100',
            entries: [{ contextId: 'ctx-1', nodeName: 'AutoApprove', nodeKind: 'command' }],
          },
        ],
      };
      const flow = makeFlow('f1', 'Branch Flow', [branchMoment], []);
      const ir = makeIR({ contexts: [ctx], flows: [flow] });

      const topology = deriveTopology(ir);

      const testCases = topology.suites[0].testCases;
      expect(testCases.length).toBeGreaterThanOrEqual(2);
    });

    it('partnership relationship sets correct sourceContext and targetContext on assertion point', () => {
      const ctx1 = makeContext('ctx-1', 'Ordering');
      const ctx2 = makeContext('ctx-2', 'Shipping', [
        makeEvent('OrderPlaced-event', 'OrderPlaced'),
      ]);
      const moment = makeMoment('fr1', 'Moment 1', 'ctx-1', 'PlaceOrder');
      const conn = makeCrossingConnection(
        'c1',
        'fr1',
        'ctx-2',
        'OrderPlaced',
        [{ name: 'orderId', type: 'string', required: true }],
        'Partnership',
      );
      const flow = makeFlow('f1', 'Partner Flow', [moment], [conn]);
      const ir = makeIR({
        contexts: [ctx1, ctx2],
        flows: [flow],
        relationships: [
          {
            sourceContextId: 'ctx-1',
            targetContextId: 'ctx-2',
            relationshipType: 'Partnership',
            contract: 'OrderPlaced',
          },
        ],
      });

      const topology = deriveTopology(ir);

      const assertion = topology.suites[0].testCases[0].assertions[0];
      expect(assertion.sourceContext).toBe('ctx-1');
      expect(assertion.targetContext).toBe('ctx-2');
    });

    it('customer-supplier relationship correctly identifies contexts on assertion point', () => {
      const ctx1 = makeContext('ctx-supplier', 'Inventory');
      const ctx2 = makeContext('ctx-customer', 'Ordering', [
        makeEvent('StockReserved-event', 'StockReserved'),
      ]);
      const moment = makeMoment('fr1', 'Moment 1', 'ctx-supplier', 'ReserveStock');
      const conn = makeCrossingConnection(
        'c1',
        'fr1',
        'ctx-customer',
        'StockReserved',
        [{ name: 'sku', type: 'string', required: true }],
        'CustomerSupplier',
      );
      const flow = makeFlow('f1', 'Supplier Flow', [moment], [conn]);
      const ir = makeIR({
        contexts: [ctx1, ctx2],
        flows: [flow],
        relationships: [
          {
            sourceContextId: 'ctx-supplier',
            targetContextId: 'ctx-customer',
            relationshipType: 'CustomerSupplier',
            contract: 'StockReserved',
          },
        ],
      });

      const topology = deriveTopology(ir);

      const assertion = topology.suites[0].testCases[0].assertions[0];
      expect(assertion.sourceContext).toBe('ctx-supplier');
      expect(assertion.targetContext).toBe('ctx-customer');
    });

    it('crossing with required and optional fields maps both to FieldConstraint entries', () => {
      const ctx1 = makeContext('ctx-1', 'Ordering');
      const ctx2 = makeContext('ctx-2', 'Notification', [
        makeEvent('OrderPlaced-event', 'OrderPlaced'),
      ]);
      const moment = makeMoment('fr1', 'Moment 1', 'ctx-1', 'PlaceOrder');
      const conn = makeCrossingConnection('c1', 'fr1', 'ctx-2', 'OrderPlaced', [
        { name: 'orderId', type: 'string', required: true },
        { name: 'customerEmail', type: 'string', required: true },
        { name: 'notes', type: 'string', required: false },
      ]);
      const flow = makeFlow('f1', 'Mixed Fields Flow', [moment], [conn]);
      const ir = makeIR({ contexts: [ctx1, ctx2], flows: [flow] });

      const topology = deriveTopology(ir);

      const fields = topology.suites[0].testCases[0].assertions[0].schemaContract.expectedFields;
      expect(fields).toHaveLength(3);
      const requiredFields = fields.filter((f) => f.required);
      const optionalFields = fields.filter((f) => !f.required);
      expect(requiredFields).toHaveLength(2);
      expect(optionalFields).toHaveLength(1);
      expect(optionalFields[0].fieldName).toBe('notes');
    });

    it('topology metadata includes sourceIrHash and derivedAt', () => {
      const ir = makeIR({ flows: [] });

      const topology = deriveTopology(ir);

      expect(topology.metadata.sourceIrHash).toBeDefined();
      expect(typeof topology.metadata.sourceIrHash).toBe('string');
      expect(topology.metadata.sourceIrHash.length).toBeGreaterThan(0);
      expect(topology.metadata.derivedAt).toBeDefined();
      expect(typeof topology.metadata.derivedAt).toBe('string');
    });

    it('multi-context moment resolves source as non-target context', () => {
      const ctx1 = makeContext('ctx-1', 'Ordering', [
        makeEvent('OrderPlaced-event', 'OrderPlaced'),
      ]);
      const ctx2 = makeContext('ctx-2', 'Shipping', [
        makeEvent('OrderPlaced-event', 'OrderPlaced'),
      ]);
      const moment: MomentDefinition = {
        id: 'fr1',
        name: 'Multi-Context Moment',
        contextEntries: [
          { contextId: 'ctx-1', nodeName: 'PlaceOrder', nodeKind: 'command' },
          { contextId: 'ctx-2', nodeName: 'ReceiveOrder', nodeKind: 'event' },
        ],
      };
      const conn = makeCrossingConnection('c1', 'fr1', 'ctx-2', 'OrderPlaced');
      const flow = makeFlow('f1', 'Multi-Ctx Flow', [moment], [conn]);
      const ir = makeIR({ contexts: [ctx1, ctx2], flows: [flow] });

      const topology = deriveTopology(ir);

      const assertion = topology.suites[0].testCases[0].assertions[0];
      expect(assertion.sourceContext).toBe('ctx-1');
      expect(assertion.targetContext).toBe('ctx-2');
    });

    it('moment with empty contextEntries but branch entries resolves source from branches', () => {
      const ctx1 = makeContext('ctx-1', 'Ordering', [
        makeEvent('OrderPlaced-event', 'OrderPlaced'),
      ]);
      const ctx2 = makeContext('ctx-2', 'Shipping', [
        makeEvent('OrderPlaced-event', 'OrderPlaced'),
      ]);
      const moment: MomentDefinition = {
        id: 'fr1',
        name: 'Branch-Only Moment',
        contextEntries: [],
        branches: [
          {
            condition: 'always',
            entries: [{ contextId: 'ctx-1', nodeName: 'PlaceOrder', nodeKind: 'command' }],
          },
        ],
      };
      const conn = makeCrossingConnection('c1', 'fr1', 'ctx-2', 'OrderPlaced');
      const flow = makeFlow('f1', 'Branch Entry Flow', [moment], [conn]);
      const ir = makeIR({ contexts: [ctx1, ctx2], flows: [flow] });

      const topology = deriveTopology(ir);

      const assertion = topology.suites[0].testCases[0].assertions[0];
      expect(assertion.sourceContext).toBe('ctx-1');
    });

    it('single-context moment returns that context as source', () => {
      const ctx1 = makeContext('ctx-1', 'Ordering');
      const ctx2 = makeContext('ctx-2', 'Fulfillment', [
        makeEvent('OrderPlaced-event', 'OrderPlaced'),
      ]);
      const moment = makeMoment('fr1', 'Single Context', 'ctx-1', 'PlaceOrder');
      const conn = makeCrossingConnection('c1', 'fr1', 'ctx-2', 'OrderPlaced');
      const flow = makeFlow('f1', 'Single Ctx Flow', [moment], [conn]);
      const ir = makeIR({ contexts: [ctx1, ctx2], flows: [flow] });

      const topology = deriveTopology(ir);

      expect(topology.suites[0].testCases[0].assertions[0].sourceContext).toBe('ctx-1');
    });
  });

  // -----------------------------------------------------------------------
  // Saga test cases
  // -----------------------------------------------------------------------
  describe('saga test cases', () => {
    it('context with a saga produces init, transition, and compensation test cases', () => {
      const ctx: ContextDefinition = {
        ...makeContext('ctx-1', 'Ordering'),
        sagas: [
          {
            id: 'saga-1',
            name: 'OrderFulfillment',
            trigger: 'OrderPlaced',
            states: ['Pending', 'Processing', 'Completed'],
            compensation: 'CancelOrder',
            timeout: '30m',
          },
        ],
      };
      const moment = makeMoment('fr1', 'Place Order', 'ctx-1', 'PlaceOrder');
      const flow = makeFlow('f1', 'Order Flow', [moment], []);
      const ir = makeIR({ contexts: [ctx], flows: [flow] });

      const topology = deriveTopology(ir);

      const sagaCases = topology.suites[0].testCases.filter((tc) =>
        tc.momentId.startsWith('saga-'),
      );
      // init + 2 transitions (Pending→Processing, Processing→Completed) + compensation = 4
      expect(sagaCases).toHaveLength(4);

      // Init case
      const initCase = sagaCases.find((tc) => tc.momentId === 'saga-OrderFulfillment-initiated');
      expect(initCase).toBeDefined();
      expect(initCase!.assertions[0].assertionType).toBe('saga');
      expect(initCase!.assertions[0].schemaContract.eventType).toBe('OrderPlaced');

      // Transition cases
      const transCase1 = sagaCases.find(
        (tc) => tc.momentId === 'saga-OrderFulfillment-Pending-to-Processing',
      );
      expect(transCase1).toBeDefined();
      expect(transCase1!.assertions[0].schemaContract.eventType).toBe(
        'OrderFulfillment.Processing',
      );

      const transCase2 = sagaCases.find(
        (tc) => tc.momentId === 'saga-OrderFulfillment-Processing-to-Completed',
      );
      expect(transCase2).toBeDefined();
      expect(transCase2!.assertions[0].schemaContract.eventType).toBe('OrderFulfillment.Completed');

      // Compensation case
      const compCase = sagaCases.find((tc) => tc.momentId === 'saga-OrderFulfillment-compensation');
      expect(compCase).toBeDefined();
      expect(compCase!.assertions[0].schemaContract.eventType).toBe('OrderFulfillment.Compensated');
      expect(compCase!.setupSteps[0].precondition).toBe('CancelOrder');
    });

    it('emits saga cases once, into the flow containing the trigger, not every flow', () => {
      const ctx: ContextDefinition = {
        ...makeContext('ctx-1', 'Ordering'),
        sagas: [
          {
            id: 'saga-1',
            name: 'OrderFulfillment',
            trigger: 'OrderPlaced',
            states: ['Pending', 'Completed'],
            compensation: 'CancelOrder',
            timeout: '30m',
          },
        ],
      };
      // OrderPlaced only appears in the second flow
      const flowA = makeFlow('fa', 'Flow A', [makeMoment('fr1', 'M1', 'ctx-1', 'DoThing')], []);
      const flowB = makeFlow('fb', 'Flow B', [makeMoment('fr2', 'M2', 'ctx-1', 'OrderPlaced')], []);
      const ir = makeIR({ contexts: [ctx], flows: [flowA, flowB] });

      const topology = deriveTopology(ir);

      const sagaCasesA = topology.suites[0].testCases.filter((tc) =>
        tc.momentId.startsWith('saga-'),
      );
      const sagaCasesB = topology.suites[1].testCases.filter((tc) =>
        tc.momentId.startsWith('saga-'),
      );
      expect(sagaCasesA).toHaveLength(0);
      expect(sagaCasesB.length).toBeGreaterThan(0);
    });

    it('falls back to the first flow when no flow contains the saga trigger', () => {
      const ctx: ContextDefinition = {
        ...makeContext('ctx-1', 'Ordering'),
        sagas: [
          {
            id: 'saga-1',
            name: 'OrderFulfillment',
            trigger: 'NeverEmitted',
            states: ['Pending', 'Completed'],
            compensation: 'CancelOrder',
            timeout: '30m',
          },
        ],
      };
      const flowA = makeFlow('fa', 'Flow A', [makeMoment('fr1', 'M1', 'ctx-1', 'DoThing')], []);
      const flowB = makeFlow('fb', 'Flow B', [makeMoment('fr2', 'M2', 'ctx-1', 'DoOther')], []);
      const ir = makeIR({ contexts: [ctx], flows: [flowA, flowB] });

      const topology = deriveTopology(ir);

      const sagaCasesA = topology.suites[0].testCases.filter((tc) =>
        tc.momentId.startsWith('saga-'),
      );
      const sagaCasesB = topology.suites[1].testCases.filter((tc) =>
        tc.momentId.startsWith('saga-'),
      );
      expect(sagaCasesA.length).toBeGreaterThan(0);
      expect(sagaCasesB).toHaveLength(0);
    });

    it('emits policy cases once across multiple flows', () => {
      const ctx: ContextDefinition = {
        ...makeContext('ctx-1', 'Ordering'),
        policies: [
          {
            id: 'pol-1',
            name: 'AutoApprovePolicy',
            trigger: 'OrderPlaced',
            action: 'ApproveOrder',
            chainsTo: 'SendConfirmation',
          },
        ],
      };
      const flowA = makeFlow('fa', 'Flow A', [makeMoment('fr1', 'M1', 'ctx-1', 'OrderPlaced')], []);
      const flowB = makeFlow('fb', 'Flow B', [makeMoment('fr2', 'M2', 'ctx-1', 'OrderPlaced')], []);
      const ir = makeIR({ contexts: [ctx], flows: [flowA, flowB] });

      const topology = deriveTopology(ir);

      const allPolicyCases = topology.suites.flatMap((s) =>
        s.testCases.filter((tc) => tc.momentId.startsWith('policy-')),
      );
      expect(allPolicyCases).toHaveLength(1);
      // Assigned to the first flow that contains the trigger
      const policyCasesA = topology.suites[0].testCases.filter((tc) =>
        tc.momentId.startsWith('policy-'),
      );
      expect(policyCasesA).toHaveLength(1);
    });

    it('context with no sagas produces no saga test cases', () => {
      const ctx = makeContext('ctx-1', 'Ordering');
      const moment = makeMoment('fr1', 'Place Order', 'ctx-1', 'PlaceOrder');
      const flow = makeFlow('f1', 'Order Flow', [moment], []);
      const ir = makeIR({ contexts: [ctx], flows: [flow] });

      const topology = deriveTopology(ir);

      const sagaCases = topology.suites[0].testCases.filter((tc) =>
        tc.momentId.startsWith('saga-'),
      );
      expect(sagaCases).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // Policy chain test cases
  // -----------------------------------------------------------------------
  describe('policy chain test cases', () => {
    it('policy with chainsTo produces a policy chain test case', () => {
      const ctx: ContextDefinition = {
        ...makeContext('ctx-1', 'Ordering'),
        policies: [
          {
            id: 'pol-1',
            name: 'AutoApprovePolicy',
            trigger: 'OrderPlaced',
            action: 'ApproveOrder',
            chainsTo: 'SendConfirmation',
          },
        ],
      };
      const moment = makeMoment('fr1', 'Place Order', 'ctx-1', 'PlaceOrder');
      const flow = makeFlow('f1', 'Order Flow', [moment], []);
      const ir = makeIR({ contexts: [ctx], flows: [flow] });

      const topology = deriveTopology(ir);

      const policyCases = topology.suites[0].testCases.filter((tc) =>
        tc.momentId.startsWith('policy-'),
      );
      expect(policyCases).toHaveLength(1);
      expect(policyCases[0].momentId).toBe('policy-AutoApprovePolicy');
      expect(policyCases[0].assertions[0].assertionType).toBe('policy-chain');
      expect(policyCases[0].assertions[0].schemaContract.eventType).toBe('SendConfirmation');
      expect(policyCases[0].setupSteps[0].precondition).toBe(
        'OrderPlaced occurs → SendConfirmation must follow',
      );
    });

    it('policy without chainsTo produces no policy chain test case', () => {
      const ctx: ContextDefinition = {
        ...makeContext('ctx-1', 'Ordering'),
        policies: [
          {
            id: 'pol-1',
            name: 'LogPolicy',
            trigger: 'OrderPlaced',
            action: 'LogEvent',
          },
        ],
      };
      const moment = makeMoment('fr1', 'Place Order', 'ctx-1', 'PlaceOrder');
      const flow = makeFlow('f1', 'Order Flow', [moment], []);
      const ir = makeIR({ contexts: [ctx], flows: [flow] });

      const topology = deriveTopology(ir);

      const policyCases = topology.suites[0].testCases.filter((tc) =>
        tc.momentId.startsWith('policy-'),
      );
      expect(policyCases).toHaveLength(0);
    });

    it('context with no policies produces no policy chain test cases', () => {
      const ctx = makeContext('ctx-1', 'Ordering');
      const moment = makeMoment('fr1', 'Place Order', 'ctx-1', 'PlaceOrder');
      const flow = makeFlow('f1', 'Order Flow', [moment], []);
      const ir = makeIR({ contexts: [ctx], flows: [flow] });

      const topology = deriveTopology(ir);

      const policyCases = topology.suites[0].testCases.filter((tc) =>
        tc.momentId.startsWith('policy-'),
      );
      expect(policyCases).toHaveLength(0);
    });
  });
});
