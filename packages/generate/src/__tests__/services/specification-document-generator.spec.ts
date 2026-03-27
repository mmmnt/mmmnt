import { describe, it, expect } from 'vitest';
import type {
  IntermediateRepresentation,
  ContextDefinition,
  AggregateDefinition,
  CommandDefinition,
  EventDefinition,
  ValueObjectDefinition,
} from '@mmmnt/core';
import { SpecificationDocumentGenerator } from '../../services/specification-document-generator.js';

function makeCommand(name: string): CommandDefinition {
  return {
    id: `cmd-${name}`,
    name,
    inputs: [],
    preconditions: [],
    emitsEvent: `${name}Completed`,
  };
}

function makeEvent(name: string): EventDefinition {
  return { id: `evt-${name}`, name, fields: [] };
}

function makeValueObject(name: string): ValueObjectDefinition {
  return { id: `vo-${name}`, name, fields: [] };
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
    identityField: { name: 'id', type: 'string', isArray: false, required: true },
    commands: options?.commands ?? [],
    events: options?.events ?? [],
    valueObjects: options?.valueObjects ?? [],
    invariants: [],
  };
}

function makeContext(
  name: string,
  options?: {
    aggregates?: AggregateDefinition[];
    commands?: CommandDefinition[];
    events?: EventDefinition[];
    valueObjects?: ValueObjectDefinition[];
  },
): ContextDefinition {
  const aggregates = options?.aggregates ?? [];
  const directCommands = options?.commands ?? [];
  const directEvents = options?.events ?? [];
  const directVOs = options?.valueObjects ?? [];

  // Mirror @mmmnt/core IR behavior: context-level arrays include aggregate members
  const aggregateCommands = aggregates.flatMap((a) => a.commands);
  const aggregateEvents = aggregates.flatMap((a) => a.events);
  const aggregateVOs = aggregates.flatMap((a) => a.valueObjects);

  return {
    id: `ctx-${name}`,
    name,
    aggregates,
    domainServices: [],
    commands: [...aggregateCommands, ...directCommands],
    events: [...aggregateEvents, ...directEvents],
    policies: [],
    sagas: [],
    valueObjects: [...aggregateVOs, ...directVOs],
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

  it('generates specification.md with context names and aggregate counts', () => {
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
          aggregates: [
            makeAggregate('Shipment', {
              commands: [makeCommand('DispatchShipment')],
              events: [makeEvent('ShipmentDispatched')],
            }),
            makeAggregate('Warehouse'),
          ],
        }),
      ],
    });

    const docs = generator.generate(ir);
    const specDoc = docs.find((d) => d.documentType === 'specification');

    expect(specDoc).toBeDefined();
    expect(specDoc!.filePath).toBe('specification.md');
    expect(specDoc!.content).toContain('### Ordering');
    expect(specDoc!.content).toContain('- Aggregates: 1');
    expect(specDoc!.content).toContain('### Shipping');
    expect(specDoc!.content).toContain('- Aggregates: 2');
    expect(specDoc!.content).toContain('- Commands: 2');
    expect(specDoc!.content).toContain('- Events: 2');
  });

  it('generates architecture-palette.md with relationship descriptions', () => {
    const ir = makeIR({
      contexts: [makeContext('Ordering'), makeContext('Shipping')],
      relationships: [
        {
          sourceContextId: 'ctx-Ordering',
          targetContextId: 'ctx-Shipping',
          relationshipType: 'Upstream-Downstream',
          contract: 'Published Language',
        },
      ],
    });

    const docs = generator.generate(ir);
    const paletteDoc = docs.find((d) => d.documentType === 'architecture-palette');

    expect(paletteDoc).toBeDefined();
    expect(paletteDoc!.filePath).toBe('architecture-palette.md');
    expect(paletteDoc!.content).toContain('Ordering');
    expect(paletteDoc!.content).toContain('Shipping');
    expect(paletteDoc!.content).toContain('Upstream-Downstream');
    expect(paletteDoc!.content).toContain('Published Language');
  });

  it('generates per-context inventory.md files', () => {
    const ir = makeIR({
      contexts: [
        makeContext('Ordering', {
          aggregates: [
            makeAggregate('Order', {
              commands: [makeCommand('PlaceOrder')],
              events: [makeEvent('OrderPlaced')],
              valueObjects: [makeValueObject('OrderTotal')],
            }),
          ],
        }),
        makeContext('Shipping'),
      ],
    });

    const docs = generator.generate(ir);
    const inventoryDocs = docs.filter((d) => d.documentType === 'context-inventory');

    expect(inventoryDocs).toHaveLength(2);

    const orderingInventory = inventoryDocs.find((d) => d.filePath === 'ordering/inventory.md');
    expect(orderingInventory).toBeDefined();
    expect(orderingInventory!.content).toContain('# Ordering Inventory');
    expect(orderingInventory!.content).toContain('### Order');
    expect(orderingInventory!.content).toContain('- PlaceOrder');
    expect(orderingInventory!.content).toContain('- OrderPlaced');
    expect(orderingInventory!.content).toContain('- OrderTotal');

    const shippingInventory = inventoryDocs.find((d) => d.filePath === 'shipping/inventory.md');
    expect(shippingInventory).toBeDefined();
    expect(shippingInventory!.content).toContain('# Shipping Inventory');
  });

  it('GN-03: uses exact context/aggregate/command/event names from IR', () => {
    const ir = makeIR({
      contexts: [
        makeContext('PaymentProcessing', {
          aggregates: [
            makeAggregate('PaymentTransaction', {
              commands: [makeCommand('InitiatePayment')],
              events: [makeEvent('PaymentInitiated')],
              valueObjects: [makeValueObject('CurrencyAmount')],
            }),
          ],
        }),
      ],
    });

    const docs = generator.generate(ir);
    const allContent = docs.map((d) => d.content).join('\n');

    // Exact names must appear — no abbreviation, no transformation
    expect(allContent).toContain('PaymentProcessing');
    expect(allContent).toContain('PaymentTransaction');
    expect(allContent).toContain('InitiatePayment');
    expect(allContent).toContain('PaymentInitiated');
    expect(allContent).toContain('CurrencyAmount');
  });

  it('is deterministic: same IR produces identical output', () => {
    const ir = makeIR({
      contexts: [
        makeContext('Billing', {
          aggregates: [
            makeAggregate('Invoice', {
              commands: [makeCommand('CreateInvoice'), makeCommand('VoidInvoice')],
              events: [makeEvent('InvoiceCreated'), makeEvent('InvoiceVoided')],
            }),
          ],
        }),
        makeContext('Payments'),
      ],
      relationships: [
        {
          sourceContextId: 'ctx-Billing',
          targetContextId: 'ctx-Payments',
          relationshipType: 'Partnership',
          contract: 'Shared Kernel',
        },
      ],
    });

    const result1 = generator.generate(ir);
    const result2 = generator.generate(ir);

    expect(result1).toEqual(result2);
  });

  it('returns empty document list for empty IR (no contexts)', () => {
    const ir = makeIR({ contexts: [] });

    const docs = generator.generate(ir);

    expect(docs).toEqual([]);
  });

  it('counts commands and events from both aggregates and context level', () => {
    const ir = makeIR({
      contexts: [
        makeContext('Identity', {
          aggregates: [
            makeAggregate('User', {
              commands: [makeCommand('RegisterUser')],
              events: [makeEvent('UserRegistered')],
            }),
          ],
          commands: [makeCommand('AuthenticateUser')],
          events: [makeEvent('UserAuthenticated')],
        }),
      ],
    });

    const docs = generator.generate(ir);
    const specDoc = docs.find((d) => d.documentType === 'specification');

    expect(specDoc).toBeDefined();
    // context.commands includes aggregate + direct commands (flattened by IR transform)
    expect(specDoc!.content).toContain('- Commands: 2');
    // context.events includes aggregate + direct events (flattened by IR transform)
    expect(specDoc!.content).toContain('- Events: 2');
  });
});
