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
        makeContext('Shipping', {
          classification: 'Supporting',
          aggregates: [makeAggregate('Shipment')],
        }),
      ],
      flows: [
        {
          id: 'flow-1',
          name: 'order-flow',
          lanes: [],
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
          lanes: [],
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
          lanes: [],
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

  it('renders an orchestration as invoked by its command, on its relay event, with what it issues (ADR-038 §2)', () => {
    const saga: SagaDefinition = {
      id: 'saga-OrderProcess',
      name: 'OrderProcess',
      keyword: 'orchestration',
      trigger: 'StartOrder',
      startEvent: 'OrderPlaced',
      states: ['Pending', 'Completed'],
      compensation: 'none',
      timeout: '30 minutes',
      commands: [{ id: 'cmd-StartOrder', name: 'StartOrder', inputs: [], preconditions: [] }],
      issues: [{ name: 'ReserveStock' }, { name: 'ship', external: 'Carrier' }],
      compensations: [{ none: true }],
    };
    const ctx = makeContext('Ordering', { aggregates: [makeAggregate('Order')] });
    ctx.sagas = [saga];

    const content = generator.generate(makeIR({ contexts: [ctx] }))[0].content;
    expect(content).toContain('Invoked by: StartOrder (on OrderPlaced)');
    expect(content).toContain('Issues: ReserveStock, Carrier.ship');
    expect(content).not.toContain('Triggered by:');
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
      {
        id: 'vo-Address',
        name: 'Address',
        fields: [{ name: 'street', type: 'string', isArray: false, required: true }],
      },
    ];
    const ir = makeIR({ contexts: [ctx] });

    const content = generator.generate(ir)[0].content;
    expect(content).toContain('**Address**');
    expect(content).toContain('| `street` | string |');
  });

  it('renders deprecated fields with strikethrough in glossary and events', () => {
    const vo = makeValueObject('Money');
    vo.fields.push({
      name: 'legacyCurrency',
      type: 'string',
      isArray: false,
      required: true,
      deprecated: { reason: 'Use currencyCode', replacement: 'currencyCode' },
    });
    const agg = makeAggregate('Order', { valueObjects: [vo] });
    agg.events = [
      {
        id: 'evt-1',
        name: 'OrderPlaced',
        fields: [
          { name: 'orderId', type: 'UUID', isArray: false, required: true },
          {
            name: 'oldField',
            type: 'string',
            isArray: false,
            required: true,
            deprecated: { reason: 'Replaced', replacement: 'newField' },
          },
        ],
      },
    ];
    const ir = makeIR({ contexts: [makeContext('Ordering', { aggregates: [agg] })] });

    const content = generator.generate(ir)[0].content;
    expect(content).toContain('~~`legacyCurrency`~~ (deprecated)');
    expect(content).toContain('~~`oldField`~~ (deprecated)');
    expect(content).not.toContain('~~`orderId`~~');
  });

  it('renders moment branches with terminal and non-terminal paths', () => {
    const ir = makeIR({
      contexts: [makeContext('Ordering', { aggregates: [makeAggregate('Order')] })],
      flows: [
        {
          id: 'flow-1',
          name: 'order-flow',
          lanes: [],
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
                    {
                      contextId: 'ctx-Ordering',
                      nodeName: 'OrderRejected',
                      nodeKind: 'event',
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

    const content = generator.generate(ir)[0].content;
    expect(content).toContain('If valid');
    expect(content).toContain('If invalid');
    expect(content).toContain('flow terminates');
  });

  it('renders crossing in sequence diagram', () => {
    const ir = makeIR({
      contexts: [
        makeContext('Ordering', { classification: 'Core', aggregates: [makeAggregate('Order')] }),
        makeContext('Shipping', {
          classification: 'Supporting',
          aggregates: [makeAggregate('Shipment')],
        }),
      ],
      flows: [
        {
          id: 'flow-1',
          name: 'order-ship-flow',
          lanes: [],
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
        makeContext('Shipping', {
          classification: 'Supporting',
          aggregates: [makeAggregate('Shipment')],
        }),
      ],
      flows: [
        {
          id: 'flow-1',
          name: 'order-flow',
          lanes: [],
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
          lanes: [],
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
          lanes: [],
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
          lanes: [],
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
          lanes: [],
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
          lanes: [],
          moments: [
            {
              id: 'm0',
              name: 'Step A',
              contextEntries: [{ contextId: 'ctx-Sales', nodeName: 'SomeEvt', nodeKind: 'event' }],
            },
          ],
          connections: [],
        },
        {
          id: 'flow-2',
          name: 'Flow Beta',
          description: 'Second flow',
          lanes: [],
          moments: [
            {
              id: 'm1',
              name: 'Step B',
              contextEntries: [{ contextId: 'ctx-Sales', nodeName: 'OtherEvt', nodeKind: 'event' }],
            },
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
          lanes: [],
          moments: [
            {
              id: 'moment-0',
              name: 'Decide',
              contextEntries: [{ contextId: 'ctx-Sales', nodeName: 'Cmd', nodeKind: 'command' }],
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
          lanes: [],
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
          lanes: [],
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
        {
          id: 'f1',
          name: 'simple',
          lanes: [],
          moments: [
            {
              id: 'm0',
              name: 'Step',
              contextEntries: [{ contextId: 'ctx-Ordering', nodeName: 'Evt', nodeKind: 'event' }],
            },
          ],
          connections: [],
        },
      ],
    });

    const content = generator.generate(ir)[0].content;
    expect(content).not.toContain('## Context Boundaries');
  });
  describe('returns, fallbacks and unresolved references', () => {
    function makeLoopIR(): IntermediateRepresentation {
      const flow: FlowDefinition = {
        id: 'flow-loop',
        name: 'loop-flow',
        lanes: [],
        moments: [
          {
            id: 'm-validate',
            name: 'Validate Order',
            contextEntries: [
              { contextId: 'ctx-Ordering', nodeName: 'PlaceOrder', nodeKind: 'command' },
              { contextId: 'ctx-Ordering', nodeName: 'OrderPlaced', nodeKind: 'event' },
              {
                contextId: 'ctx-Ordering',
                nodeName: 'OrderAbandoned',
                nodeKind: 'event',
                terminal: true,
              },
            ],
          },
          {
            id: 'm-review',
            name: 'Review Order',
            contextEntries: [],
            branches: [
              {
                condition: 'NeedsRetry',
                entries: [
                  { contextId: 'ctx-Shipping', nodeName: 'RetryRequested', nodeKind: 'event' },
                ],
              },
              {
                condition: 'NeedsEscalation',
                entries: [{ contextId: 'ctx-Shipping', nodeName: 'Escalated', nodeKind: 'event' }],
              },
              {
                condition: 'LostTrack',
                entries: [{ contextId: 'ctx-Shipping', nodeName: 'TrackLost', nodeKind: 'event' }],
              },
            ],
          },
          {
            id: 'm-reject',
            name: 'Reject Order',
            contextEntries: [],
            branches: [
              {
                condition: 'Fraud',
                entries: [
                  { contextId: 'ctx-Ordering', nodeName: 'FraudNoted', nodeKind: 'event' },
                  {
                    contextId: 'ctx-Ordering',
                    nodeName: 'OrderRejected',
                    nodeKind: 'event',
                    terminal: true,
                  },
                ],
              },
            ],
          },
          { id: 'm-empty', name: 'Quiet Period', contextEntries: [] },
        ],
        connections: [
          {
            id: 'ret-resolved',
            sourceMomentId: 'm-review',
            targetContextId: 'ctx-Ordering',
            eventId: 'evt-RetryRequested',
            connectionType: 'returns-to',
            targetMomentId: 'm-validate',
            branchCondition: 'NeedsRetry',
          },
          {
            id: 'ret-label',
            sourceMomentId: 'm-review',
            targetContextId: 'ctx-Ordering',
            eventId: 'evt-Escalated',
            connectionType: 'returns-to',
            targetMomentId: 'm-gone',
            targetMomentLabel: 'Manual Desk',
            branchCondition: 'NeedsEscalation',
          },
          {
            id: 'ret-unlabelled',
            sourceMomentId: 'm-review',
            targetContextId: 'ctx-Ordering',
            eventId: 'evt-TrackLost',
            connectionType: 'returns-to',
            branchCondition: 'LostTrack',
          },
          {
            id: 'x-named',
            sourceMomentId: 'm-validate',
            targetContextId: 'ctx-Shipping',
            eventId: 'evt-OrderPlaced',
            sourceNodeName: 'OrderPlaced',
            connectionType: 'crosses-to',
            schemaContract: {
              eventType: 'OrderPlaced',
              fields: [],
              relationshipType: 'Partnership',
            },
          },
          {
            id: 'x-duplicate',
            sourceMomentId: 'm-validate',
            targetContextId: 'ctx-Shipping',
            eventId: 'evt-OrderPlaced',
            sourceNodeName: 'Undeclared',
            connectionType: 'crosses-to',
            schemaContract: {
              eventType: 'OrderPlacedAgain',
              fields: [],
              relationshipType: 'Partnership',
            },
          },
          {
            id: 'x-no-moment',
            sourceMomentId: 'm-missing',
            targetContextId: 'ctx-Shipping',
            eventId: 'evt-Orphan',
            connectionType: 'crosses-to',
            schemaContract: { eventType: 'Orphaned', fields: [], relationshipType: 'Conformist' },
          },
          {
            id: 'x-empty-moment',
            sourceMomentId: 'm-empty',
            targetContextId: 'ctx-Shipping',
            eventId: 'evt-Silence',
            connectionType: 'crosses-to',
            schemaContract: { eventType: 'Silenced', fields: [], relationshipType: 'Conformist' },
          },
        ],
      };
      return makeIR({
        contexts: [
          makeContext('Ordering', {
            aggregates: [makeAggregate('Order', { commands: [makeCommand('PlaceOrder')] })],
          }),
          makeContext('Shipping'),
        ],
        flows: [flow],
      });
    }

    it('narrates returns-to targets by resolved moment, then by label, and omits unresolvable ones', () => {
      const content = generator.generate(makeLoopIR())[0].content;

      expect(content).toContain(
        '    - Shipping emits **RetryRequested**\n    - ↩ *returns to "Validate Order"*',
      );
      expect(content).toContain('    - ↩ *returns to "Manual Desk"*');
      expect(content).toContain(
        '  - ✅ **If LostTrack:**\n    - Shipping emits **TrackLost**\n\n**3. Reject Order**',
      );
    });

    it('labels branch-only moments by their first branch context and empty moments with none', () => {
      const content = generator.generate(makeLoopIR())[0].content;

      expect(content).toContain('**2. Review Order** *(Shipping)*');
      expect(content).toContain('**3. Reject Order** *(Ordering)*');
      expect(content).toContain('**4. Quiet Period**\n');
      expect(content).not.toContain('**4. Quiet Period** *(');
    });

    it('narrates non-terminal entries of a terminal branch beneath the termination line', () => {
      const content = generator.generate(makeLoopIR())[0].content;

      expect(content).toContain(
        '  - ❌ **If Fraud:** flow terminates at **OrderRejected**\n    - Ordering emits **FraudNoted**',
      );
    });

    it('opens a terminal-only branch block with alt and skips terminal main entries in the sequence', () => {
      const content = generator.generate(makeLoopIR())[0].content;

      expect(content).toContain('  alt Fraud\n  Note over Ordering: Flow terminates\n  end');
      expect(content).not.toContain('Ordering->>Ordering: OrderAbandoned');
    });

    it('resolves crossing sources by declared node, falls back to the first entry, and dashes the unknown', () => {
      const content = generator.generate(makeLoopIR())[0].content;

      expect(content).toContain(
        '### OrderPlacedAgain\n\n**Ordering** → **Shipping** via Partnership\n*Occurs during: Validate Order*',
      );
      expect(content).toContain(
        '### Orphaned\n\n**—** → **Shipping** via Conformist\n*Occurs during: —*',
      );
      expect(content).toContain(
        '### Silenced\n\n**—** → **Shipping** via Conformist\n*Occurs during: Quiet Period*',
      );
    });

    it('draws one context-map edge per source/target/relationship and none for unresolvable sources', () => {
      const content = generator.generate(makeLoopIR())[0].content;

      expect(content.match(/-->\|/g)).toEqual(['-->|']);
      expect(content).toContain('  Ordering -->|Partnership| Shipping');
    });
  });

  it('renders a flow-only specification without context map or domain model', () => {
    const ir = makeIR({
      flows: [
        {
          id: 'f',
          name: 'f',
          lanes: [],
          moments: [
            {
              id: 'm',
              name: 'Only',
              contextEntries: [{ contextId: 'ctx-Ghost', nodeName: 'Boo', nodeKind: 'event' }],
            },
          ],
          connections: [],
        },
      ],
    });

    const content = generator.generate(ir)[0].content;

    expect(content).toContain('**1. Only** *(Ghost)*');
    expect(content).toContain('  - Ghost emits **Boo**');
    expect(content).not.toContain('graph LR');
    expect(content).not.toContain('sequenceDiagram');
    expect(content).not.toContain('## Domain Model');
  });

  it('omits the saga state when the orchestration declares no states', () => {
    const ctx = makeContext('Ordering', {
      aggregates: [makeAggregate('Order', { commands: [makeCommand('PlaceOrder')] })],
    });
    ctx.sagas = [
      {
        id: 'saga-1',
        name: 'Stateless',
        trigger: 'OrderPlaced',
        states: [],
        compensation: 'none',
        timeout: '1m',
      },
    ];
    const ir = makeIR({
      contexts: [ctx],
      flows: [
        {
          id: 'f',
          name: 'f',
          lanes: [],
          moments: [
            {
              id: 'm',
              name: 'Place',
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

    expect(content).toContain('**1. Place** *(Ordering)*\n');
    expect(content).not.toContain('Stateless:');
  });

  it('describes projections, lists shared value objects once, and scopes rules to the command aggregate', () => {
    const shared = makeValueObject('Money');
    const order = makeAggregate('Order', {
      commands: [makeCommand('PlaceOrder')],
      valueObjects: [shared],
    });
    const invoice = makeAggregate('Invoice', { valueObjects: [makeValueObject('Money')] });
    const ctx = makeContext('Ordering', { aggregates: [order, invoice] });
    ctx.projections = [
      {
        id: 'p',
        name: 'OrderTotals',
        sources: ['OrderPlaced'],
        description: 'running sum',
        fields: [],
      },
    ];
    ctx.invariants = [
      { id: 'INV-1', description: 'Orders need lines', scope: 'Order' },
      { id: 'INV-2', description: 'Invoices need totals', scope: 'Invoice' },
    ];
    const ir = makeIR({
      contexts: [ctx],
      flows: [
        {
          id: 'f',
          name: 'f',
          lanes: [],
          moments: [
            {
              id: 'm',
              name: 'Place',
              contextEntries: [
                { contextId: 'ctx-Ordering', nodeName: 'PlaceOrder', nodeKind: 'command' },
                { contextId: 'ctx-Ordering', nodeName: 'PlaceOrder', nodeKind: 'command' },
              ],
            },
          ],
          connections: [],
        },
      ],
    });

    const content = generator.generate(ir)[0].content;

    expect(content).toContain('- **OrderTotals** ← OrderPlaced: running sum');
    const glossary = content.slice(content.indexOf('## Data Glossary'));
    expect(glossary.match(/\*\*Money\*\*/g)).toHaveLength(1);
    expect(content.match(/Rule INV-1/g)).toHaveLength(1);
    expect(content).not.toContain('Rule INV-2');
  });
});
