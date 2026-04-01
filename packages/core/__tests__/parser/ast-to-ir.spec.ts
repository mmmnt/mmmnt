/**
 * MMNT-35 AstToIr — Unit Tests
 *
 * Tests the pure AST -> IR transformation function.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import {
  inject,
  createDefaultCoreModule,
  createDefaultSharedCoreModule,
  EmptyFileSystem,
} from 'langium';
import { parseHelper } from 'langium/test';
import { MomentGeneratedModule, MomentGeneratedSharedModule } from '../../src/generated/module.js';
import type { MomentFile } from '../../src/generated/ast.js';
import { astToIr } from '../../src/parser/ast-to-ir.js';
import type { LangiumDocument } from 'langium';

let parse: (input: string) => Promise<LangiumDocument<MomentFile>>;

beforeAll(() => {
  const shared = inject(
    createDefaultSharedCoreModule(EmptyFileSystem),
    MomentGeneratedSharedModule,
  );
  const services = inject(createDefaultCoreModule({ shared }), MomentGeneratedModule);
  shared.ServiceRegistry.register(services);
  parse = parseHelper<MomentFile>(services);
});

async function toIr(input: string) {
  const doc = await parse(input);
  expect(doc.parseResult.lexerErrors).toHaveLength(0);
  expect(doc.parseResult.parserErrors).toHaveLength(0);
  return astToIr(doc.parseResult.value);
}

describe('AstToIr', () => {
  it('transforms context declaration to ContextDefinition', async () => {
    const ir = await toIr(`
      context "OrderManagement" [Core]
        aggregate "Order"
          identity orderId: UUID
    `);

    expect(ir.contexts).toHaveLength(1);
    expect(ir.contexts[0].id).toBe('ctx-OrderManagement');
    expect(ir.contexts[0].name).toBe('OrderManagement');
    expect(ir.contexts[0].classification).toBe('Core');
  });

  it('transforms aggregate with identity to AggregateDefinition', async () => {
    const ir = await toIr(`
      context "Test"
        aggregate "Order"
          identity orderId: UUID
    `);

    const agg = ir.contexts[0].aggregates[0];
    expect(agg.id).toBe('agg-Order');
    expect(agg.name).toBe('Order');
    expect(agg.identityField).toEqual({
      name: 'orderId',
      type: 'UUID',
      isArray: false,
      required: true,
    });
  });

  it('transforms command with inputs and preconditions', async () => {
    const ir = await toIr(`
      context "Test"
        aggregate "Order"
          identity orderId: UUID
          command PlaceOrder
            input customerId: UUID, items: OrderItem[]
            precondition orderNotPlaced: "Order has not been placed"
            emits OrderPlaced
          event OrderPlaced
    `);

    const cmd = ir.contexts[0].aggregates[0].commands[0];
    expect(cmd.id).toBe('cmd-PlaceOrder');
    expect(cmd.name).toBe('PlaceOrder');
    expect(cmd.emitsEvent).toBe('OrderPlaced');
    expect(cmd.inputs).toHaveLength(2);
    expect(cmd.inputs[0]).toEqual({
      name: 'customerId',
      type: 'UUID',
      isArray: false,
      required: true,
    });
    expect(cmd.inputs[1]).toEqual({
      name: 'items',
      type: 'OrderItem',
      isArray: true,
      required: true,
    });
    expect(cmd.preconditions).toHaveLength(1);
    expect(cmd.preconditions[0]).toEqual({
      name: 'orderNotPlaced',
      description: 'Order has not been placed',
    });
  });

  it('transforms domain event with fields', async () => {
    const ir = await toIr(`
      context "Test"
        aggregate "Order"
          identity orderId: UUID
          event OrderPlaced
            orderId: UUID
            items: OrderItem[]
            placedAt: DateTime
    `);

    const evt = ir.contexts[0].aggregates[0].events[0];
    expect(evt.id).toBe('evt-OrderPlaced');
    expect(evt.name).toBe('OrderPlaced');
    expect(evt.fields).toHaveLength(3);
    expect(evt.fields[0]).toEqual({
      name: 'orderId',
      type: 'UUID',
      isArray: false,
      required: true,
    });
    expect(evt.fields[1]).toEqual({
      name: 'items',
      type: 'OrderItem',
      isArray: true,
      required: true,
    });
    expect(evt.fields[2]).toEqual({
      name: 'placedAt',
      type: 'DateTime',
      isArray: false,
      required: true,
    });
  });

  it('transforms value object with fields', async () => {
    const ir = await toIr(`
      context "Test"
        aggregate "Order"
          identity orderId: UUID
        value-object OrderItem
          productId: UUID
          quantity: number
          unitPrice: Money
    `);

    const vo = ir.contexts[0].aggregates[0].valueObjects[0];
    expect(vo.id).toBe('vo-OrderItem');
    expect(vo.name).toBe('OrderItem');
    expect(vo.fields).toHaveLength(3);
    expect(vo.fields[2]).toEqual({
      name: 'unitPrice',
      type: 'Money',
      isArray: false,
      required: true,
    });
  });

  it('transforms invariant with scope', async () => {
    const ir = await toIr(`
      context "Test"
        aggregate "Order"
          identity orderId: UUID
          invariant ORD-01 "Order must have items"
            scope Order
    `);

    const inv = ir.contexts[0].aggregates[0].invariants[0];
    expect(inv.id).toBe('ORD-01');
    expect(inv.description).toBe('Order must have items');
    expect(inv.scope).toBe('Order');
  });

  it('transforms domain service', async () => {
    const ir = await toIr(`
      context "Test"
        aggregate "Order"
          identity orderId: UUID
        service PricingService
          consumes OrderDraft
          produces PricedOrder
          description "Calculates final pricing"
    `);

    const svc = ir.contexts[0].domainServices[0];
    expect(svc.id).toBe('svc-PricingService');
    expect(svc.name).toBe('PricingService');
    expect(svc.consumes).toBe('OrderDraft');
    expect(svc.produces).toBe('PricedOrder');
    expect(svc.description).toBe('Calculates final pricing');
  });

  it('transforms policy with trigger and chains-to', async () => {
    const ir = await toIr(`
      context "Test"
        aggregate "Order"
          identity orderId: UUID
        policy CheckInventoryOnOrderPlaced
          trigger OrderPlaced
          action "Check inventory for all items"
          chains-to CheckInventory
    `);

    const pol = ir.contexts[0].policies[0];
    expect(pol.id).toBe('pol-CheckInventoryOnOrderPlaced');
    expect(pol.name).toBe('CheckInventoryOnOrderPlaced');
    expect(pol.trigger).toBe('OrderPlaced');
    expect(pol.action).toBe('Check inventory for all items');
    expect(pol.chainsTo).toBe('CheckInventory');
  });

  it('transforms policy with file-watcher trigger', async () => {
    const ir = await toIr(`
      context "Test"
        aggregate "Order"
          identity orderId: UUID
        policy RegenerateOnChange
          trigger "file-watcher"
          action "Regenerate on file change"
    `);

    const pol = ir.contexts[0].policies[0];
    expect(pol.trigger).toBe('file-watcher');
    expect(pol.chainsTo).toBeUndefined();
  });

  it('transforms context without classification', async () => {
    const ir = await toIr(`
      context "Unclassified"
        aggregate "Item"
          identity id: UUID
    `);

    expect(ir.contexts[0].name).toBe('Unclassified');
    expect(ir.contexts[0].classification).toBeUndefined();
  });

  it('transforms saga declaration', async () => {
    const ir = await toIr(`
      context "Test"
        aggregate "Order"
          identity orderId: UUID
        saga OrderFulfillmentSaga
          trigger OrderPlaced
          states Pending -> Reserved -> Fulfilled
          compensation "Cancel reservation and refund"
          timeout P30D
    `);

    const saga = ir.contexts[0].sagas[0];
    expect(saga.id).toBe('saga-OrderFulfillmentSaga');
    expect(saga.name).toBe('OrderFulfillmentSaga');
    expect(saga.trigger).toBe('OrderPlaced');
    expect(saga.states).toEqual(['Pending', 'Reserved', 'Fulfilled']);
    expect(saga.compensation).toBe('Cancel reservation and refund');
    expect(saga.timeout).toBe('P30D');
  });

  it('transforms flow declaration to FlowDefinition', async () => {
    const ir = await toIr(`
      flow "order-placed"
        description "Order submission flow"
        lane ordering "Ordering" [Core]
        lane fulfillment "Fulfillment" [Supporting]
        frame "Order submission"
          ordering: PlaceOrder
          ordering: OrderPlaced
    `);

    expect(ir.flows).toHaveLength(1);
    const flow = ir.flows[0];
    expect(flow.id).toBe('flow-order-placed');
    expect(flow.name).toBe('order-placed');
    expect(flow.description).toBe('Order submission flow');
  });

  it('transforms frames with node placements to FrameDefinitions', async () => {
    const ir = await toIr(`
      flow "test"
        lane a "A" [Core]
        frame "Step 1"
          a: PlaceOrder
          a: OrderPlaced
    `);

    const frame = ir.flows[0].frames[0];
    expect(frame.id).toBe('frame-0-Step-1');
    expect(frame.name).toBe('Step 1');
    expect(frame.contextEntries).toHaveLength(2);
    expect(frame.contextEntries[0].contextId).toBe('ctx-A');
    expect(frame.contextEntries[0].nodeName).toBe('PlaceOrder');
    expect(frame.contextEntries[0].nodeKind).toBe('event');
  });

  it('transforms context crossing to ConnectionDefinition', async () => {
    const ir = await toIr(`
      flow "test"
        lane a "A" [Core]
        lane b "B" [Supporting]
        frame "Step"
          a: OrderPlaced crosses-to b via CustomerSupplier
            contract
              orderId: UUID [required]
              items: OrderItem[] [required]
    `);

    const conn = ir.flows[0].connections.find((c) => c.connectionType === 'crosses-to');
    expect(conn).toBeDefined();
    expect(conn!.connectionType).toBe('crosses-to');
    expect(conn!.targetContextId).toBe('ctx-B');
    expect(conn!.eventId).toBe('evt-OrderPlaced');

    // Type narrowing for discriminated union
    if (conn!.connectionType === 'crosses-to') {
      expect(conn!.schemaContract.eventType).toBe('OrderPlaced');
      expect(conn!.schemaContract.relationshipType).toBe('CustomerSupplier');
      expect(conn!.schemaContract.fields).toHaveLength(2);
      expect(conn!.schemaContract.fields[0]).toEqual({
        name: 'orderId',
        type: 'UUID',
        required: true,
      });
      expect(conn!.schemaContract.fields[1]).toEqual({
        name: 'items',
        type: 'OrderItem[]',
        required: true,
      });
    }
  });

  it('transforms branch frame with when blocks', async () => {
    const ir = await toIr(`
      flow "test"
        lane a "A" [Core]
        branch-lane b "B" [Terminal]
        frame "Decision" [branch]
          when available
            a: FulfillmentReady
          when unavailable
            b: BackorderCreated [terminal]
    `);

    const frame = ir.flows[0].frames[0];
    expect(frame.branches).toHaveLength(2);
    expect(frame.branches![0].condition).toBe('available');
    expect(frame.branches![0].entries).toHaveLength(1);
    expect(frame.branches![0].entries[0].nodeName).toBe('FulfillmentReady');
    expect(frame.branches![1].condition).toBe('unavailable');
    expect(frame.branches![1].entries[0].nodeName).toBe('BackorderCreated');
    expect(frame.branches![1].entries[0].terminal).toBe(true);
  });

  it('transforms node modifiers (optional, terminal, multiplicity)', async () => {
    const ir = await toIr(`
      flow "test"
        lane a "A" [Core]
        frame "Step"
          a: EventA (×3)
          a: EventB [optional]
          a: EventC [terminal]
    `);

    const entries = ir.flows[0].frames[0].contextEntries;
    expect(entries[0].multiplicity).toBe(3);
    expect(entries[1].optional).toBe(true);
    expect(entries[2].terminal).toBe(true);
  });

  it('transforms triggered-by and triggers connections', async () => {
    const ir = await toIr(`
      flow "test"
        lane a "A" [Core]
        lane b "B" [Supporting]
        frame "Step"
          b: InitiateFulfillment
            triggered-by OrderPlaced
          b: FulfillmentInitiated
            triggers NotifyCustomer
    `);

    const connections = ir.flows[0].connections;
    const triggeredBy = connections.find((c) => c.connectionType === 'triggered-by');
    expect(triggeredBy).toBeDefined();
    expect(triggeredBy!.eventId).toBe('evt-OrderPlaced');

    const triggers = connections.find((c) => c.connectionType === 'triggers');
    expect(triggers).toBeDefined();
    expect(triggers!.eventId).toBe('evt-NotifyCustomer');
  });

  it('transforms returns-to connection', async () => {
    const ir = await toIr(`
      flow "test"
        lane a "A" [Core]
        frame "Step 1"
          a: EventA
        frame "Step 2"
          a: EventB
            returns-to "Step 1"
    `);

    const connections = ir.flows[0].connections;
    const returnsTo = connections.find((c) => c.connectionType === 'returns-to');
    expect(returnsTo).toBeDefined();
    expect(returnsTo!.eventId).toBe('evt-EventB');
    expect(returnsTo!.sourceFrameId).toBe('frame-1-Step-2');
  });

  it('collects commands, events, value objects, invariants at context level', async () => {
    const ir = await toIr(`
      context "Test" [Core]
        aggregate "Order"
          identity orderId: UUID
          command PlaceOrder
            emits OrderPlaced
          event OrderPlaced
            orderId: UUID
        aggregate "Payment"
          identity paymentId: UUID
          command ProcessPayment
            emits PaymentProcessed
          event PaymentProcessed
            paymentId: UUID
    `);

    const ctx = ir.contexts[0];
    expect(ctx.commands).toHaveLength(2);
    expect(ctx.events).toHaveLength(2);
    expect(ctx.aggregates).toHaveLength(2);
  });

  it('populates metadata with defaults', async () => {
    const ir = await toIr(`
      context "Test"
        aggregate "Order"
          identity orderId: UUID
    `);

    expect(ir.metadata).toEqual({ name: '', version: '0.0.0' });
    expect(ir.glossary).toEqual([]);
  });

  it('extracts context relationships', async () => {
    const ir = await toIr(`
      context "Ordering" [Core]
        aggregate "Order"
          identity orderId: UUID
        relationship Ordering -> Fulfillment
          type CustomerSupplier
          contract "OrderPlaced event contract"
    `);

    expect(ir.relationships).toHaveLength(1);
    expect(ir.relationships[0]).toEqual({
      sourceContextId: 'Ordering',
      targetContextId: 'Fulfillment',
      relationshipType: 'CustomerSupplier',
      contract: 'OrderPlaced event contract',
    });
  });

  it('handles multiplicity with variable', async () => {
    const ir = await toIr(`
      flow "test"
        lane a "A" [Core]
        frame "Step"
          a: InventoryReserved (×N)
    `);

    const entry = ir.flows[0].frames[0].contextEntries[0];
    expect(entry.multiplicity).toBe('N');
  });

  it('returns empty contexts and flows for empty file', async () => {
    const doc = await parse('');
    const ir = astToIr(doc.parseResult.value);

    expect(ir.contexts).toHaveLength(0);
    expect(ir.flows).toHaveLength(0);
    expect(ir.relationships).toEqual([]);
  });

  it('transforms context without classification', async () => {
    const ir = await toIr(`
      context "Plain"
        aggregate "Thing"
          identity id: UUID
    `);

    expect(ir.contexts[0].classification).toBeUndefined();
  });

  it('transforms flow without description', async () => {
    const ir = await toIr(`
      flow "nodesc"
        lane a "A" [Core]
        frame "Step"
          a: EventA
    `);

    expect(ir.flows[0].description).toBeUndefined();
  });

  it('handles crossing connection in when block', async () => {
    const ir = await toIr(`
      flow "test"
        lane a "A" [Core]
        lane b "B" [Supporting]
        frame "Decision" [branch]
          when available
            a: FulfillmentReady crosses-to b via Partnership
              contract
                orderId: UUID [required]
    `);

    const conn = ir.flows[0].connections.find((c) => c.connectionType === 'crosses-to');
    expect(conn).toBeDefined();
    expect(conn!.targetContextId).toBe('ctx-B');
  });

  it('transforms unified file with both contexts and flows (ADR-027)', async () => {
    const ir = await toIr(`
      context "Ordering" [Core]
        aggregate "Order"
          identity orderId: UUID
          command PlaceOrder
            input customerId: UUID
            emits OrderPlaced
          event OrderPlaced
            orderId: UUID
            customerId: UUID

      context "Fulfillment" [Supporting]
        aggregate "Request"
          identity reqId: UUID

      flow "order-flow"
        description "Order triggers fulfillment"
        lane ordering "Ordering" [Core]
        lane fulfillment "Fulfillment" [Supporting]
        frame "Place"
          ordering: PlaceOrder
          ordering: OrderPlaced crosses-to fulfillment via CustomerSupplier
            contract
              orderId: UUID [required]
    `);

    expect(ir.contexts).toHaveLength(2);
    expect(ir.contexts[0].name).toBe('Ordering');
    expect(ir.contexts[1].name).toBe('Fulfillment');

    expect(ir.flows).toHaveLength(1);
    expect(ir.flows[0].name).toBe('order-flow');
    expect(ir.flows[0].frames).toHaveLength(1);
    expect(ir.flows[0].connections.length).toBeGreaterThan(0);

    expect(ir.contexts[0].aggregates[0].commands).toHaveLength(1);
    expect(ir.contexts[0].aggregates[0].events).toHaveLength(1);
  });
});
