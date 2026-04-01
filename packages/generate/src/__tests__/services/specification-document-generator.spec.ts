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
    expect(content).toContain('**2 bounded contexts**');
    expect(content).toContain('**2 aggregates**');
    expect(content).toContain('**2 commands**');
    expect(content).toContain('**2 events**');
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
    expect(content).toContain('### Ordering — Core');
    expect(content).toContain('### Shipping — Supporting');
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
    expect(content).toContain('**OrderPlaced**');
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
    expect(content).toContain('CustomerSupplier');
  });

  it('renders footer with generation notice', () => {
    const ir = makeIR({
      contexts: [makeContext('Ordering', { aggregates: [makeAggregate('Order')] })],
    });

    const content = generator.generate(ir)[0].content;
    expect(content).toContain('generated by');
    expect(content).toContain('Moment');
  });
});
