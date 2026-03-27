/**
 * MMNT-213 SiftSpecificationImporter — Unit Tests
 *
 * Tests that SiftSpecificationImporter correctly converts Sift building block
 * events into .moment file content with proper context and flow generation.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import {
  SiftSpecificationImporter,
  type SiftImportInput,
  type SiftBuildingBlock,
  type SiftTimelineEvent,
} from '../../src/import/sift-specification-importer.js';
import { MomentParser } from '../../src/parser/moment-parser.js';

let importer: SiftSpecificationImporter;
let parser: MomentParser;

const sampleBlock: SiftBuildingBlock = {
  contextName: 'Ordering',
  classification: 'Core',
  aggregates: [
    {
      name: 'Order',
      identityField: { name: 'orderId', type: 'UUID' },
      commands: [
        {
          name: 'PlaceOrder',
          inputs: [
            { name: 'customerId', type: 'UUID' },
            { name: 'items', type: 'OrderItem[]' },
          ],
          emitsEvent: 'OrderPlaced',
        },
      ],
      events: [
        {
          name: 'OrderPlaced',
          fields: [
            { name: 'orderId', type: 'UUID' },
            { name: 'customerId', type: 'UUID' },
          ],
        },
      ],
      valueObjects: [
        {
          name: 'OrderItem',
          fields: [
            { name: 'productId', type: 'UUID' },
            { name: 'quantity', type: 'number' },
          ],
        },
      ],
    },
  ],
};

const sampleTimelineEvent: SiftTimelineEvent = {
  flowName: 'order-placed',
  description: 'Order triggers fulfillment',
  lanes: [
    { id: 'ordering', label: 'Ordering', classification: 'Core' },
    { id: 'fulfillment', label: 'Fulfillment', classification: 'Supporting' },
  ],
  frames: [
    {
      label: 'Order submission',
      nodes: [
        {
          laneId: 'ordering',
          nodeName: 'PlaceOrder',
        },
        {
          laneId: 'ordering',
          nodeName: 'OrderPlaced',
          crossing: {
            targetLaneId: 'fulfillment',
            relationshipType: 'CustomerSupplier',
            contractFields: [
              { name: 'orderId', type: 'UUID', required: true },
              { name: 'items', type: 'OrderItem[]', required: true },
            ],
          },
        },
      ],
    },
    {
      label: 'Fulfillment initiation',
      nodes: [
        {
          laneId: 'fulfillment',
          nodeName: 'InitiateFulfillment',
        },
      ],
    },
  ],
};

const sampleInput: SiftImportInput = {
  sourceProduct: 'Sift',
  sourceVersion: '2.1.0',
  buildingBlocks: [sampleBlock],
  timelineEvents: [sampleTimelineEvent],
};

beforeAll(() => {
  importer = new SiftSpecificationImporter();
  parser = new MomentParser();
});

describe('SiftSpecificationImporter', () => {
  it('generates context file from building blocks', () => {
    const content = importer.generateContextFile(sampleBlock);

    expect(content).toContain('context "Ordering" [Core]');
    expect(content).toContain('aggregate "Order"');
    expect(content).toContain('identity orderId: UUID');
    expect(content).toContain('command PlaceOrder');
    expect(content).toContain('input customerId: UUID, items: OrderItem[]');
    expect(content).toContain('emits OrderPlaced');
    expect(content).toContain('event OrderPlaced');
    expect(content).toContain('orderId: UUID');
    expect(content).toContain('value-object OrderItem');
    expect(content).toContain('productId: UUID');
    expect(content).toContain('quantity: number');
  });

  it('generates flow file from timeline events', () => {
    const content = importer.generateFlowFile(sampleTimelineEvent);

    expect(content).toContain('flow "order-placed"');
    expect(content).toContain('description "Order triggers fulfillment"');
    expect(content).toContain('lane ordering "Ordering" [Core]');
    expect(content).toContain('lane fulfillment "Fulfillment" [Supporting]');
    expect(content).toContain('frame "Order submission"');
    expect(content).toContain('ordering: PlaceOrder');
    expect(content).toContain('ordering: OrderPlaced crosses-to fulfillment via CustomerSupplier');
    expect(content).toContain('frame "Fulfillment initiation"');
    expect(content).toContain('fulfillment: InitiateFulfillment');
  });

  it('produces correct manifest entries', () => {
    const result = importer.import(sampleInput);

    expect(result.contextFiles).toHaveLength(1);
    expect(result.contextFiles[0]).toEqual({
      name: 'Ordering',
      path: 'contexts/ordering.moment',
    });
    expect(result.flowFiles).toHaveLength(1);
    expect(result.flowFiles[0]).toEqual({
      name: 'order-placed',
      path: 'flows/order-placed.moment',
    });
    expect(result.manifestEntries).toHaveLength(2);
    expect(result.manifestEntries).toEqual([...result.contextFiles, ...result.flowFiles]);
  });

  it('generates upstream fingerprint with hash', () => {
    const result = importer.import(sampleInput);

    expect(result.fingerprint.source).toBe('Sift');
    expect(result.fingerprint.version).toBe('2.1.0');
    expect(result.fingerprint.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.fingerprint.importedAt).toBeDefined();
    // Verify importedAt is a valid ISO date string
    expect(new Date(result.fingerprint.importedAt).toISOString()).toBe(
      result.fingerprint.importedAt,
    );
  });

  describe('SI-01 round-trip', () => {
    it('generated context file parses without errors', async () => {
      const content = importer.generateContextFile(sampleBlock);
      const result = await parser.parseContent(content);

      expect(result.success).toBe(true);
      expect(result.diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);
    });

    it('generated flow file parses without errors', async () => {
      const content = importer.generateFlowFile(sampleTimelineEvent);
      const result = await parser.parseContent(content);

      expect(result.success).toBe(true);
      expect(result.diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);
    });
  });

  describe('SI-02 idempotency', () => {
    it('same input produces identical output', () => {
      const content1 = importer.generateContextFile(sampleBlock);
      const content2 = importer.generateContextFile(sampleBlock);
      expect(content1).toBe(content2);

      const flow1 = importer.generateFlowFile(sampleTimelineEvent);
      const flow2 = importer.generateFlowFile(sampleTimelineEvent);
      expect(flow1).toBe(flow2);
    });

    it('same input produces identical fingerprint (excluding importedAt timestamp)', () => {
      const fixedTime = '2026-01-01T00:00:00.000Z';
      const result1 = importer.import(sampleInput, { importedAt: fixedTime });
      const result2 = importer.import(sampleInput, { importedAt: fixedTime });
      expect(result1.fingerprint).toEqual(result2.fingerprint);
    });
  });

  it('handles empty aggregates gracefully', () => {
    const emptyBlock: SiftBuildingBlock = {
      contextName: 'EmptyContext',
      aggregates: [],
    };

    const content = importer.generateContextFile(emptyBlock);
    expect(content).toContain('context "EmptyContext"');
    // Should not throw
    expect(content).toBeDefined();
  });

  it('handles crossing with contract fields', () => {
    const content = importer.generateFlowFile(sampleTimelineEvent);

    expect(content).toContain('contract');
    expect(content).toContain('orderId: UUID [required]');
    expect(content).toContain('items: OrderItem[] [required]');
  });

  it('generates correct file paths from context names', () => {
    const input: SiftImportInput = {
      sourceProduct: 'Sift',
      sourceVersion: '1.0.0',
      buildingBlocks: [
        {
          contextName: 'Order Management',
          aggregates: [],
        },
        {
          contextName: 'Inventory',
          aggregates: [],
        },
      ],
      timelineEvents: [
        {
          flowName: 'place order flow',
          lanes: [],
          frames: [],
        },
      ],
    };

    const result = importer.import(input);

    expect(result.contextFiles[0].path).toBe('contexts/order-management.moment');
    expect(result.contextFiles[1].path).toBe('contexts/inventory.moment');
    expect(result.flowFiles[0].path).toBe('flows/place-order-flow.moment');
  });

  it('generates flow file with lane without classification', () => {
    const event: SiftTimelineEvent = {
      flowName: 'simple-flow',
      lanes: [{ id: 'main', label: 'Main' }],
      frames: [
        {
          label: 'Step 1',
          nodes: [{ laneId: 'main', nodeName: 'DoSomething' }],
        },
      ],
    };

    const content = importer.generateFlowFile(event);

    expect(content).toContain('lane main "Main"');
    expect(content).not.toContain('[');
    expect(content).toContain('main: DoSomething');
  });

  it('generates flow file without description', () => {
    const event: SiftTimelineEvent = {
      flowName: 'no-desc-flow',
      lanes: [{ id: 'a', label: 'A' }],
      frames: [],
    };

    const content = importer.generateFlowFile(event);

    expect(content).toContain('flow "no-desc-flow"');
    expect(content).not.toContain('description');
  });

  it('generates flow file with non-required contract fields', () => {
    const event: SiftTimelineEvent = {
      flowName: 'optional-fields',
      lanes: [
        { id: 'a', label: 'A', classification: 'Core' },
        { id: 'b', label: 'B', classification: 'Supporting' },
      ],
      frames: [
        {
          label: 'Step',
          nodes: [
            {
              laneId: 'a',
              nodeName: 'EventA',
              crossing: {
                targetLaneId: 'b',
                relationshipType: 'CustomerSupplier',
                contractFields: [
                  { name: 'id', type: 'UUID', required: true },
                  { name: 'notes', type: 'String', required: false },
                ],
              },
            },
          ],
        },
      ],
    };

    const content = importer.generateFlowFile(event);

    expect(content).toContain('id: UUID [required]');
    expect(content).toContain('notes: String');
    // The non-required field should NOT have [required]
    const notesLine = content.split('\n').find((l: string) => l.includes('notes: String'));
    expect(notesLine).not.toContain('[required]');
  });

  it('generates context file without classification', () => {
    const block: SiftBuildingBlock = {
      contextName: 'NoClassification',
      aggregates: [],
    };

    const content = importer.generateContextFile(block);
    expect(content).toContain('context "NoClassification"');
    expect(content).not.toContain('[');
  });

  it('generates context file with command without inputs', () => {
    const block: SiftBuildingBlock = {
      contextName: 'Test',
      classification: 'Core',
      aggregates: [
        {
          name: 'Thing',
          identityField: { name: 'id', type: 'UUID' },
          commands: [
            {
              name: 'DoIt',
              inputs: [],
              emitsEvent: 'ItDone',
            },
          ],
          events: [],
          valueObjects: [],
        },
      ],
    };

    const content = importer.generateContextFile(block);
    expect(content).toContain('command DoIt');
    expect(content).not.toContain('input');
    expect(content).toContain('emits ItDone');
  });

  it('includes all diagnostics in result', () => {
    const result = importer.import(sampleInput);

    expect(result.diagnostics).toBeDefined();
    expect(Array.isArray(result.diagnostics)).toBe(true);
    // Currently no diagnostics are generated for valid input
    expect(result.diagnostics).toHaveLength(0);
  });
});
