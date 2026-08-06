import { describe, it, expect } from 'vitest';
import type {
  IntermediateRepresentation,
  FlowDefinition,
  MomentDefinition,
  ConnectionDefinition,
  ContextDefinition,
  LaneDefinition,
} from '@mmmnt/core';
import { TopologyEmitter } from '../topology-emitter.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMetadata() {
  return {
    name: 'test-spec',
    version: '1.0.0',
    description: 'Test specification',
    generatedAt: '2026-01-01T00:00:00Z',
  };
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

function makeContext(id: string, name: string): ContextDefinition {
  return {
    id,
    name,
    classification: 'Core',
    aggregates: [],
    domainServices: [],
    commands: [],
    events: [],
    policies: [],
    sagas: [],
    valueObjects: [],
    invariants: [],
  };
}

function makeLane(id: string, label: string, contextId: string, isBranch = false): LaneDefinition {
  return { id, label, contextId, classification: 'Core', isBranch };
}

/**
 * A flow shaped like howie N1's first loop: a main moment, then a branch
 * moment whose refusal path returns to the first moment.
 */
function makeLoopFlow(): FlowDefinition {
  const m0: MomentDefinition = {
    id: 'moment-0-M1',
    name: 'M1 · A request arrives',
    contextEntries: [
      { contextId: 'ctx-Messaging', nodeName: 'RecordInboundMessage', nodeKind: 'command' },
      { contextId: 'ctx-Messaging', nodeName: 'InboundMessageRecorded', nodeKind: 'event' },
    ],
  };
  const m1: MomentDefinition = {
    id: 'moment-1-Cold-sender-throttled',
    name: 'Cold sender throttled',
    contextEntries: [],
    isBranch: true,
    branches: [
      {
        condition: 'SenderWarmOrActive',
        entries: [{ contextId: 'ctx-Messaging', nodeName: 'ThrottleExempt', nodeKind: 'event' }],
      },
      {
        condition: 'ColdSenderThrottled',
        entries: [
          {
            contextId: 'ctx-Refusals',
            nodeName: 'ThrottleNoticeSent',
            nodeKind: 'event',
            terminal: true,
          },
        ],
      },
    ],
  };

  const connections: ConnectionDefinition[] = [
    {
      id: 'conn-0',
      sourceMomentId: 'moment-0-M1',
      targetContextId: 'ctx-Messaging',
      eventId: 'evt-RecordInboundMessage',
      sourceNodeName: 'SendBookingRequest',
      targetNodeName: 'RecordInboundMessage',
      connectionType: 'triggers',
    },
    {
      id: 'conn-1',
      sourceMomentId: 'moment-1-Cold-sender-throttled',
      targetContextId: 'ctx-Refusals',
      eventId: 'evt-ThrottleNoticeSent',
      sourceNodeName: 'ThrottleNoticeSent',
      connectionType: 'returns-to',
      targetMomentLabel: 'M1 · A request arrives',
      targetMomentId: 'moment-0-M1',
      branchCondition: 'ColdSenderThrottled',
    },
  ];

  return {
    id: 'flow-n1',
    name: 'N1',
    lanes: [
      makeLane('messaging', 'Messaging', 'ctx-Messaging'),
      makeLane('refusals', 'Refusals', 'ctx-Refusals', true),
    ],
    moments: [m0, m1],
    connections,
  };
}

