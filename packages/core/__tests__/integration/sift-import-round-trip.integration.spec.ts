/**
 * MMNT-214 Integration Test — Sift Import Round-Trip
 *
 * End-to-end integration test: Sift events → SiftSpecificationImporter
 * → .moment content → MomentParser → IR.
 */
import { SiftSpecificationImporter, type SiftImportInput, MomentParser } from '../../src/index.js';

const sampleInput: SiftImportInput = {
  sourceProduct: 'Sift',
  sourceVersion: '2.0.0',
  buildingBlocks: [
    {
      contextName: 'Ordering',
      classification: 'Core',
      aggregates: [
        {
          name: 'Order',
          identityField: { name: 'orderId', type: 'UUID' },
          commands: [
            {
              name: 'PlaceOrder',
              inputs: [{ name: 'customerId', type: 'UUID' }],
              emitsEvent: 'OrderPlaced',
            },
          ],
          events: [{ name: 'OrderPlaced', fields: [{ name: 'orderId', type: 'UUID' }] }],
          valueObjects: [{ name: 'OrderItem', fields: [{ name: 'productId', type: 'UUID' }] }],
        },
      ],
    },
  ],
  timelineEvents: [
    {
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
            { laneId: 'ordering', nodeName: 'PlaceOrder' },
            {
              laneId: 'ordering',
              nodeName: 'OrderPlaced',
              crossing: {
                targetLaneId: 'fulfillment',
                relationshipType: 'CustomerSupplier',
                contractFields: [{ name: 'orderId', type: 'UUID', required: true }],
              },
            },
          ],
        },
      ],
    },
  ],
};

describe('Sift Import Round-Trip', () => {
  let importer: SiftSpecificationImporter;
  let parser: MomentParser;

  beforeAll(() => {
    importer = new SiftSpecificationImporter();
    parser = new MomentParser();
  });

  it('generates context file that parses to valid IR', async () => {
    const content = importer.generateContextFile(sampleInput.buildingBlocks[0]);
    const result = await parser.parseContent(content);
    expect(result.success).toBe(true);
    expect(result.ir).toBeDefined();
    expect(result.ir!.contexts).toHaveLength(1);
  });

  it('generates flow file that parses to valid IR', async () => {
    const content = importer.generateFlowFile(sampleInput.timelineEvents[0]);
    const result = await parser.parseContent(content);
    expect(result.success).toBe(true);
    expect(result.ir).toBeDefined();
    expect(result.ir!.flows).toHaveLength(1);
  });

  it('SI-01 round-trip correctness — IR contains expected context structure', async () => {
    const content = importer.generateContextFile(sampleInput.buildingBlocks[0]);
    const result = await parser.parseContent(content);
    expect(result.success).toBe(true);
    const ctx = result.ir!.contexts[0];
    expect(ctx.name).toBe('Ordering');
    expect(ctx.aggregates).toHaveLength(1);
    expect(ctx.aggregates[0].name).toBe('Order');
    expect(ctx.aggregates[0].commands).toHaveLength(1);
    expect(ctx.aggregates[0].events).toHaveLength(1);
  });

  it('SI-01 round-trip correctness — IR contains expected flow structure', async () => {
    const content = importer.generateFlowFile(sampleInput.timelineEvents[0]);
    const result = await parser.parseContent(content);
    expect(result.success).toBe(true);
    const flow = result.ir!.flows[0];
    expect(flow.name).toBe('order-placed');
    expect(flow.frames.length).toBeGreaterThan(0);
    expect(flow.connections.length).toBeGreaterThan(0);
  });

  it('import produces valid manifest entries', () => {
    const result = importer.import(sampleInput);
    expect(result.contextFiles).toHaveLength(1);
    expect(result.flowFiles).toHaveLength(1);
    expect(result.manifestEntries).toHaveLength(2);
    expect(result.diagnostics).toHaveLength(0);
  });

  it('import produces deterministic fingerprint', () => {
    const fixedTime = '2026-01-01T00:00:00.000Z';
    const result1 = importer.import(sampleInput, { importedAt: fixedTime });
    const result2 = importer.import(sampleInput, { importedAt: fixedTime });
    expect(result1.fingerprint).toEqual(result2.fingerprint);
  });
});
