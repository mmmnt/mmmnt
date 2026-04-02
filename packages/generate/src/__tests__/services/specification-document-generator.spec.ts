import { describe, it, expect } from 'vitest';
import type {
  IntermediateRepresentation,
  ContextDefinition,
  AggregateDefinition,
  CommandDefinition,
  EventDefinition,
  ValueObjectDefinition,
  FlowDefinition,
  SagaDefinition,
  PolicyDefinition,
  InvariantDefinition,
} from '@mmmnt/core';
import { SpecificationDocumentGenerator } from '../../services/specification-document-generator.js';

function makeCommand(name: string): CommandDefinition {
  return {
    id: `cmd-${name}`,
    name,
    inputs: [{ name: 'id', type: 'UUID', isArray: false, required: true }],
    preconditions: [{ name: 'exists', description: 'Must exist' }],
    emitsEvent: `${name}Completed`,
  };
}

function makeEvent(name: string): EventDefinition {
  return {
    id: `evt-${name}`,
    name,
    fields: [{ name: 'id', type: 'UUID', isArray: false, required: true }],
  };
}

function makeValueObject(name: string): ValueObjectDefinition {
  return {
    id: `vo-${name}`,
    name,
    fields: [{ name: 'value', type: 'string', isArray: false, required: true }],
  };
}

function makeAggregate(
  name: string,
  options?: {
    commands?: CommandDefinition[];
    events?: EventDefinition[];
    valueObjects?: ValueObjectDefinition[];
  },
): AggregateDefinition {
  return {
    id: `agg-${name}`,
    name,
    identityField: { name: 'id', type: 'UUID', isArray: false, required: true },
    commands: options?.commands ?? [],
    events: options?.events ?? [],
    valueObjects: options?.valueObjects ?? [],
    invariants: [],
  };
}

function makeContext(
  name: string,
  options?: {
    classification?: 'Core' | 'Supporting';
    aggregates?: AggregateDefinition[];
  },
): ContextDefinition {
  const aggregates = options?.aggregates ?? [];
  return {
    id: `ctx-${name}`,
    name,
    classification: options?.classification,
    aggregates,
    domainServices: [],
    commands: aggregates.flatMap((a) => a.commands),
    events: aggregates.flatMap((a) => a.events),
    policies: [],
    sagas: [],
    valueObjects: aggregates.flatMap((a) => a.valueObjects),
    invariants: [],
  };
}

function makeIR(overrides?: Partial<IntermediateRepresentation>): IntermediateRepresentation {
  return {
    contexts: [],
    flows: [],
    glossary: [],
    relationships: [],
    metadata: { name: 'TestSpec', version: '1.0.0' },
    ...overrides,
  };
}

