import { describe, it, expect } from 'vitest';
import type {
  IntermediateRepresentation,
  ContextDefinition,
  AggregateDefinition,
  FlowDefinition,
  MomentDefinition,
  ConnectionDefinition,
} from '@mmmnt/core';
import { generateEventCatalog } from '../event-catalog-generator.js';

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

function makeAggregate(overrides: Partial<AggregateDefinition> = {}): AggregateDefinition {
  return {
    id: overrides.id ?? 'agg-1',
    name: overrides.name ?? 'OrderAggregate',
    identityField: overrides.identityField ?? {
      name: 'id',
      type: 'UUID',
      isArray: false,
      required: true,
    },
    commands: overrides.commands ?? [],
    events: overrides.events ?? [],
    valueObjects: overrides.valueObjects ?? [],
    invariants: overrides.invariants ?? [],
  };
}

function makeContext(
  id: string,
  name: string,
  aggregates: AggregateDefinition[] = [],
): ContextDefinition {
  return {
    id,
    name,
    classification: 'Core',
    aggregates,
    domainServices: [],
    commands: [],
    events: [],
    policies: [],
    sagas: [],
    valueObjects: [],
    invariants: [],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('EventCatalogGenerator', () => {
  it('catalogs events from aggregates', () => {
    const agg = makeAggregate({
      events: [
        {
          id: 'evt-1',
          name: 'OrderPlaced',
          fields: [{ name: 'orderId', type: 'UUID', isArray: false, required: true }],
        },
        {
          id: 'evt-2',
          name: 'OrderShipped',
          fields: [{ name: 'trackingId', type: 'string', isArray: false, required: true }],
        },
      ],
      commands: [
        {
          id: 'cmd-1',
          name: 'PlaceOrder',
          inputs: [],
          preconditions: [],
          emitsEvent: 'OrderPlaced',
        },
      ],
    });
    const ctx = makeContext('ctx-1', 'Ordering', [agg]);
    const ir = makeIR({ contexts: [ctx] });

    const catalog = generateEventCatalog(ir);

    expect(catalog.events).toHaveLength(2);
    expect(catalog.metadata.totalEvents).toBe(2);
    expect(catalog.events[0].eventName).toBe('OrderPlaced');
    expect(catalog.events[1].eventName).toBe('OrderShipped');
  });

  it('maps producer command correctly', () => {
    const agg = makeAggregate({
      events: [{ id: 'evt-1', name: 'OrderPlaced', fields: [] }],
      commands: [
        {
          id: 'cmd-1',
          name: 'PlaceOrder',
          inputs: [],
          preconditions: [],
          emitsEvent: 'OrderPlaced',
        },
      ],
    });
    const ctx = makeContext('ctx-1', 'Sales', [agg]);
    const ir = makeIR({ contexts: [ctx] });

    const catalog = generateEventCatalog(ir);

    expect(catalog.events[0].producer.context).toBe('Sales');
    expect(catalog.events[0].producer.aggregate).toBe('OrderAggregate');
    expect(catalog.events[0].producer.command).toBe('PlaceOrder');
  });

  it('producer command is empty string when no matching command', () => {
    const agg = makeAggregate({
      events: [{ id: 'evt-1', name: 'OrderPlaced', fields: [] }],
      commands: [],
    });
    const ctx = makeContext('ctx-1', 'Sales', [agg]);
    const ir = makeIR({ contexts: [ctx] });

    const catalog = generateEventCatalog(ir);

    expect(catalog.events[0].producer.command).toBe('');
  });

  it('maps consumers from flow crossings', () => {
    const agg = makeAggregate({
      events: [{ id: 'evt-1', name: 'OrderPlaced', fields: [] }],
    });
    const ctx1 = makeContext('ctx-1', 'Sales', [agg]);
    const ctx2 = makeContext('ctx-2', 'Shipping');

    const conn: ConnectionDefinition = {
      id: 'c1',
      sourceMomentId: 'fr1',
      targetContextId: 'ctx-2',
      eventId: 'evt-1',
      connectionType: 'crosses-to',
      schemaContract: { eventType: 'OrderPlaced', fields: [], relationshipType: 'Partnership' },
    };
    const moment: MomentDefinition = {
      id: 'fr1',
      name: 'Place Order',
      contextEntries: [{ contextId: 'ctx-1', nodeName: 'PlaceOrder', nodeKind: 'command' }],
    };
    const flow: FlowDefinition = {
      id: 'f1',
      name: 'Order Flow',
      lanes: [],
      moments: [moment],
      connections: [conn],
    };
    const ir = makeIR({ contexts: [ctx1, ctx2], flows: [flow] });

    const catalog = generateEventCatalog(ir);

    expect(catalog.events[0].consumers).toHaveLength(1);
    expect(catalog.events[0].consumers[0].context).toBe('Shipping');
    // Audit fix #6: relationshipType is the contract's relationship type,
    // matching the topology, not the literal 'crosses-to'.
    expect(catalog.events[0].consumers[0].relationshipType).toBe('Partnership');
  });

  it('deduplicates consumers', () => {
    const agg = makeAggregate({
      events: [{ id: 'evt-1', name: 'OrderPlaced', fields: [] }],
    });
    const ctx1 = makeContext('ctx-1', 'Sales', [agg]);
    const ctx2 = makeContext('ctx-2', 'Shipping');

    const conn1: ConnectionDefinition = {
      id: 'c1',
      sourceMomentId: 'fr1',
      targetContextId: 'ctx-2',
      eventId: 'evt-1',
      connectionType: 'crosses-to',
      schemaContract: { eventType: 'OrderPlaced', fields: [], relationshipType: 'Partnership' },
    };
    const conn2: ConnectionDefinition = {
      id: 'c2',
      sourceMomentId: 'fr2',
      targetContextId: 'ctx-2',
      eventId: 'evt-1',
      connectionType: 'crosses-to',
      schemaContract: { eventType: 'OrderPlaced', fields: [], relationshipType: 'Partnership' },
    };
    const moment1: MomentDefinition = {
      id: 'fr1',
      name: 'M1',
      contextEntries: [{ contextId: 'ctx-1', nodeName: 'PlaceOrder', nodeKind: 'command' }],
    };
    const moment2: MomentDefinition = {
      id: 'fr2',
      name: 'M2',
      contextEntries: [{ contextId: 'ctx-1', nodeName: 'ConfirmOrder', nodeKind: 'command' }],
    };
    const flow: FlowDefinition = {
      id: 'f1',
      name: 'Flow',
      lanes: [],
      moments: [moment1, moment2],
      connections: [conn1, conn2],
    };
    const ir = makeIR({ contexts: [ctx1, ctx2], flows: [flow] });

    const catalog = generateEventCatalog(ir);

    expect(catalog.events[0].consumers).toHaveLength(1);
  });

  it('resolves temporal location from context entries', () => {
    const agg = makeAggregate({
      events: [{ id: 'evt-1', name: 'OrderPlaced', fields: [] }],
    });
    const ctx = makeContext('ctx-1', 'Sales', [agg]);
    const moment: MomentDefinition = {
      id: 'fr1',
      name: 'Accept Order',
      contextEntries: [{ contextId: 'ctx-1', nodeName: 'OrderPlaced', nodeKind: 'event' }],
    };
    const flow: FlowDefinition = {
      id: 'f1',
      name: 'Flow',
      lanes: [],
      moments: [moment],
      connections: [],
    };
    const ir = makeIR({ contexts: [ctx], flows: [flow] });

    const catalog = generateEventCatalog(ir);

    expect(catalog.events[0].temporalLocation).toBeDefined();
    expect(catalog.events[0].temporalLocation!.moment).toBe('Accept Order');
    expect(catalog.events[0].temporalLocation!.momentIndex).toBe(0);
  });

  it('resolves temporal location from connection sourceMomentId', () => {
    const agg = makeAggregate({
      events: [{ id: 'evt-1', name: 'OrderPlaced', fields: [] }],
    });
    const ctx1 = makeContext('ctx-1', 'Sales', [agg]);
    const ctx2 = makeContext('ctx-2', 'Shipping');
    const moment: MomentDefinition = {
      id: 'fr1',
      name: 'Ship Order',
      contextEntries: [{ contextId: 'ctx-1', nodeName: 'PlaceOrder', nodeKind: 'command' }],
    };
    const conn: ConnectionDefinition = {
      id: 'c1',
      sourceMomentId: 'fr1',
      targetContextId: 'ctx-2',
      eventId: 'evt-1',
      connectionType: 'crosses-to',
      schemaContract: { eventType: 'OrderPlaced', fields: [], relationshipType: 'Partnership' },
    };
    const flow: FlowDefinition = {
      id: 'f1',
      name: 'Flow',
      lanes: [],
      moments: [moment],
      connections: [conn],
    };
    const ir = makeIR({ contexts: [ctx1, ctx2], flows: [flow] });

    const catalog = generateEventCatalog(ir);

    expect(catalog.events[0].temporalLocation).toBeDefined();
    expect(catalog.events[0].temporalLocation!.moment).toBe('Ship Order');
  });

  it('returns undefined temporal location when event not in any flow', () => {
    const agg = makeAggregate({
      events: [{ id: 'evt-1', name: 'OrderPlaced', fields: [] }],
    });
    const ctx = makeContext('ctx-1', 'Sales', [agg]);
    const ir = makeIR({ contexts: [ctx], flows: [] });

    const catalog = generateEventCatalog(ir);

    expect(catalog.events[0].temporalLocation).toBeUndefined();
  });

  it('empty IR produces empty catalog', () => {
    const ir = makeIR();

    const catalog = generateEventCatalog(ir);

    expect(catalog.events).toHaveLength(0);
    expect(catalog.metadata.totalEvents).toBe(0);
  });

  it('maps event schema fields correctly', () => {
    const agg = makeAggregate({
      events: [
        {
          id: 'evt-1',
          name: 'OrderPlaced',
          fields: [
            { name: 'orderId', type: 'UUID', isArray: false, required: true },
            { name: 'items', type: 'OrderItem', isArray: true, required: true },
          ],
        },
      ],
    });
    const ctx = makeContext('ctx-1', 'Sales', [agg]);
    const ir = makeIR({ contexts: [ctx] });

    const catalog = generateEventCatalog(ir);

    expect(catalog.events[0].schema.fields).toHaveLength(2);
    expect(catalog.events[0].schema.fields[0]).toEqual({
      name: 'orderId',
      type: 'UUID',
      isArray: false,
    });
    expect(catalog.events[0].schema.fields[1]).toEqual({
      name: 'items',
      type: 'OrderItem',
      isArray: true,
    });
  });

  // -------------------------------------------------------------------------
  // Audit fix #3: flow-only fallback
  // -------------------------------------------------------------------------
  describe('flow-only fallback', () => {
    function makeFlowOnlyIR(): IntermediateRepresentation {
      const moment1: MomentDefinition = {
        id: 'moment-0-M1',
        name: 'M1 · A request arrives',
        contextEntries: [
          { contextId: 'ctx-Messaging', nodeName: 'RecordInboundMessage', nodeKind: 'command' },
          { contextId: 'ctx-Messaging', nodeName: 'InboundMessageRecorded', nodeKind: 'event' },
        ],
      };
      const branchMoment: MomentDefinition = {
        id: 'moment-1-Branch',
        name: 'Cold sender throttled',
        contextEntries: [],
        branches: [
          {
            condition: 'ColdSenderThrottled',
            entries: [
              { contextId: 'ctx-Refusals', nodeName: 'ThrottleNoticeSent', nodeKind: 'event' },
            ],
          },
        ],
      };
      const crossing: ConnectionDefinition = {
        id: 'conn-0',
        sourceMomentId: 'moment-0-M1',
        targetContextId: 'ctx-Scheduling',
        eventId: 'evt-InboundMessageRecorded',
        sourceNodeName: 'InboundMessageRecorded',
        connectionType: 'crosses-to',
        schemaContract: {
          eventType: 'InboundMessageRecorded',
          fields: [
            { name: 'messageId', type: 'UUID', required: true },
            { name: 'body', type: 'string', required: false },
          ],
          relationshipType: 'CustomerSupplier',
        },
      };
      const triggers: ConnectionDefinition = {
        id: 'conn-1',
        sourceMomentId: 'moment-0-M1',
        targetContextId: 'ctx-Messaging',
        eventId: 'evt-InboundMessageRecorded',
        sourceNodeName: 'RecordInboundMessage',
        targetNodeName: 'InboundMessageRecorded',
        connectionType: 'triggers',
      };
      const flow: FlowDefinition = {
        id: 'f1',
        name: 'N1',
        lanes: [],
        moments: [moment1, branchMoment],
        connections: [crossing, triggers],
      };
      return makeIR({ contexts: [], flows: [flow] });
    }

    it('flow-only spec produces non-empty catalog from flow entries', () => {
      const catalog = generateEventCatalog(makeFlowOnlyIR());

      expect(catalog.metadata.totalEvents).toBeGreaterThan(0);
      const names = catalog.events.map((e) => e.eventName);
      expect(names).toContain('RecordInboundMessage');
      expect(names).toContain('InboundMessageRecorded');
      expect(names).toContain('ThrottleNoticeSent');
    });

    it('fallback entries carry kind from nodeKind and context from the lane contextId', () => {
      const catalog = generateEventCatalog(makeFlowOnlyIR());

      const cmd = catalog.events.find((e) => e.eventName === 'RecordInboundMessage')!;
      expect(cmd.kind).toBe('command');
      expect(cmd.producer.context).toBe('Messaging');

      const evt = catalog.events.find((e) => e.eventName === 'InboundMessageRecorded')!;
      expect(evt.kind).toBe('event');
    });

    it('crossing schema contracts provide fallback payload schemas and consumers', () => {
      const catalog = generateEventCatalog(makeFlowOnlyIR());

      const evt = catalog.events.find((e) => e.eventName === 'InboundMessageRecorded')!;
      expect(evt.schema.fields.map((f) => f.name)).toEqual(['messageId', 'body']);
      expect(evt.consumers).toHaveLength(1);
      expect(evt.consumers[0].context).toBe('Scheduling');
      expect(evt.consumers[0].relationshipType).toBe('CustomerSupplier');
      // Producer command resolved from the triggers edge
      expect(evt.producer.command).toBe('RecordInboundMessage');
    });

    it('branch entries get their true temporal location', () => {
      const catalog = generateEventCatalog(makeFlowOnlyIR());

      const branchEvt = catalog.events.find((e) => e.eventName === 'ThrottleNoticeSent')!;
      expect(branchEvt.temporalLocation).toEqual({
        moment: 'Cold sender throttled',
        momentIndex: 1,
      });
    });
  });
});
