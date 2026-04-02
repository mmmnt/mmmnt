/**
 * MMNT-35 MomentParser — Integration Tests
 *
 * Tests the full parsing pipeline: string -> AST -> IR.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MomentParser } from '../../src/parser/moment-parser.js';

const FIXTURES = resolve(import.meta.dirname, '../../../../fixtures/valid');

let parser: MomentParser;

beforeAll(() => {
  parser = new MomentParser();
});

describe('MomentParser', () => {
  it('parses minimal context file to IR', async () => {
    const content = readFileSync(resolve(FIXTURES, 'minimal/contexts/ordering.moment'), 'utf-8');
    const result = await parser.parseContent(content);

    expect(result.success).toBe(true);
    expect(result.ir).toBeDefined();
    expect(result.ir!.contexts).toHaveLength(1);
    expect(result.ir!.contexts[0].name).toBe('Ordering');
    expect(result.ir!.contexts[0].classification).toBe('Core');
    expect(result.ir!.contexts[0].aggregates).toHaveLength(1);
    expect(result.ir!.contexts[0].aggregates[0].name).toBe('Order');
    expect(result.ir!.contexts[0].commands).toHaveLength(1);
    expect(result.ir!.contexts[0].events).toHaveLength(1);
    expect(result.ir!.contexts[0].valueObjects).toHaveLength(1);
    expect(result.ir!.contexts[0].invariants).toHaveLength(1);
  });

  it('parses minimal flow file to IR', async () => {
    const content = readFileSync(resolve(FIXTURES, 'minimal/flows/order-placed.moment'), 'utf-8');
    const result = await parser.parseContent(content);

    expect(result.success).toBe(true);
    expect(result.ir).toBeDefined();
    expect(result.ir!.flows).toHaveLength(1);
    expect(result.ir!.flows[0].name).toBe('order-placed');
    expect(result.ir!.flows[0].moments).toHaveLength(2);

    // Check crossing connection exists
    const crossings = result.ir!.flows[0].connections.filter(
      (c) => c.connectionType === 'crosses-to',
    );
    expect(crossings).toHaveLength(1);

    // Check triggered-by connection exists
    const triggeredBy = result.ir!.flows[0].connections.filter(
      (c) => c.connectionType === 'triggered-by',
    );
    expect(triggeredBy).toHaveLength(1);
  });

  it('parses multi-context sample files to IR', async () => {
    const orderingContent = readFileSync(
      resolve(FIXTURES, 'multi-context/contexts/ordering.moment'),
      'utf-8',
    );
    const fulfillmentContent = readFileSync(
      resolve(FIXTURES, 'multi-context/contexts/fulfillment.moment'),
      'utf-8',
    );
    const flowContent = readFileSync(
      resolve(FIXTURES, 'multi-context/flows/order-to-shipment.moment'),
      'utf-8',
    );

    const orderingResult = await parser.parseContent(orderingContent);
    const fulfillmentResult = await parser.parseContent(fulfillmentContent);
    const flowResult = await parser.parseContent(flowContent);

    expect(orderingResult.success).toBe(true);
    expect(fulfillmentResult.success).toBe(true);
    expect(flowResult.success).toBe(true);

    // Ordering context
    expect(orderingResult.ir!.contexts[0].aggregates).toHaveLength(1);
    expect(orderingResult.ir!.contexts[0].commands).toHaveLength(1);
    expect(orderingResult.ir!.contexts[0].events).toHaveLength(1);
    expect(orderingResult.ir!.contexts[0].valueObjects).toHaveLength(2);
    expect(orderingResult.ir!.contexts[0].invariants).toHaveLength(2);

    // Fulfillment context
    expect(fulfillmentResult.ir!.contexts[0].aggregates).toHaveLength(2);
    expect(fulfillmentResult.ir!.contexts[0].policies).toHaveLength(1);

    // Flow
    expect(flowResult.ir!.flows[0].moments).toHaveLength(5);
    expect(flowResult.ir!.flows[0].connections.length).toBeGreaterThan(0);
  });

  it('returns diagnostics for invalid input', async () => {
    const result = await parser.parseContent('this is not valid moment syntax @#$');

    expect(result.success).toBe(false);
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(result.diagnostics[0].severity).toBe('error');
    expect(result.ir).toBeUndefined();
  });

  it('is deterministic — same input produces identical IR', async () => {
    const content = readFileSync(resolve(FIXTURES, 'minimal/contexts/ordering.moment'), 'utf-8');

    const result1 = await parser.parseContent(content);
    const result2 = await parser.parseContent(content);

    expect(result1.success).toBe(true);
    expect(result2.success).toBe(true);
    expect(result1.ir).toEqual(result2.ir);
  });
});
