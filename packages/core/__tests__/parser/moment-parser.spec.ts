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

  // =========================================================================
  // M-P12 — IR metadata from the parse context
  // =========================================================================
  describe('IR metadata (M-P12)', () => {
    it('stamps the spec file basename (without extension) as metadata.name', async () => {
      const content = readFileSync(resolve(FIXTURES, 'minimal/contexts/ordering.moment'), 'utf-8');
      const result = await parser.parseContent(content, '/some/dir/ordering.moment');

      expect(result.success).toBe(true);
      expect(result.ir!.metadata).toEqual({ name: 'ordering', version: '0.0.0' });
    });

    it('keeps the empty-name default when no file path is supplied', async () => {
      const content = readFileSync(resolve(FIXTURES, 'minimal/contexts/ordering.moment'), 'utf-8');
      const result = await parser.parseContent(content);

      expect(result.success).toBe(true);
      expect(result.ir!.metadata).toEqual({ name: '', version: '0.0.0' });
    });
  });

  // =========================================================================
  // M-P3 — single-file cross-file validation wiring
  //
  // A file that declares BOTH contexts and flows validates its flow against
  // its own declarations (V1/V9/V11/SP-01/SP-02 + IR-level SP checks).
  // Flow-only files must never receive these diagnostics.
  // =========================================================================
  describe('single-file cross-file validation (M-P3)', () => {
    const CONTEXT_BLOCK = `
      context "Ordering" [Core]
        aggregate "Order"
          identity orderId: UUID
          command PlaceOrder
            input customerId: UUID
            emits OrderPlaced
          event OrderPlaced
            orderId: UUID
      context "Fulfillment" [Supporting]
        aggregate "FulfillmentRequest"
          identity fulfillmentId: UUID
          command InitiateFulfillment
            input orderId: UUID
            emits FulfillmentInitiated
          event FulfillmentInitiated
            fulfillmentId: UUID
    `;

    it('fires V1 when a placed node resolves to no declared building block', async () => {
      const result = await parser.parseContent(`${CONTEXT_BLOCK}
        flow "test"
          lane ordering "Ordering" [Core]
          moment "Step"
            ordering: NotDeclaredAnywhere
      `);
      expect(result.success).toBe(false);
      expect(
        result.diagnostics.some((d) => d.severity === 'error' && d.message.includes('V1:')),
      ).toBe(true);
    });

    it('fires V9 when a command carries crosses-to', async () => {
      const result = await parser.parseContent(`${CONTEXT_BLOCK}
        flow "test"
          lane ordering "Ordering" [Core]
          lane fulfillment "Fulfillment" [Supporting]
          moment "Step"
            ordering: PlaceOrder crosses-to fulfillment via CustomerSupplier
              contract
                id: UUID [required]
      `);
      expect(result.success).toBe(false);
      expect(
        result.diagnostics.some((d) => d.severity === 'error' && d.message.includes('V9:')),
      ).toBe(true);
    });

    it('fires V11 when a command carries multiplicity', async () => {
      const result = await parser.parseContent(`${CONTEXT_BLOCK}
        flow "test"
          lane ordering "Ordering" [Core]
          moment "Step"
            ordering: PlaceOrder (×3)
      `);
      expect(result.success).toBe(false);
      expect(
        result.diagnostics.some((d) => d.severity === 'error' && d.message.includes('V11:')),
      ).toBe(true);
    });

    it('fires SP-01 when a lane label matches no declared context', async () => {
      const result = await parser.parseContent(`${CONTEXT_BLOCK}
        flow "test"
          lane ghost "GhostContext" [Core]
          moment "Step"
            ghost: OrderPlaced
      `);
      expect(result.success).toBe(false);
      expect(
        result.diagnostics.some((d) => d.severity === 'error' && d.message.includes('SP-01')),
      ).toBe(true);
    });

    it('fires SP-02 when a crossing event is declared by neither boundary context', async () => {
      const result = await parser.parseContent(`${CONTEXT_BLOCK}
        flow "test"
          lane ordering "Ordering" [Core]
          lane fulfillment "Fulfillment" [Supporting]
          moment "Step"
            ordering: PhantomEvent crosses-to fulfillment via CustomerSupplier
              contract
                id: UUID [required]
      `);
      expect(result.success).toBe(false);
      expect(
        result.diagnostics.some((d) => d.severity === 'error' && d.message.includes('SP-02')),
      ).toBe(true);
    });

    it('accepts a crossing event declared by the source (emitter) context', async () => {
      const result = await parser.parseContent(`${CONTEXT_BLOCK}
        flow "test"
          lane ordering "Ordering" [Core]
          lane fulfillment "Fulfillment" [Supporting]
          moment "Step"
            ordering: OrderPlaced crosses-to fulfillment via CustomerSupplier
              contract
                orderId: UUID [required]
          moment "Next"
            fulfillment: InitiateFulfillment
              triggered-by OrderPlaced
      `);
      expect(result.success).toBe(true);
      expect(result.diagnostics).toHaveLength(0);
    });

    it('fires V14 for a one-directional Partnership crossing through the pipeline', async () => {
      const result = await parser.parseContent(`${CONTEXT_BLOCK}
        flow "test"
          lane ordering "Ordering" [Core]
          lane fulfillment "Fulfillment" [Supporting]
          moment "Step"
            ordering: OrderPlaced crosses-to fulfillment via Partnership
              contract
                orderId: UUID [required]
      `);
      expect(result.success).toBe(true);
      expect(
        result.diagnostics.some((d) => d.severity === 'warning' && d.message.includes('V14')),
      ).toBe(true);
    });

    it('skips V1/SP-01 for branch-lane placements (outcome routes, not contexts)', async () => {
      const result = await parser.parseContent(`${CONTEXT_BLOCK}
        flow "test"
          lane ordering "Ordering" [Core]
          branch-lane refused "Refusals"
          moment "Step"
            ordering: OrderPlaced
          moment "Outcome" [branch]
            when ok
              ordering: PlaceOrder
            when rejected
              refused: OrderPlaced [terminal]
      `);
      const crossFileErrors = result.diagnostics.filter(
        (d) =>
          d.message.includes('V1:') || d.message.includes('SP-01') || d.message.includes('SP-02'),
      );
      expect(crossFileErrors).toHaveLength(0);
      expect(result.success).toBe(true);
    });

    it('surfaces IR-level SP-01 as a warning for a crossing to an undeclared lane id', async () => {
      // `crosses-to nowhere` names a lane that does not exist: no AST-level
      // check rejects it, but the IR connection's target context is
      // unresolvable — the IR-level SchemaValidator reports it as a warning.
      const result = await parser.parseContent(`${CONTEXT_BLOCK}
        flow "test"
          lane ordering "Ordering" [Core]
          moment "Step"
            ordering: OrderPlaced crosses-to nowhere via CustomerSupplier
              contract
                orderId: UUID [required]
      `);
      expect(result.success).toBe(true);
      expect(
        result.diagnostics.some(
          (d) => d.severity === 'warning' && d.ruleId === 'SP-01' && d.message.includes('nowhere'),
        ),
      ).toBe(true);
    });

    it('validates the unified vet-clinic fixture (contexts + flows, sagas, policies) cleanly', async () => {
      const content = readFileSync(resolve(FIXTURES, 'unified/vet-clinic.moment'), 'utf-8');
      const result = await parser.parseContent(content, 'vet-clinic.moment');

      expect(result.success).toBe(true);
      expect(result.diagnostics).toHaveLength(0);
      expect(result.ir!.metadata.name).toBe('vet-clinic');
    });

    it('does not spam flow-only specs: zero cross-file/SP diagnostics without contexts', async () => {
      // Names resolve to nothing, lanes match no context, crossing event is
      // undeclared — all of which would fire in a context-declaring file.
      const result = await parser.parseContent(`
        flow "flow-only"
          lane a "Some Lane Label" [Core]
          lane b "Another Lane" [Supporting]
          moment "Step"
            a: TotallyUndeclaredEvent crosses-to b via CustomerSupplier
              contract
                id: UUID [required]
          moment "Next"
            b: AnotherUndeclaredNode (×2)
              triggered-by TotallyUndeclaredEvent
      `);
      expect(result.success).toBe(true);
      expect(result.diagnostics).toHaveLength(0);
    });
  });
});
