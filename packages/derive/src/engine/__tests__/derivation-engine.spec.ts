import { describe, it, expect } from 'vitest';
import type {
  IntermediateRepresentation,
  FlowDefinition,
  FrameDefinition,
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

function makeFrame(id: string, name: string, contextId: string, nodeName: string): FrameDefinition {
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
  sourceFrameId: string,
  targetContextId: string,
  eventType: string,
  fields: SchemaContract['fields'] = [{ name: 'id', type: 'string', required: true }],
  relationshipType = 'Partnership',
): ConnectionDefinition {
  return {
    id,
    sourceFrameId,
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
  frames: FrameDefinition[],
  connections: ConnectionDefinition[],
): FlowDefinition {
  return { id, name, frames, connections };
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
        makeFlow('f1', 'Flow A', [makeFrame('fr1', 'Frame 1', 'ctx-1', 'PlaceOrder')], []),
        makeFlow('f2', 'Flow B', [makeFrame('fr2', 'Frame 2', 'ctx-1', 'ShipOrder')], []),
        makeFlow('f3', 'Flow C', [makeFrame('fr3', 'Frame 3', 'ctx-1', 'CancelOrder')], []),
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
    it('flow with 2 crossings in separate frames produces 2 assertion points total', () => {
      const ctx1 = makeContext('ctx-1', 'Ordering', [
        makeEvent('OrderShipped-event', 'OrderShipped'),
      ]);
      const ctx2 = makeContext('ctx-2', 'Shipping', [
        makeEvent('OrderPlaced-event', 'OrderPlaced'),
      ]);
      const frame1 = makeFrame('fr1', 'Frame 1', 'ctx-1', 'PlaceOrder');
      const frame2 = makeFrame('fr2', 'Frame 2', 'ctx-2', 'ShipOrder');
      const conn1 = makeCrossingConnection('c1', 'fr1', 'ctx-2', 'OrderPlaced');
      const conn2 = makeCrossingConnection('c2', 'fr2', 'ctx-1', 'OrderShipped');
      const flow = makeFlow('f1', 'Order Flow', [frame1, frame2], [conn1, conn2]);
      const ir = makeIR({ contexts: [ctx1, ctx2], flows: [flow] });

      const topology = deriveTopology(ir);

      const allAssertions = topology.suites
        .flatMap((s) => s.testCases)
        .flatMap((tc) => tc.assertions);
      expect(allAssertions).toHaveLength(2);
    });
  });

  // -----------------------------------------------------------------------
  // DV-03: TestCaseDefinitions ordered by frame position
  // -----------------------------------------------------------------------
  describe('DV-03', () => {
    it('multi-frame flow produces TestCaseDefinitions ordered by frame position', () => {
      const ctx = makeContext('ctx-1', 'Ordering');
      const frames = [
        makeFrame('fr1', 'First Frame', 'ctx-1', 'Step1'),
        makeFrame('fr2', 'Second Frame', 'ctx-1', 'Step2'),
        makeFrame('fr3', 'Third Frame', 'ctx-1', 'Step3'),
      ];
      const flow = makeFlow('f1', 'Sequence Flow', frames, []);
      const ir = makeIR({ contexts: [ctx], flows: [flow] });

      const topology = deriveTopology(ir);

      const suite = topology.suites[0];
      expect(suite.testCases[0].frameId).toBe('fr1');
      expect(suite.testCases[1].frameId).toBe('fr2');
      expect(suite.testCases[2].frameId).toBe('fr3');
    });
  });

  // -----------------------------------------------------------------------
  // DV-04: Schema contract → FieldConstraint entries
  // -----------------------------------------------------------------------
  describe('DV-04', () => {
    it('crossing with schema contract maps required fields to FieldConstraint entries', () => {
      const ctx1 = makeContext('ctx-1', 'Ordering');
      const ctx2 = makeContext('ctx-2', 'Billing', [makeEvent('OrderPlaced-event', 'OrderPlaced')]);
      const frame = makeFrame('fr1', 'Frame 1', 'ctx-1', 'PlaceOrder');
      const conn = makeCrossingConnection('c1', 'fr1', 'ctx-2', 'OrderPlaced', [
        { name: 'orderId', type: 'string', required: true },
        { name: 'amount', type: 'number', required: true },
      ]);
      const flow = makeFlow('f1', 'Billing Flow', [frame], [conn]);
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
      const frame = makeFrame('fr1', 'Frame 1', 'ctx-1', 'PlaceOrder');
      const conn = makeCrossingConnection('c1', 'fr1', 'ctx-2', 'OrderPlaced', [
        { name: 'orderId', type: 'string', required: true },
      ]);
      const flow = makeFlow('f1', 'Minimal-Contract Flow', [frame], [conn]);
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
    it('single flow, 2 lanes, 2 frames, 1 crossing produces 1 suite, 2 cases, 1 assertion point', () => {
      const ctx1 = makeContext('ctx-1', 'Sales');
      const ctx2 = makeContext('ctx-2', 'Fulfillment', [
        makeEvent('OrderAccepted-event', 'OrderAccepted'),
      ]);
      const frame1 = makeFrame('fr1', 'Accept Order', 'ctx-1', 'AcceptOrder');
      const frame2 = makeFrame('fr2', 'Fulfill Order', 'ctx-2', 'FulfillOrder');
      const conn = makeCrossingConnection('c1', 'fr1', 'ctx-2', 'OrderAccepted');
      const flow = makeFlow('f1', 'Sales Flow', [frame1, frame2], [conn]);
      const ir = makeIR({ contexts: [ctx1, ctx2], flows: [flow] });

      const topology = deriveTopology(ir);

      expect(topology.suites).toHaveLength(1);
      expect(topology.suites[0].testCases).toHaveLength(2);
      const allAssertions = topology.suites[0].testCases.flatMap((tc) => tc.assertions);
      expect(allAssertions).toHaveLength(1);
    });

    it('multiple flows produce one suite per flow with correct flowId and flowName', () => {
      const ctx = makeContext('ctx-1', 'Ordering');
      const flowA = makeFlow('fa', 'Alpha', [makeFrame('fr1', 'F1', 'ctx-1', 'Cmd1')], []);
      const flowB = makeFlow('fb', 'Beta', [makeFrame('fr2', 'F2', 'ctx-1', 'Cmd2')], []);
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
      const frame = makeFrame('fr1', 'Frame 1', 'ctx-1', 'PlaceOrder');
      const flow = makeFlow('f1', 'No Crossing Flow', [frame], []);
      const ir = makeIR({ contexts: [ctx], flows: [flow] });

      const topology = deriveTopology(ir);

      expect(topology.suites).toHaveLength(1);
      expect(topology.suites[0].testCases).toHaveLength(1);
      expect(topology.suites[0].testCases[0].assertions).toHaveLength(0);
    });

    it('flow with 3 frames produces 3 test cases', () => {
      const ctx = makeContext('ctx-1', 'Ordering');
      const frames = [
        makeFrame('fr1', 'Step 1', 'ctx-1', 'Cmd1'),
        makeFrame('fr2', 'Step 2', 'ctx-1', 'Cmd2'),
        makeFrame('fr3', 'Step 3', 'ctx-1', 'Cmd3'),
      ];
      const flow = makeFlow('f1', 'Three-Step Flow', frames, []);
      const ir = makeIR({ contexts: [ctx], flows: [flow] });

      const topology = deriveTopology(ir);

      expect(topology.suites[0].testCases).toHaveLength(3);
    });

    it('frame with multiple crossings produces multiple assertion points in that test case', () => {
      const ctx1 = makeContext('ctx-1', 'Ordering');
      const ctx2 = makeContext('ctx-2', 'Billing', [makeEvent('OrderPlaced-event', 'OrderPlaced')]);
      const ctx3 = makeContext('ctx-3', 'Shipping', [
        makeEvent('OrderPlaced-event', 'OrderPlaced'),
      ]);
      const frame = makeFrame('fr1', 'Multi-Cross Frame', 'ctx-1', 'PlaceOrder');
      const conn1 = makeCrossingConnection('c1', 'fr1', 'ctx-2', 'OrderPlaced');
      const conn2 = makeCrossingConnection('c2', 'fr1', 'ctx-3', 'OrderPlaced');
      const flow = makeFlow('f1', 'Multi-Cross Flow', [frame], [conn1, conn2]);
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

    it('branch frame produces test cases for both branch paths', () => {
      const ctx = makeContext('ctx-1', 'Ordering');
      const branchFrame: FrameDefinition = {
        id: 'fr-branch',
        name: 'Decision Frame',
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
      const flow = makeFlow('f1', 'Branch Flow', [branchFrame], []);
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
      const frame = makeFrame('fr1', 'Frame 1', 'ctx-1', 'PlaceOrder');
      const conn = makeCrossingConnection(
        'c1',
        'fr1',
        'ctx-2',
        'OrderPlaced',
        [{ name: 'orderId', type: 'string', required: true }],
        'Partnership',
      );
      const flow = makeFlow('f1', 'Partner Flow', [frame], [conn]);
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
      const frame = makeFrame('fr1', 'Frame 1', 'ctx-supplier', 'ReserveStock');
      const conn = makeCrossingConnection(
        'c1',
        'fr1',
        'ctx-customer',
        'StockReserved',
        [{ name: 'sku', type: 'string', required: true }],
        'CustomerSupplier',
      );
      const flow = makeFlow('f1', 'Supplier Flow', [frame], [conn]);
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
      const frame = makeFrame('fr1', 'Frame 1', 'ctx-1', 'PlaceOrder');
      const conn = makeCrossingConnection('c1', 'fr1', 'ctx-2', 'OrderPlaced', [
        { name: 'orderId', type: 'string', required: true },
        { name: 'customerEmail', type: 'string', required: true },
        { name: 'notes', type: 'string', required: false },
      ]);
      const flow = makeFlow('f1', 'Mixed Fields Flow', [frame], [conn]);
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

    it('multi-context frame resolves source as non-target context', () => {
      const ctx1 = makeContext('ctx-1', 'Ordering', [
        makeEvent('OrderPlaced-event', 'OrderPlaced'),
      ]);
      const ctx2 = makeContext('ctx-2', 'Shipping', [
        makeEvent('OrderPlaced-event', 'OrderPlaced'),
      ]);
      const frame: FrameDefinition = {
        id: 'fr1',
        name: 'Multi-Context Frame',
        contextEntries: [
          { contextId: 'ctx-1', nodeName: 'PlaceOrder', nodeKind: 'command' },
          { contextId: 'ctx-2', nodeName: 'ReceiveOrder', nodeKind: 'event' },
        ],
      };
      const conn = makeCrossingConnection('c1', 'fr1', 'ctx-2', 'OrderPlaced');
      const flow = makeFlow('f1', 'Multi-Ctx Flow', [frame], [conn]);
      const ir = makeIR({ contexts: [ctx1, ctx2], flows: [flow] });

      const topology = deriveTopology(ir);

      const assertion = topology.suites[0].testCases[0].assertions[0];
      expect(assertion.sourceContext).toBe('ctx-1');
      expect(assertion.targetContext).toBe('ctx-2');
    });
  });
});
