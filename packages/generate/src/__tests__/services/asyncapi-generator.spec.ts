import { describe, it, expect } from 'vitest';
import type {
  IntermediateRepresentation,
  ContextDefinition,
  AggregateDefinition,
  EventDefinition,
} from '@mmmnt/core';
import { generateAsyncApiSpec } from '../../services/asyncapi-generator.js';

function makeEvent(name: string, fields: { name: string; type: string }[] = []): EventDefinition {
  return {
    id: `evt-${name}`,
    name,
    fields: fields.map((f) => ({ ...f, isArray: false, required: true })),
  };
}

function makeAggregate(
  name: string,
  events: EventDefinition[] = [],
): AggregateDefinition {
  return {
    id: `agg-${name}`,
    name,
    identityField: { name: 'id', type: 'UUID', isArray: false, required: true },
    commands: [],
    events,
    valueObjects: [],
    invariants: [],
  };
}

function makeContext(
  name: string,
  opts?: { aggregates?: AggregateDefinition[]; events?: EventDefinition[] },
): ContextDefinition {
  return {
    id: `ctx-${name}`,
    name,
    aggregates: opts?.aggregates ?? [],
    domainServices: [],
    commands: [],
    events: opts?.events ?? [],
    policies: [],
    sagas: [],
    valueObjects: [],
    invariants: [],
  };
}

function makeIR(overrides?: Partial<IntermediateRepresentation>): IntermediateRepresentation {
  return {
    contexts: [],
    flows: [],
    glossary: [],
    relationships: [],
    metadata: { name: 'TestAPI', version: '2.0.0', description: 'Test async API' },
    ...overrides,
  };
}