describe('SpecificationDocumentGenerator', () => {
  const generator = new SpecificationDocumentGenerator();

  it('produces exactly one document', () => {
    const ir = makeIR({
      contexts: [makeContext('Ordering', { aggregates: [makeAggregate('Order')] })],
    });
    const docs = generator.generate(ir);
    expect(docs).toHaveLength(1);
    expect(docs[0].documentType).toBe('specification');
    expect(docs[0].filePath).toBe('specification.md');
  });

  it('returns empty for empty IR', () => {
    const docs = generator.generate(makeIR());
    expect(docs).toHaveLength(0);
  });

  it('includes executive summary with counts', () => {
    const ir = makeIR({
      contexts: [
        makeContext('Ordering', {
          aggregates: [
            makeAggregate('Order', {
              commands: [makeCommand('PlaceOrder'), makeCommand('CancelOrder')],
              events: [makeEvent('OrderPlaced'), makeEvent('OrderCancelled')],
            }),
          ],
        }),
        makeContext('Shipping', {
          aggregates: [makeAggregate('Shipment')],
        }),
      ],
    });

    const content = generator.generate(ir)[0].content;
    // Executive summary is now rendered as an "At a Glance" table
    expect(content).toContain('## At a Glance');
    expect(content).toContain('**Ordering**');
    expect(content).toContain('**Shipping**');
    // Verify command/event counts appear in the table rows
    expect(content).toContain('| 1 | 2 | 2 |');
    expect(content).toContain('| 1 | 0 | 0 |');
  });

  it('renders context names with classification', () => {
    const ir = makeIR({
      contexts: [
        makeContext('Ordering', { classification: 'Core', aggregates: [makeAggregate('Order')] }),
        makeContext('Shipping', {
          classification: 'Supporting',
          aggregates: [makeAggregate('Shipment')],
        }),
      ],
    });

    const content = generator.generate(ir)[0].content;
    // Classification now rendered in brackets instead of em-dash
    expect(content).toContain('### Ordering [Core]');
    expect(content).toContain('### Shipping [Supporting]');
  });

  it('renders aggregate details with commands and events', () => {
    const ir = makeIR({
      contexts: [
        makeContext('Ordering', {
          aggregates: [
            makeAggregate('Order', {
              commands: [makeCommand('PlaceOrder')],
              events: [makeEvent('OrderPlaced')],
              valueObjects: [makeValueObject('OrderItem')],
            }),
          ],
        }),
      ],
    });

    const content = generator.generate(ir)[0].content;
    expect(content).toContain('#### Order');
    expect(content).toContain('**PlaceOrder**');
    // Events now rendered with trailing colon
    expect(content).toContain('**OrderPlaced:**');
    expect(content).toContain('**OrderItem**');
  });

  it('renders relationships', () => {
    const ir = makeIR({
      contexts: [
        makeContext('Ordering', { aggregates: [makeAggregate('Order')] }),
        makeContext('Shipping', { aggregates: [makeAggregate('Shipment')] }),
      ],
      relationships: [
        {
          sourceContextId: 'ctx-Ordering',
          targetContextId: 'ctx-Shipping',
          relationshipType: 'CustomerSupplier',
          contract: 'OrderPlaced contract',
        },
      ],
    });

    const content = generator.generate(ir)[0].content;
    expect(content).toContain('**Ordering**');
    expect(content).toContain('**Shipping**');
    // Relationships now rendered in the Context Boundaries section and mermaid graph
    expect(content).toContain('## Context Boundaries');
    expect(content).toContain('Ordering');
    expect(content).toContain('Shipping');
  });

  it('renders footer with generation notice', () => {
    const ir = makeIR({
      contexts: [makeContext('Ordering', { aggregates: [makeAggregate('Order')] })],
    });

    const content = generator.generate(ir)[0].content;
    // Footer now uses capitalized "Generated by"
    expect(content).toContain('Generated by');
    expect(content).toContain('Moment');
  });

  it('renders mermaid context map diagram', () => {
    const ir = makeIR({
      contexts: [
        makeContext('Ordering', { classification: 'Core', aggregates: [makeAggregate('Order')] }),
        makeContext('Shipping', { classification: 'Supporting', aggregates: [makeAggregate('Shipment')] }),
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
                { contextId: 'ctx-Ordering', nodeName: 'PlaceOrder', nodeKind: 'command' },
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
                fields: [{ name: 'orderId', type: 'UUID', required: true }],
                relationshipType: 'CustomerSupplier',
              },
            },
          ],
        },
      ],
    });

    const content = generator.generate(ir)[0].content;
    expect(content).toContain('```mermaid');
    expect(content).toContain('graph LR');
    expect(content).toContain('Ordering');
    expect(content).toContain('Shipping');
    expect(content).toContain('CustomerSupplier');
  });

  it('renders mermaid sequence diagram for flows', () => {
    const ir = makeIR({
      contexts: [
        makeContext('Ordering', { classification: 'Core', aggregates: [makeAggregate('Order')] }),
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
                { contextId: 'ctx-Ordering', nodeName: 'PlaceOrder', nodeKind: 'command' },
                { contextId: 'ctx-Ordering', nodeName: 'OrderPlaced', nodeKind: 'event' },
              ],
            },
          ],
          connections: [],
        },
      ],
    });

    const content = generator.generate(ir)[0].content;
    expect(content).toContain('sequenceDiagram');
    expect(content).toContain('participant Ordering');
    expect(content).toContain('PlaceOrder');
  });

  it('renders context description in domain model', () => {
    const ctx = makeContext('Ordering', { aggregates: [makeAggregate('Order')] });
    (ctx as any).description = 'Handles order lifecycle';
    const ir = makeIR({ contexts: [ctx] });

    const content = generator.generate(ir)[0].content;
    expect(content).toContain('> Handles order lifecycle');
  });

  it('renders saga narrative with state progression', () => {
    const saga: SagaDefinition = {
      id: 'saga-OrderProcess',
      name: 'OrderProcess',
      trigger: 'OrderPlaced',
      states: ['Pending', 'Processing', 'Completed'],
      compensation: 'CancelOrder',
      timeout: '30 minutes',
    };
    const ctx = makeContext('Ordering', { aggregates: [makeAggregate('Order')] });
    ctx.sagas = [saga];
    const ir = makeIR({
      contexts: [ctx],
      flows: [
        {
          id: 'flow-1',
          name: 'order-flow',
          moments: [
            {
              id: 'moment-0',
              name: 'Start Order',
              contextEntries: [
                { contextId: 'ctx-Ordering', nodeName: 'OrderPlaced', nodeKind: 'event' },
              ],
            },
            {
              id: 'moment-1',
              name: 'Process Order',
              contextEntries: [
                { contextId: 'ctx-Ordering', nodeName: 'SomeOtherEvent', nodeKind: 'event' },
              ],
            },
          ],
          connections: [],
        },
      ],
    });

    const content = generator.generate(ir)[0].content;
    // Saga model section
    expect(content).toContain('**OrderProcess**');
    expect(content).toContain('Pending → Processing → Completed');
    expect(content).toContain('Triggered by: OrderPlaced');
    expect(content).toContain('Compensation: CancelOrder');
    // Saga state narrative label on moment
    expect(content).toContain('OrderProcess:');
  });

  it('renders data glossary from value objects', () => {
    const vo = makeValueObject('Money');
    const agg = makeAggregate('Order', { valueObjects: [vo] });
    const ir = makeIR({
      contexts: [makeContext('Ordering', { aggregates: [agg] })],
    });

    const content = generator.generate(ir)[0].content;
    expect(content).toContain('## Data Glossary');
    expect(content).toContain('**Money**');
    expect(content).toContain('| `value` | string |');
  });

  it('renders data glossary from context-level value objects', () => {
    const ctx = makeContext('Ordering', { aggregates: [makeAggregate('Order')] });
    ctx.valueObjects = [
      { id: 'vo-Address', name: 'Address', fields: [{ name: 'street', type: 'string', isArray: false, required: true }] },
    ];
    const ir = makeIR({ contexts: [ctx] });

    const content = generator.generate(ir)[0].content;
    expect(content).toContain('**Address**');
    expect(content).toContain('| `street` | string |');
  });

  it('renders moment branches with terminal and non-terminal paths', () => {
    const ir = makeIR({
      contexts: [
        makeContext('Ordering', { aggregates: [makeAggregate('Order')] }),
      ],
      flows: [
        {
          id: 'flow-1',
          name: 'order-flow',
          moments: [
            {
              id: 'moment-0',
              name: 'Validate Order',
              contextEntries: [
                { contextId: 'ctx-Ordering', nodeName: 'ValidateCmd', nodeKind: 'command' },
              ],
              branches: [
                {
                  condition: 'valid',
                  entries: [
                    { contextId: 'ctx-Ordering', nodeName: 'OrderValidated', nodeKind: 'event' },
                  ],
                },
                {
                  condition: 'invalid',
                  entries: [
                    { contextId: 'ctx-Ordering', nodeName: 'OrderRejected', nodeKind: 'event', terminal: true },
                  ],
                },
              ],
            },
          ],
          connections: [],
        },
      ],
    });

    const content = generator.generate(ir)[0].content;
    expect(content).toContain('If valid');
    expect(content).toContain('If invalid');
    expect(content).toContain('flow terminates');
  });

  it('renders crossing in sequence diagram', () => {
    const ir = makeIR({
      contexts: [
        makeContext('Ordering', { classification: 'Core', aggregates: [makeAggregate('Order')] }),
        makeContext('Shipping', { classification: 'Supporting', aggregates: [makeAggregate('Shipment')] }),
      ],
      flows: [
        {
          id: 'flow-1',
          name: 'order-ship-flow',
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
                fields: [{ name: 'orderId', type: 'UUID', required: true }],
                relationshipType: 'CustomerSupplier',
              },
            },
          ],
        },
      ],
    });

    const content = generator.generate(ir)[0].content;
    expect(content).toContain('Ordering->>Shipping: OrderPlaced (crosses)');
  });

  it('renders context boundaries with schema contract fields', () => {
    const ir = makeIR({
      contexts: [
        makeContext('Ordering', { classification: 'Core', aggregates: [makeAggregate('Order')] }),
        makeContext('Shipping', { classification: 'Supporting', aggregates: [makeAggregate('Shipment')] }),
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
                { contextId: 'ctx-Ordering', nodeName: 'PlaceOrder', nodeKind: 'command' },
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
                  { name: 'note', type: 'string', required: false },
                ],
                relationshipType: 'CustomerSupplier',
              },
            },
          ],
        },
      ],
    });

    const content = generator.generate(ir)[0].content;
    expect(content).toContain('## Context Boundaries');
    expect(content).toContain('### OrderPlaced');
    expect(content).toContain('**Ordering** → **Shipping** via CustomerSupplier');
    expect(content).toContain('| `orderId` | UUID | ✓ |');
    expect(content).toContain('| `note` | string | — |');
  });

  it('renders policies triggered by events', () => {
    const ctx = makeContext('Ordering', { aggregates: [makeAggregate('Order')] });
    const pol: PolicyDefinition = {
      id: 'pol-AutoConfirm',
      name: 'AutoConfirm',
      trigger: 'OrderPlaced',
      action: 'Automatically confirm the order',
    };
    ctx.policies = [pol];
    ctx.events = [makeEvent('OrderPlaced')];
    const ir = makeIR({
      contexts: [ctx],
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
          connections: [],
        },
      ],
    });

    const content = generator.generate(ir)[0].content;
    expect(content).toContain('Policy: AutoConfirm');
    expect(content).toContain('Automatically confirm the order');
  });

  it('renders applicable business rules for command moments', () => {
    const cmd = makeCommand('PlaceOrder');
    const evt = makeEvent('OrderPlaced');
    const agg = makeAggregate('Order', { commands: [cmd], events: [evt] });
    const inv: InvariantDefinition = {
      id: 'inv-max-items',
      description: 'Order cannot exceed 100 items',
      scope: 'Order',
    };
    const ctx = makeContext('Ordering', { aggregates: [agg] });
    ctx.invariants = [inv];
    const ir = makeIR({
      contexts: [ctx],
      flows: [
        {
          id: 'flow-1',
          name: 'order-flow',
          moments: [
            {
              id: 'moment-0',
              name: 'Place Order',
              contextEntries: [
                { contextId: 'ctx-Ordering', nodeName: 'PlaceOrder', nodeKind: 'command' },
              ],
            },
          ],
          connections: [],
        },
      ],
    });

    const content = generator.generate(ir)[0].content;
    expect(content).toContain('Rule inv-max-items');
    expect(content).toContain('Order cannot exceed 100 items');
  });

  it('infers title from flow description when no metadata name', () => {
    const ir = makeIR({
      metadata: { name: '', version: '1.0.0' },
      contexts: [makeContext('Ordering', { aggregates: [makeAggregate('Order')] })],
      flows: [
        {
          id: 'flow-1',
          name: 'order-flow',
          description: 'A comprehensive order processing system. It handles everything.',
          moments: [],
          connections: [],
        },
      ],
    });

    const content = generator.generate(ir)[0].content;
    expect(content).toContain('# A comprehensive order processing system');
  });

  it('infers title from context names when no flow description and short first sentence', () => {
    const ir = makeIR({
      metadata: { name: '', version: '1.0.0' },
      contexts: [
        makeContext('Alpha', { aggregates: [makeAggregate('A')] }),
        makeContext('Beta', { aggregates: [makeAggregate('B')] }),
      ],
      flows: [
        {
          id: 'flow-1',
          name: 'short',
          description: 'Hi.',
          moments: [],
          connections: [],
        },
      ],
    });

    const content = generator.generate(ir)[0].content;
    expect(content).toContain('Alpha + Beta Domain');
  });

  it('falls back to "Domain Specification" when many contexts and no name', () => {
    const ir = makeIR({
      metadata: { name: '', version: '1.0.0' },
      contexts: [
        makeContext('A', { aggregates: [makeAggregate('A1')] }),
        makeContext('B', { aggregates: [makeAggregate('B1')] }),
        makeContext('C', { aggregates: [makeAggregate('C1')] }),
        makeContext('D', { aggregates: [makeAggregate('D1')] }),
      ],
    });

    const content = generator.generate(ir)[0].content;
    expect(content).toContain('# Domain Specification');
  });

  it('renders multiple flows with headings', () => {
    const ir = makeIR({
      contexts: [makeContext('Sales', { aggregates: [makeAggregate('Deal')] })],
      flows: [
        {
          id: 'flow-1',
          name: 'Flow Alpha',
          description: 'First flow',
          moments: [
            { id: 'm0', name: 'Step A', contextEntries: [{ contextId: 'ctx-Sales', nodeName: 'SomeEvt', nodeKind: 'event' }] },
          ],
          connections: [],
        },
        {
          id: 'flow-2',
          name: 'Flow Beta',
          description: 'Second flow',
          moments: [
            { id: 'm1', name: 'Step B', contextEntries: [{ contextId: 'ctx-Sales', nodeName: 'OtherEvt', nodeKind: 'event' }] },
          ],
          connections: [],
        },
      ],
    });

    const content = generator.generate(ir)[0].content;
    expect(content).toContain('### Flow Alpha');
    expect(content).toContain('> First flow');
    expect(content).toContain('### Flow Beta');
    expect(content).toContain('> Second flow');
  });

  it('renders sequence diagram branches as alt blocks', () => {
    const ir = makeIR({
      contexts: [makeContext('Sales', { aggregates: [makeAggregate('Deal')] })],
      flows: [
        {
          id: 'flow-1',
          name: 'branching-flow',
          moments: [
            {
              id: 'moment-0',
              name: 'Decide',
              contextEntries: [
                { contextId: 'ctx-Sales', nodeName: 'Cmd', nodeKind: 'command' },
              ],
              branches: [
                {
                  condition: 'yes',
                  entries: [{ contextId: 'ctx-Sales', nodeName: 'Approved', nodeKind: 'event' }],
                },
                {
                  condition: 'no',
                  entries: [{ contextId: 'ctx-Sales', nodeName: 'Rejected', nodeKind: 'event' }],
                },
              ],
            },
          ],
          connections: [],
        },
      ],
    });

    const content = generator.generate(ir)[0].content;
    expect(content).toContain('alt yes');
    expect(content).toContain('else no');
    expect(content).toContain('end');
  });

  it('renders command narrative with precondition and emitsEvent', () => {
    const cmd = makeCommand('PlaceOrder');
    const evt = makeEvent('OrderPlaced');
    const agg = makeAggregate('Order', { commands: [cmd], events: [evt] });
    const ctx = makeContext('Ordering', { aggregates: [agg] });
    const ir = makeIR({
      contexts: [ctx],
      flows: [
        {
          id: 'flow-1',
          name: 'order-flow',
          moments: [
            {
              id: 'moment-0',
              name: 'Place Order',
              contextEntries: [
                { contextId: 'ctx-Ordering', nodeName: 'PlaceOrder', nodeKind: 'command' },
                { contextId: 'ctx-Ordering', nodeName: 'OrderPlaced', nodeKind: 'event' },
              ],
            },
          ],
          connections: [],
        },
      ],
    });

    const content = generator.generate(ir)[0].content;
    expect(content).toContain('*Requires:* Must exist');
    expect(content).toContain('performs **PlaceOrder**');
    expect(content).toContain('produces **PlaceOrderCompleted**');
  });

  it('renders crossing narrative with target context name', () => {
    const ir = makeIR({
      contexts: [
        makeContext('Ordering', { aggregates: [makeAggregate('Order')] }),
        makeContext('Shipping', { aggregates: [makeAggregate('Shipment')] }),
      ],
      flows: [
        {
          id: 'flow-1',
          name: 'order-flow',
          moments: [
            {
              id: 'moment-0',
              name: 'Cross',
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
                fields: [],
                relationshipType: 'CustomerSupplier',
              },
            },
          ],
        },
      ],
    });

    const content = generator.generate(ir)[0].content;
    expect(content).toContain('crosses to **Shipping**');
  });

  it('renders event array fields with [] suffix', () => {
    const evt: EventDefinition = {
      id: 'evt-OrderPlaced',
      name: 'OrderPlaced',
      fields: [{ name: 'items', type: 'OrderItem', isArray: true, required: true }],
    };
    const agg = makeAggregate('Order', { events: [evt] });
    const ir = makeIR({
      contexts: [makeContext('Ordering', { aggregates: [agg] })],
    });

    const content = generator.generate(ir)[0].content;
    expect(content).toContain('*OrderItem[]*');
  });

  it('uses metadata description as fallback for inferDescription', () => {
    const ir = makeIR({
      metadata: { name: 'Test', version: '1.0.0', description: 'A domain spec' },
      contexts: [makeContext('Ordering', { aggregates: [makeAggregate('Order')] })],
    });

    const content = generator.generate(ir)[0].content;
    expect(content).toContain('> A domain spec');
  });

  it('renders value object array fields with [] suffix', () => {
    const vo: ValueObjectDefinition = {
      id: 'vo-List',
      name: 'ItemList',
      fields: [{ name: 'items', type: 'string', isArray: true, required: true }],
    };
    const agg = makeAggregate('Order', { valueObjects: [vo] });
    const ir = makeIR({
      contexts: [makeContext('Ordering', { aggregates: [agg] })],
    });

    const content = generator.generate(ir)[0].content;
    expect(content).toContain('| `items` | string[] |');
  });

  it('renders TOC without "What Happens" when no flows exist', () => {
    const ir = makeIR({
      contexts: [makeContext('Ordering', { aggregates: [makeAggregate('Order')] })],
    });

    const content = generator.generate(ir)[0].content;
    expect(content).toContain('## Table of Contents');
    expect(content).not.toContain('2. [What Happens]');
  });

  it('skips context boundaries section when no crossings or relationships', () => {
    const ir = makeIR({
      contexts: [makeContext('Ordering', { aggregates: [makeAggregate('Order')] })],
      flows: [
        { id: 'f1', name: 'simple', moments: [{ id: 'm0', name: 'Step', contextEntries: [{ contextId: 'ctx-Ordering', nodeName: 'Evt', nodeKind: 'event' }] }], connections: [] },
      ],
    });

    const content = generator.generate(ir)[0].content;
    expect(content).not.toContain('## Context Boundaries');
  });
});