function emit(flow: FlowDefinition, ir?: IntermediateRepresentation) {
  return new TopologyEmitter().emit(ir ?? makeIR({ flows: [flow] }), flow);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TopologyEmitter', () => {
  // -------------------------------------------------------------------------
  // Audit fix #1: returns-to edges are frame→frame
  // -------------------------------------------------------------------------
  describe('returns-to edges', () => {
    it('emits frame→frame using the resolved targetMomentId', () => {
      const topology = emit(makeLoopFlow());

      const returnEdge = topology.connections.find((c) => c.style === 'return')!;
      expect(returnEdge).toBeDefined();
      expect(returnEdge.from).toBe('moment-1-Cold-sender-throttled');
      expect(returnEdge.to).toBe('moment-0-M1');
      expect(returnEdge.targetMomentLabel).toBe('M1 · A request arrives');
      // Both endpoints are frame ids
      const frameIds = topology.frames.map((f) => f.id);
      expect(frameIds).toContain(returnEdge.from);
      expect(frameIds).toContain(returnEdge.to);
    });

    it('falls back to old behavior with a warning label when targetMomentId is unresolved', () => {
      const flow = makeLoopFlow();
      const conn = flow.connections[1];
      if (conn.connectionType === 'crosses-to') throw new Error('unexpected connection type');
      delete conn.targetMomentId;
      conn.targetMomentLabel = 'Nonexistent Moment';

      const topology = emit(flow);

      const returnEdge = topology.connections.find((c) => c.style === 'return')!;
      expect(returnEdge.to).toBe('ctx-Refusals');
      expect(returnEdge.label).toContain('unresolved returns-to target');
      expect(returnEdge.label).toContain('Nonexistent Moment');
      expect(returnEdge.targetMomentLabel).toBe('Nonexistent Moment');
    });
  });

  // -------------------------------------------------------------------------
  // Audit fix #2: eventType + node names on all edges
  // -------------------------------------------------------------------------
  describe('connection payload information', () => {
    it('every connection carries eventType (raw event/node name)', () => {
      const topology = emit(makeLoopFlow());

      for (const conn of topology.connections) {
        expect(conn.eventType).toBeTruthy();
      }
      const triggerEdge = topology.connections.find((c) => c.style === 'happy')!;
      expect(triggerEdge.eventType).toBe('RecordInboundMessage');
      const returnEdge = topology.connections.find((c) => c.style === 'return')!;
      expect(returnEdge.eventType).toBe('ThrottleNoticeSent');
    });

    it('carries sourceNodeName/targetNodeName when present', () => {
      const topology = emit(makeLoopFlow());

      const triggerEdge = topology.connections.find((c) => c.style === 'happy')!;
      expect(triggerEdge.sourceNodeName).toBe('SendBookingRequest');
      expect(triggerEdge.targetNodeName).toBe('RecordInboundMessage');
    });

    it('crossing edges carry eventType alongside the schema contract', () => {
      const flow = makeLoopFlow();
      flow.connections.push({
        id: 'conn-2',
        sourceMomentId: 'moment-0-M1',
        targetContextId: 'ctx-Scheduling',
        eventId: 'evt-InboundMessageAccepted',
        sourceNodeName: 'InboundMessageAccepted',
        connectionType: 'crosses-to',
        schemaContract: {
          eventType: 'InboundMessageAccepted',
          fields: [{ name: 'conversationId', type: 'UUID', required: true }],
          relationshipType: 'CustomerSupplier',
        },
      });

      const topology = emit(flow);

      const crossEdge = topology.connections.find((c) => c.crossBoundary)!;
      expect(crossEdge.eventType).toBe('InboundMessageAccepted');
      expect(crossEdge.sourceNodeName).toBe('InboundMessageAccepted');
      expect(crossEdge.relationship).toBe('CustomerSupplier');
    });

    it('triggers edges point at the target node context resolved by core', () => {
      const flow = makeLoopFlow();
      // A `triggers` edge declared in ctx-Refusals whose target node lives in
      // ctx-Messaging: core resolves targetContextId to the target's context.
      flow.connections.push({
        id: 'conn-3',
        sourceMomentId: 'moment-1-Cold-sender-throttled',
        targetContextId: 'ctx-Messaging',
        eventId: 'evt-RecordInboundMessage',
        sourceNodeName: 'ThrottleNoticeSent',
        targetNodeName: 'RecordInboundMessage',
        connectionType: 'triggers',
      });

      const topology = emit(flow);

      const edge = topology.connections.find(
        (c) => c.sourceNodeName === 'ThrottleNoticeSent' && c.style === 'happy',
      )!;
      expect(edge.to).toBe('ctx-Messaging');
    });
  });

  // -------------------------------------------------------------------------
  // Audit fix #5: branch predicate route honesty
  // -------------------------------------------------------------------------
  describe('branchPredicates', () => {
    it('maps each branch condition to a route label equal to the condition itself', () => {
      const topology = emit(makeLoopFlow());

      const predicate = topology.branchPredicates['moment-1-Cold-sender-throttled'];
      expect(predicate).toBeDefined();
      expect(predicate.field).toBe('outcome');
      expect(predicate.routes).toEqual({
        SenderWarmOrActive: 'SenderWarmOrActive',
        ColdSenderThrottled: 'ColdSenderThrottled',
      });
      expect(predicate.defaultRoute).toBe('SenderWarmOrActive');
    });

    it('route labels are distinct per branch point', () => {
      const topology = emit(makeLoopFlow());

      for (const predicate of Object.values(topology.branchPredicates)) {
        const labels = Object.values(predicate.routes);
        expect(new Set(labels).size).toBe(labels.length);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Audit fix #7: contextMap consistency
  // -------------------------------------------------------------------------
  describe('contextMap', () => {
    it('includes contexts reachable only via branch entries (terminal included)', () => {
      const ir = makeIR({
        contexts: [
          makeContext('ctx-Messaging', 'Messaging'),
          makeContext('ctx-Refusals', 'Refusals'),
        ],
      });
      const flow = makeLoopFlow();

      const topology = emit(flow, { ...ir, flows: [flow] });

      const ids = topology.contextMap.contexts.map((c) => c.contextId);
      // ctx-Refusals is only reachable via a terminal branch entry
      expect(ids).toContain('ctx-Refusals');
    });

    it('never emits relationships referencing contexts absent from boundedContexts', () => {
      // Crossing targets ctx-Scheduling which is NOT declared in ir.contexts.
      const ir = makeIR({
        contexts: [
          makeContext('ctx-Messaging', 'Messaging'),
          makeContext('ctx-Refusals', 'Refusals'),
        ],
      });
      const flow = makeLoopFlow();
      flow.connections.push({
        id: 'conn-2',
        sourceMomentId: 'moment-0-M1',
        targetContextId: 'ctx-Scheduling',
        eventId: 'evt-InboundMessageRecorded',
        sourceNodeName: 'InboundMessageRecorded',
        connectionType: 'crosses-to',
        schemaContract: {
          eventType: 'InboundMessageRecorded',
          fields: [],
          relationshipType: 'CustomerSupplier',
        },
      });

      const topology = emit(flow, { ...ir, flows: [flow] });

      const known = new Set(topology.contextMap.contexts.map((c) => c.contextId));
      for (const rel of topology.contextMap.relationships) {
        expect(known.has(rel.sourceContextId)).toBe(true);
        expect(known.has(rel.targetContextId)).toBe(true);
      }
    });
  });
});