describe('generateAsyncApiSpec', () => {
  it('produces valid AsyncAPI 3.0.0 header', () => {
    const ir = makeIR();
    const output = generateAsyncApiSpec(ir);

    expect(output).toContain("asyncapi: '3.0.0'");
    expect(output).toContain("title: 'TestAPI'");
    expect(output).toContain("version: '2.0.0'");
    expect(output).toContain("description: 'Test async API'");
  });

  it('returns minimal spec with no channels when no crossings exist', () => {
    const ir = makeIR({
      contexts: [makeContext('Ordering')],
      flows: [
        {
          id: 'flow-1',
          name: 'simple-flow',
          moments: [],
          connections: [],
        },
      ],
    });

    const output = generateAsyncApiSpec(ir);
    expect(output).not.toContain('channels:');
    expect(output).not.toContain('components:');
  });

  it('generates channels and messages for crossing connections', () => {
    const evt = makeEvent('OrderPlaced', [
      { name: 'orderId', type: 'uuid' },
      { name: 'amount', type: 'number' },
    ]);
    const ir = makeIR({
      contexts: [
        makeContext('Ordering', { aggregates: [makeAggregate('Order', [evt])] }),
        makeContext('Shipping'),
      ],
      flows: [
        {
          id: 'flow-1',
          name: 'order-flow',
          moments: [
            {
              id: 'moment-0',
              name: 'Place Order',
              contextEntries: [
                { contextId: 'ctx-Ordering', nodeName: 'OrderPlaced', nodeKind: 'event' },
              ],
            },
          ],
          connections: [
            {
              id: 'conn-0',
              sourceMomentId: 'moment-0',
              targetContextId: 'ctx-Shipping',
              eventId: 'evt-OrderPlaced',
              connectionType: 'crosses-to' as const,
              schemaContract: {
                eventType: 'OrderPlaced',
                fields: [
                  { name: 'orderId', type: 'UUID', required: true },
                  { name: 'amount', type: 'number', required: true },
                ],
                relationshipType: 'CustomerSupplier',
              },
            },
          ],
        },
      ],
    });

    const output = generateAsyncApiSpec(ir);
    expect(output).toContain('channels:');
    expect(output).toContain('order-placed:');
    expect(output).toContain("address: 'order-placed'");
    expect(output).toContain("$ref: '#/components/messages/OrderPlaced'");
    expect(output).toContain("Published by Ordering, consumed by Shipping");

    expect(output).toContain('components:');
    expect(output).toContain('  messages:');
    expect(output).toContain('    OrderPlaced:');
    expect(output).toContain("      name: 'OrderPlaced'");
    expect(output).toContain('        type: object');
    expect(output).toContain('          orderId:');
    expect(output).toContain("            type: 'string'");
    expect(output).toContain('          amount:');
    expect(output).toContain("            type: 'number'");
  });

  it('deduplicates crossings by event+producer+consumer', () => {
    const evt = makeEvent('OrderShipped', [{ name: 'orderId', type: 'string' }]);
    const ir = makeIR({
      contexts: [
        makeContext('Ordering', { aggregates: [makeAggregate('Order', [evt])] }),
        makeContext('Tracking'),
      ],
      flows: [
        {
          id: 'flow-1',
          name: 'flow-a',
          moments: [
            { id: 'm0', name: 'Ship', contextEntries: [{ contextId: 'ctx-Ordering', nodeName: 'OrderShipped', nodeKind: 'event' }] },
          ],
          connections: [
            {
              id: 'conn-0',
              sourceMomentId: 'm0',
              targetContextId: 'ctx-Tracking',
              eventId: 'evt-OrderShipped',
              connectionType: 'crosses-to' as const,
              schemaContract: {
                eventType: 'OrderShipped',
                fields: [{ name: 'orderId', type: 'string', required: true }],
                relationshipType: 'CustomerSupplier',
              },
            },
          ],
        },
        {
          id: 'flow-2',
          name: 'flow-b',
          moments: [
            { id: 'm1', name: 'Ship Again', contextEntries: [{ contextId: 'ctx-Ordering', nodeName: 'OrderShipped', nodeKind: 'event' }] },
          ],
          connections: [
            {
              id: 'conn-1',
              sourceMomentId: 'm1',
              targetContextId: 'ctx-Tracking',
              eventId: 'evt-OrderShipped',
              connectionType: 'crosses-to' as const,
              schemaContract: {
                eventType: 'OrderShipped',
                fields: [{ name: 'orderId', type: 'string', required: true }],
                relationshipType: 'CustomerSupplier',
              },
            },
          ],
        },
      ],
    });

    const output = generateAsyncApiSpec(ir);
    // The channel should appear only once
    const channelMatches = output.split('order-shipped:').length - 1;
    expect(channelMatches).toBe(1);
  });

  it('maps type aliases correctly', () => {
    const evt = makeEvent('TestEvent', [
      { name: 'a', type: 'string' },
      { name: 'b', type: 'number' },
      { name: 'c', type: 'boolean' },
      { name: 'd', type: 'date' },
      { name: 'e', type: 'uuid' },
      { name: 'f', type: 'int' },
      { name: 'g', type: 'float' },
      { name: 'h', type: 'decimal' },
      { name: 'i', type: 'CustomType' },
    ]);
    const ir = makeIR({
      contexts: [
        makeContext('Test', { aggregates: [makeAggregate('Agg', [evt])] }),
        makeContext('Consumer'),
      ],
      flows: [
        {
          id: 'flow-1',
          name: 'type-flow',
          moments: [
            { id: 'm0', name: 'Step', contextEntries: [{ contextId: 'ctx-Test', nodeName: 'TestEvent', nodeKind: 'event' }] },
          ],
          connections: [
            {
              id: 'conn-0',
              sourceMomentId: 'm0',
              targetContextId: 'ctx-Consumer',
              eventId: 'evt-TestEvent',
              connectionType: 'crosses-to' as const,
              schemaContract: {
                eventType: 'TestEvent',
                fields: [
                  { name: 'a', type: 'string', required: true },
                  { name: 'b', type: 'number', required: true },
                  { name: 'c', type: 'boolean', required: true },
                  { name: 'd', type: 'date', required: true },
                  { name: 'e', type: 'uuid', required: true },
                  { name: 'f', type: 'int', required: true },
                  { name: 'g', type: 'float', required: true },
                  { name: 'h', type: 'decimal', required: true },
                  { name: 'i', type: 'CustomType', required: true },
                ],
                relationshipType: 'Conformist',
              },
            },
          ],
        },
      ],
    });

    const output = generateAsyncApiSpec(ir);
    expect(output).toContain("type: 'string'");
    expect(output).toContain("type: 'number'");
    expect(output).toContain("type: 'boolean'");
    expect(output).toContain("type: 'integer'");
  });

  it('handles kebab-case conversion for channel names', () => {
    const evt = makeEvent('OrderItemAdded', [{ name: 'id', type: 'string' }]);
    const ir = makeIR({
      contexts: [
        makeContext('Cart', { aggregates: [makeAggregate('Cart', [evt])] }),
        makeContext('Inventory'),
      ],
      flows: [
        {
          id: 'flow-1',
          name: 'cart-flow',
          moments: [
            { id: 'm0', name: 'Add Item', contextEntries: [{ contextId: 'ctx-Cart', nodeName: 'OrderItemAdded', nodeKind: 'event' }] },
          ],
          connections: [
            {
              id: 'conn-0',
              sourceMomentId: 'm0',
              targetContextId: 'ctx-Inventory',
              eventId: 'evt-OrderItemAdded',
              connectionType: 'crosses-to' as const,
              schemaContract: {
                eventType: 'OrderItemAdded',
                fields: [{ name: 'id', type: 'string', required: true }],
                relationshipType: 'CustomerSupplier',
              },
            },
          ],
        },
      ],
    });

    const output = generateAsyncApiSpec(ir);
    expect(output).toContain('order-item-added:');
  });

  it('escapes single quotes in YAML values', () => {
    const ir = makeIR({
      metadata: { name: "It's a test", version: '1.0.0', description: "It's described" },
    });

    const output = generateAsyncApiSpec(ir);
    expect(output).toContain("title: 'It''s a test'");
    expect(output).toContain("description: 'It''s described'");
  });

  it('uses fallback values when metadata is missing', () => {
    const ir = makeIR({
      metadata: { name: '', version: '' },
    });

    const output = generateAsyncApiSpec(ir);
    expect(output).toContain("title: 'Untitled'");
    expect(output).toContain("version: '1.0.0'");
  });

  it('skips crossings when event is not found in IR', () => {
    const ir = makeIR({
      contexts: [
        makeContext('Ordering'),
        makeContext('Shipping'),
      ],
      flows: [
        {
          id: 'flow-1',
          name: 'broken-flow',
          moments: [
            { id: 'm0', name: 'Step', contextEntries: [{ contextId: 'ctx-Ordering', nodeName: 'UnknownEvent', nodeKind: 'event' }] },
          ],
          connections: [
            {
              id: 'conn-0',
              sourceMomentId: 'm0',
              targetContextId: 'ctx-Shipping',
              eventId: 'evt-NonExistent',
              connectionType: 'crosses-to' as const,
              schemaContract: {
                eventType: 'NonExistent',
                fields: [],
                relationshipType: 'CustomerSupplier',
              },
            },
          ],
        },
      ],
    });

    const output = generateAsyncApiSpec(ir);
    expect(output).not.toContain('channels:');
  });

  it('skips non-crosses-to connections', () => {
    const evt = makeEvent('OrderPlaced', [{ name: 'id', type: 'string' }]);
    const ir = makeIR({
      contexts: [
        makeContext('Ordering', { aggregates: [makeAggregate('Order', [evt])] }),
        makeContext('Shipping'),
      ],
      flows: [
        {
          id: 'flow-1',
          name: 'triggered-flow',
          moments: [
            { id: 'm0', name: 'Step', contextEntries: [{ contextId: 'ctx-Ordering', nodeName: 'OrderPlaced', nodeKind: 'event' }] },
          ],
          connections: [
            {
              id: 'conn-0',
              sourceMomentId: 'm0',
              targetContextId: 'ctx-Shipping',
              eventId: 'evt-OrderPlaced',
              connectionType: 'triggered-by' as const,
            },
          ],
        },
      ],
    });

    const output = generateAsyncApiSpec(ir);
    expect(output).not.toContain('channels:');
  });

  it('finds events in context-level events (not just aggregate events)', () => {
    const evt = makeEvent('DirectEvent', [{ name: 'data', type: 'string' }]);
    const ir = makeIR({
      contexts: [
        makeContext('Source', { events: [evt] }),
        makeContext('Target'),
      ],
      flows: [
        {
          id: 'flow-1',
          name: 'direct-flow',
          moments: [
            { id: 'm0', name: 'Step', contextEntries: [{ contextId: 'ctx-Source', nodeName: 'DirectEvent', nodeKind: 'event' }] },
          ],
          connections: [
            {
              id: 'conn-0',
              sourceMomentId: 'm0',
              targetContextId: 'ctx-Target',
              eventId: 'evt-DirectEvent',
              connectionType: 'crosses-to' as const,
              schemaContract: {
                eventType: 'DirectEvent',
                fields: [{ name: 'data', type: 'string', required: true }],
                relationshipType: 'Conformist',
              },
            },
          ],
        },
      ],
    });

    const output = generateAsyncApiSpec(ir);
    expect(output).toContain('direct-event:');
    expect(output).toContain("Published by Source, consumed by Target");
  });

  it('skips crossing when producer context is not found', () => {
    const ir = makeIR({
      contexts: [
        // Only the target context exists; producer context is missing
        makeContext('Target'),
      ],
      flows: [
        {
          id: 'flow-1',
          name: 'orphan-flow',
          moments: [
            { id: 'm0', name: 'Step', contextEntries: [] },
          ],
          connections: [
            {
              id: 'conn-0',
              sourceMomentId: 'm0',
              targetContextId: 'ctx-Target',
              eventId: 'evt-OrphanEvent',
              connectionType: 'crosses-to' as const,
              schemaContract: {
                eventType: 'OrphanEvent',
                fields: [],
                relationshipType: 'Conformist',
              },
            },
          ],
        },
      ],
    });

    const output = generateAsyncApiSpec(ir);
    expect(output).not.toContain('channels:');
  });

  it('marks deprecated fields in message schema', () => {
    const ir = makeIR({
      contexts: [
        {
          ...makeIR().contexts[0],
          id: 'ctx-A',
          name: 'A',
          aggregates: [{
            id: 'agg-1', name: 'Order', identityField: { name: 'id', type: 'UUID', isArray: false, required: true },
            commands: [], events: [{
              id: 'evt-1', name: 'OrderPlaced',
              fields: [
                { name: 'orderId', type: 'UUID', isArray: false, required: true },
                { name: 'legacyId', type: 'string', isArray: false, required: true, deprecated: { reason: 'Use orderId', replacement: 'orderId' } },
              ],
            }], valueObjects: [], invariants: [],
          }],
          domainServices: [], commands: [], events: [], policies: [], sagas: [], valueObjects: [], invariants: [],
        },
        {
          ...makeIR().contexts[0],
          id: 'ctx-B', name: 'B',
          aggregates: [], domainServices: [], commands: [], events: [], policies: [], sagas: [], valueObjects: [], invariants: [],
        },
      ],
      flows: [{
        id: 'f1', name: 'Flow',
        moments: [{ id: 'm1', name: 'M1', contextEntries: [{ contextId: 'ctx-A', nodeName: 'OrderPlaced', nodeKind: 'event' }] }],
        connections: [{
          id: 'c1', sourceMomentId: 'm1', targetContextId: 'ctx-B', eventId: 'evt-1',
          connectionType: 'crosses-to' as const,
          schemaContract: { eventType: 'OrderPlaced', fields: [{ name: 'orderId', type: 'UUID', required: true }], relationshipType: 'Partnership' },
        }],
      }],
    });

    const output = generateAsyncApiSpec(ir);
    expect(output).toContain('deprecated');
  });
});
