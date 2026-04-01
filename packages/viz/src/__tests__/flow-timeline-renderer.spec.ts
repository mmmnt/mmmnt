import { describe, it, expect } from 'vitest';
import type { IntermediateRepresentation } from '@mmmnt/core';
import { renderTimeline } from '../renderers/flow-timeline-renderer.js';

function makeIR(overrides: Partial<IntermediateRepresentation> = {}): IntermediateRepresentation {
  return {
    contexts: overrides.contexts ?? [
      {
        id: 'ctx-ordering',
        name: 'Ordering',
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
    flows: overrides.flows ?? [
      {
        id: 'flow-1',
        name: 'Place Order',
        moments: [
          {
            id: 'moment-1',
            name: 'Accept Order',
            contextEntries: [
              { contextId: 'ctx-ordering', nodeName: 'PlaceOrder', nodeKind: 'command' as const },
            ],
          },
        ],
        connections: [],
      },
    ],
    glossary: overrides.glossary ?? [],
    relationships: overrides.relationships ?? [],
    metadata: overrides.metadata ?? { name: 'test', version: '1.0.0' },
  };
}

describe('FlowTimelineRenderer', () => {
  it('renders minimal IR — single lane, single entry', () => {
    const ir = makeIR();

    const layout = renderTimeline(ir);

    expect(layout.lanes).toHaveLength(1);
    expect(layout.lanes[0].contextId).toBe('ctx-ordering');
    expect(layout.entries).toHaveLength(1);
    expect(layout.entries[0].momentId).toBe('moment-1');
    expect(layout.entries[0].x).toBeGreaterThan(0);
    expect(layout.entries[0].width).toBeGreaterThan(0);
    expect(layout.connections).toHaveLength(0);
    expect(layout.dimensions.width).toBeGreaterThan(0);
    expect(layout.dimensions.height).toBeGreaterThan(0);
  });

  it('renders multi-lane IR with positioned entries', () => {
    const ir = makeIR({
      contexts: [
        {
          id: 'ctx-ordering',
          name: 'Ordering',
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
        {
          id: 'ctx-billing',
          name: 'Billing',
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
          id: 'flow-1',
          name: 'Full Order',
          moments: [
            {
              id: 'moment-1',
              name: 'Order',
              contextEntries: [
                { contextId: 'ctx-ordering', nodeName: 'PlaceOrder', nodeKind: 'command' as const },
              ],
            },
            {
              id: 'moment-2',
              name: 'Ship',
              contextEntries: [
                { contextId: 'ctx-shipping', nodeName: 'ShipOrder', nodeKind: 'command' as const },
              ],
            },
            {
              id: 'moment-3',
              name: 'Bill',
              contextEntries: [
                {
                  contextId: 'ctx-billing',
                  nodeName: 'ChargeBilling',
                  nodeKind: 'command' as const,
                },
              ],
            },
          ],
          connections: [],
        },
      ],
    });

    const layout = renderTimeline(ir);

    expect(layout.lanes).toHaveLength(3);
    // Lanes ordered by context declaration order
    expect(layout.lanes[0].contextName).toBe('Ordering');
    expect(layout.lanes[1].contextName).toBe('Shipping');
    expect(layout.lanes[2].contextName).toBe('Billing');
    // Lanes have different y positions
    expect(layout.lanes[1].y).toBeGreaterThan(layout.lanes[0].y);
    expect(layout.lanes[2].y).toBeGreaterThan(layout.lanes[1].y);

    expect(layout.entries).toHaveLength(3);
  });

  it('computes cross-lane connection arrows', () => {
    const ir = makeIR({
      contexts: [
        {
          id: 'ctx-ordering',
          name: 'Ordering',
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
          id: 'flow-1',
          name: 'Order to Ship',
          moments: [
            {
              id: 'moment-1',
              name: 'Order',
              contextEntries: [
                { contextId: 'ctx-ordering', nodeName: 'PlaceOrder', nodeKind: 'command' as const },
              ],
            },
            {
              id: 'moment-2',
              name: 'Ship',
              contextEntries: [
                { contextId: 'ctx-shipping', nodeName: 'ShipOrder', nodeKind: 'command' as const },
              ],
            },
          ],
          connections: [
            {
              id: 'conn-1',
              sourceMomentId: 'moment-1',
              targetContextId: 'ctx-shipping',
              eventId: 'evt-order-placed',
              connectionType: 'crosses-to' as const,
              schemaContract: {
                eventType: 'OrderPlaced',
                fields: [],
                relationshipType: 'customer-supplier',
              },
            },
          ],
        },
      ],
    });

    const layout = renderTimeline(ir);

    expect(layout.connections).toHaveLength(1);
    expect(layout.connections[0].sourceMomentId).toBe('moment-1');
    expect(layout.connections[0].targetContextId).toBe('ctx-shipping');
    // Source and target lanes have different Y
    expect(layout.connections[0].sourceLaneY).not.toBe(layout.connections[0].targetLaneY);
  });

  it('VZ-01: determinism — same IR produces identical TimelineLayout', () => {
    const ir = makeIR();

    const layout1 = renderTimeline(ir);
    const layout2 = renderTimeline(ir);

    expect(JSON.stringify(layout1)).toBe(JSON.stringify(layout2));
  });

  it('VZ-02: pure function — no mutations to input IR', () => {
    const ir = makeIR();
    const irSnapshot = JSON.stringify(ir);

    renderTimeline(ir);

    expect(JSON.stringify(ir)).toBe(irSnapshot);
  });

  it('handles IR with no flows (empty entries)', () => {
    const ir = makeIR({ flows: [] });

    const layout = renderTimeline(ir);

    expect(layout.entries).toHaveLength(0);
    expect(layout.connections).toHaveLength(0);
    expect(layout.dimensions.width).toBeGreaterThan(0);
  });

  it('handles IR with no contexts (empty lanes)', () => {
    const ir = makeIR({ contexts: [], flows: [] });

    const layout = renderTimeline(ir);

    expect(layout.lanes).toHaveLength(0);
    expect(layout.dimensions.height).toBe(0);
  });

  it('handles crossing with missing source moment gracefully', () => {
    const ir = makeIR({
      contexts: [
        {
          id: 'ctx-a',
          name: 'A',
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
          id: 'ctx-b',
          name: 'B',
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
          id: 'flow-1',
          name: 'Test',
          moments: [
            {
              id: 'moment-1',
              name: 'F1',
              contextEntries: [],
            },
          ],
          connections: [
            {
              id: 'conn-1',
              sourceMomentId: 'moment-1',
              targetContextId: 'ctx-b',
              eventId: 'evt-1',
              connectionType: 'crosses-to' as const,
              schemaContract: {
                eventType: 'Evt',
                fields: [],
                relationshipType: 'partnership',
              },
            },
          ],
        },
      ],
    });

    const layout = renderTimeline(ir);

    // Fallback: source moment has no context entries → uses targetContextId
    expect(layout.connections).toHaveLength(1);
  });
});
