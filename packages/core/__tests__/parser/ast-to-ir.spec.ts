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

  it('transforms context with description', async () => {
    const ir = await toIr(`
      context "Sales" [Core]
        description "Handles all sales operations"
        aggregate "Order"
          identity orderId: UUID
    `);

    expect(ir.contexts[0].description).toBe('Handles all sales operations');
  });

  it('transforms context without description', async () => {
    const ir = await toIr(`
      context "Sales" [Core]
        aggregate "Order"
          identity orderId: UUID
    `);

    expect(ir.contexts[0].description).toBeUndefined();
  });

  it('transforms deprecated field with reason and replacement', async () => {
    const ir = await toIr(`
      context "Sales" [Core]
        aggregate "Order"
          identity orderId: UUID
          event OrderPlaced
            orderId: UUID
            legacyId: string [deprecated "Use orderId instead" -> "orderId"]
    `);

    const event = ir.contexts[0].aggregates[0].events[0];
    const legacyField = event.fields.find((f) => f.name === 'legacyId');
    expect(legacyField).toBeDefined();
    expect(legacyField!.deprecated).toEqual({
      reason: 'Use orderId instead',
      replacement: 'orderId',
    });

    const normalField = event.fields.find((f) => f.name === 'orderId');
    expect(normalField!.deprecated).toBeUndefined();
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
    // Transitions derived from the state chain; no `on` mapping declared.
    expect(saga.transitions).toEqual([
      { from: 'Pending', to: 'Reserved' },
      { from: 'Reserved', to: 'Fulfilled' },
    ]);
  });

  it('derives saga transitions with `on` event mappings (M-S6)', async () => {
    const ir = await toIr(`
      context "Test"
        aggregate "Hold"
          identity holdId: UUID
        saga HoldLifecycle
          trigger PlaceHold
          states Held -> Converting on PaymentConfirmed -> Converted on HoldConvertedToReservation
          compensation "Release the hold"
          timeout "none"
    `);

    const saga = ir.contexts[0].sagas[0];
    expect(saga.states).toEqual(['Held', 'Converting', 'Converted']);
    expect(saga.transitions).toEqual([
      { from: 'Held', to: 'Converting', onEvent: 'PaymentConfirmed' },
      { from: 'Converting', to: 'Converted', onEvent: 'HoldConvertedToReservation' },
    ]);
  });

  it('derives mixed mapped/unmapped saga transitions without onEvent on unmapped ones', async () => {
    const ir = await toIr(`
      context "Test"
        aggregate "Order"
          identity orderId: UUID
        saga OrderFulfillment
          trigger PlaceOrder
          states Pending -> Reserved on InventoryReserved -> Shipped -> Complete on DeliveryConfirmed
          compensation "Cancel reservation and refund"
          timeout P30D
    `);

    const saga = ir.contexts[0].sagas[0];
    expect(saga.states).toEqual(['Pending', 'Reserved', 'Shipped', 'Complete']);
    expect(saga.transitions).toEqual([
      { from: 'Pending', to: 'Reserved', onEvent: 'InventoryReserved' },
      { from: 'Reserved', to: 'Shipped' },
      { from: 'Shipped', to: 'Complete', onEvent: 'DeliveryConfirmed' },
    ]);
    // Unmapped transitions carry no onEvent key at all.
    expect('onEvent' in saga.transitions![1]).toBe(false);
  });

  it('derives an empty transitions list for a single-state saga', async () => {
    const ir = await toIr(`
      context "Test"
        aggregate "Order"
          identity orderId: UUID
        saga SingleState
          trigger Start
          states Done
          compensation "n/a"
          timeout "none"
    `);

    const saga = ir.contexts[0].sagas[0];
    expect(saga.states).toEqual(['Done']);
    expect(saga.transitions).toEqual([]);
  });

  it('transforms flow declaration to FlowDefinition', async () => {
    const ir = await toIr(`
      flow "order-placed"
        description "Order submission flow"
        lane ordering "Ordering" [Core]
        lane fulfillment "Fulfillment" [Supporting]
        moment "Order submission"
          ordering: PlaceOrder
          ordering: OrderPlaced
    `);

    expect(ir.flows).toHaveLength(1);
    const flow = ir.flows[0];
    expect(flow.id).toBe('flow-order-placed');
    expect(flow.name).toBe('order-placed');
    expect(flow.description).toBe('Order submission flow');
    expect(flow.lanes).toHaveLength(2);
    expect(flow.lanes[0]).toEqual({
      id: 'ordering',
      label: 'Ordering',
      contextId: 'ctx-Ordering',
      classification: 'Core',
      isBranch: false,
    });
    expect(flow.lanes[1]).toEqual({
      id: 'fulfillment',
      label: 'Fulfillment',
      contextId: 'ctx-Fulfillment',
      classification: 'Supporting',
      isBranch: false,
    });
  });

  it('transforms frames with node placements to MomentDefinitions', async () => {
    const ir = await toIr(`
      flow "test"
        lane a "A" [Core]
        moment "Step 1"
          a: PlaceOrder
          a: OrderPlaced
    `);

    const frame = ir.flows[0].moments[0];
    expect(frame.id).toBe('moment-0-Step-1');
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
        moment "Step"
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
        moment "Decision" [branch]
          when available
            a: FulfillmentReady
          when unavailable
            b: BackorderCreated [terminal]
    `);

    const flow = ir.flows[0];
    expect(flow.lanes).toHaveLength(2);
    expect(flow.lanes[0].isBranch).toBe(false);
    expect(flow.lanes[1].isBranch).toBe(true);
    expect(flow.lanes[1].classification).toBe('Terminal');

    const frame = flow.moments[0];
    expect(frame.branches).toHaveLength(2);
    expect(frame.branches![0].condition).toBe('available');
    expect(frame.branches![0].entries).toHaveLength(1);
    expect(frame.branches![0].entries[0].nodeName).toBe('FulfillmentReady');
    expect(frame.branches![1].condition).toBe('unavailable');
    expect(frame.branches![1].entries[0].nodeName).toBe('BackorderCreated');
    expect(frame.branches![1].entries[0].terminal).toBe(true);
  });

  describe('MomentDefinition.sequence — textual child order (M-P13)', () => {
    it('records node/when order from CST offsets on a real parse', async () => {
      // NOTE: the current grammar's `when` blocks greedily consume following
      // node placements, so a parsed moment's main entries always textually
      // precede its when blocks — the sequence reflects exactly that.
      const ir = await toIr(`
        flow "test"
          lane a "A" [Core]
          moment "Mixed"
            a: FirstEvent
            a: SecondEvent
            when rejected
              a: RejectionRecorded
            when expired
              a: ExpiryRecorded
      `);

      const frame = ir.flows[0].moments[0];
      expect(frame.contextEntries.map((e) => e.nodeName)).toEqual(['FirstEvent', 'SecondEvent']);
      expect(frame.branches!.map((b) => b.condition)).toEqual(['rejected', 'expired']);
      expect(frame.sequence).toEqual([
        { kind: 'entry', index: 0 },
        { kind: 'entry', index: 1 },
        { kind: 'branch', index: 0 },
        { kind: 'branch', index: 1 },
      ]);
    });

    it('orders interleaved node/when/node children by textual offset', () => {
      // The grammar cannot currently parse a main entry after a when block,
      // but the sequence derivation is defined for any child interleaving —
      // exercised here via explicit CST offsets on a hand-built AST.
      const fakeFile = {
        $type: 'MomentFile',
        contexts: [],
        flows: [
          {
            $type: 'FlowDeclaration',
            name: '"synthetic"',
            lanes: [],
            moments: [
              {
                $type: 'MomentDeclaration',
                label: '"Interleaved"',
                nodes: [
                  {
                    $type: 'NodePlacement',
                    laneId: 'a',
                    nodeName: 'FirstEvent',
                    connections: [],
                    $cstNode: { offset: 0 },
                  },
                  {
                    $type: 'NodePlacement',
                    laneId: 'a',
                    nodeName: 'SecondEvent',
                    connections: [],
                    $cstNode: { offset: 200 },
                  },
                ],
                whenBlocks: [
                  {
                    $type: 'WhenBlock',
                    condition: 'rejected',
                    nodes: [],
                    $cstNode: { offset: 100 },
                  },
                  {
                    $type: 'WhenBlock',
                    condition: 'expired',
                    nodes: [],
                    $cstNode: { offset: 300 },
                  },
                ],
              },
            ],
          },
        ],
      } as unknown as MomentFile;

      const ir = astToIr(fakeFile);
      expect(ir.flows[0].moments[0].sequence).toEqual([
        { kind: 'entry', index: 0 },
        { kind: 'branch', index: 0 },
        { kind: 'entry', index: 1 },
        { kind: 'branch', index: 1 },
      ]);
    });

    it('is emitted for every moment, including entries-only and branches-only ones', async () => {
      const ir = await toIr(`
        flow "test"
          lane a "A" [Core]
          moment "EntriesOnly"
            a: EventA
            a: EventB
          moment "BranchesOnly"
            when yes
              a: YesEvent
            when no
              a: NoEvent
      `);

      expect(ir.flows[0].moments[0].sequence).toEqual([
        { kind: 'entry', index: 0 },
        { kind: 'entry', index: 1 },
      ]);
      expect(ir.flows[0].moments[1].sequence).toEqual([
        { kind: 'branch', index: 0 },
        { kind: 'branch', index: 1 },
      ]);
    });

    it('falls back to entries-then-branches order when the AST carries no CST nodes', () => {
      // Hand-built AST (no $cstNode anywhere), e.g. synthetic test fixtures.
      const fakeFile = {
        $type: 'MomentFile',
        contexts: [],
        flows: [
          {
            $type: 'FlowDeclaration',
            name: '"synthetic"',
            lanes: [],
            moments: [
              {
                $type: 'MomentDeclaration',
                label: '"Synthetic"',
                nodes: [
                  { $type: 'NodePlacement', laneId: 'a', nodeName: 'E1', connections: [] },
                  { $type: 'NodePlacement', laneId: 'a', nodeName: 'E2', connections: [] },
                ],
                whenBlocks: [{ $type: 'WhenBlock', condition: 'c', nodes: [] }],
              },
            ],
          },
        ],
      } as unknown as MomentFile;

      const ir = astToIr(fakeFile);
      expect(ir.flows[0].moments[0].sequence).toEqual([
        { kind: 'entry', index: 0 },
        { kind: 'entry', index: 1 },
        { kind: 'branch', index: 0 },
      ]);
    });
  });

  it('transforms node modifiers (optional, terminal, multiplicity)', async () => {
    const ir = await toIr(`
      flow "test"
        lane a "A" [Core]
        moment "Step"
          a: EventA (×3)
          a: EventB [optional]
          a: EventC [terminal]
    `);

    const entries = ir.flows[0].moments[0].contextEntries;
    expect(entries[0].multiplicity).toBe(3);
    expect(entries[1].optional).toBe(true);
    expect(entries[2].terminal).toBe(true);
  });

  it('transforms lane without classification', async () => {
    const ir = await toIr(`
      flow "test"
        lane a "A"
        moment "Step"
          a: DoSomething
    `);

    expect(ir.flows[0].lanes).toHaveLength(1);
    expect(ir.flows[0].lanes[0].classification).toBeUndefined();
    expect(ir.flows[0].lanes[0].isBranch).toBe(false);
  });

  it('transforms triggered-by and triggers connections', async () => {
    const ir = await toIr(`
      flow "test"
        lane a "A" [Core]
        lane b "B" [Supporting]
        moment "Step"
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
        moment "Step 1"
          a: EventA
        moment "Step 2"
          a: EventB
            returns-to "Step 1"
    `);

    const connections = ir.flows[0].connections;
    const returnsTo = connections.find((c) => c.connectionType === 'returns-to');
    expect(returnsTo).toBeDefined();
    expect(returnsTo!.eventId).toBe('evt-EventB');
    expect(returnsTo!.sourceMomentId).toBe('moment-1-Step-2');
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
      sourceContextId: 'ctx-Ordering',
      targetContextId: 'ctx-Fulfillment',
      relationshipType: 'CustomerSupplier',
      contract: 'OrderPlaced event contract',
    });
  });

  it('handles multiplicity with variable', async () => {
    const ir = await toIr(`
      flow "test"
        lane a "A" [Core]
        moment "Step"
          a: InventoryReserved (×N)
    `);

    const entry = ir.flows[0].moments[0].contextEntries[0];
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
        moment "Step"
          a: EventA
    `);

    expect(ir.flows[0].description).toBeUndefined();
  });

  it('handles crossing connection in when block', async () => {
    const ir = await toIr(`
      flow "test"
        lane a "A" [Core]
        lane b "B" [Supporting]
        moment "Decision" [branch]
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
        moment "Place"
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
    expect(ir.flows[0].moments).toHaveLength(1);
    expect(ir.flows[0].connections.length).toBeGreaterThan(0);

    expect(ir.contexts[0].aggregates[0].commands).toHaveLength(1);
    expect(ir.contexts[0].aggregates[0].events).toHaveLength(1);
  });

  it('attaches annotations to aggregate, command, event, and value object (§5.1.4)', async () => {
    const ir = await toIr(`
      context "Records" [Core]
        @classification(PHI)
        @retention(HIPAA)
        aggregate "PatientRecord"
          identity recordId: UUID

          @classification(PHI)
          command CreateRecord
            input ownerName: string
            emits RecordCreated

          @classification(PHI)
          event RecordCreated
            recordId: UUID

          @encryption("at-rest")
          value-object Chart
            entries: string[]
    `);

    const agg = ir.contexts[0].aggregates[0];
    expect(agg.annotations).toEqual([
      { name: 'classification', value: 'PHI' },
      { name: 'retention', value: 'HIPAA' },
    ]);
    // Quoted annotation values are unquoted; bare IDs pass through.
    expect(agg.commands[0].annotations).toEqual([{ name: 'classification', value: 'PHI' }]);
    expect(agg.events[0].annotations).toEqual([{ name: 'classification', value: 'PHI' }]);
    expect(agg.valueObjects[0].annotations).toEqual([{ name: 'encryption', value: 'at-rest' }]);
  });

  it('omits annotations key on unannotated declarations', async () => {
    const ir = await toIr(`
      context "Plain" [Core]
        aggregate "Order"
          identity orderId: UUID
          command PlaceOrder
            input customerId: UUID
            emits OrderPlaced
          event OrderPlaced
            orderId: UUID
          value-object Address
            street: string
    `);

    const agg = ir.contexts[0].aggregates[0];
    expect(agg.annotations).toBeUndefined();
    expect(agg.commands[0].annotations).toBeUndefined();
    expect(agg.events[0].annotations).toBeUndefined();
    expect(agg.valueObjects[0].annotations).toBeUndefined();
  });

  it('carries when-block lane routing onto BranchDefinition (V16)', async () => {
    const ir = await toIr(`
      flow "record-lifecycle"
        lane records "Records" [Core]
        branch-lane rejected "Rejected" [Terminal]
        moment "Creation outcome" [branch]
          when accepted
            records: RecordCreated
          when invalid [rejected]
            rejected: RecordCreated [terminal]
    `);

    const branches = ir.flows[0].moments[0].branches!;
    expect(branches[0].condition).toBe('accepted');
    expect(branches[0].lane).toBeUndefined();
    expect(branches[1].condition).toBe('invalid');
    expect(branches[1].lane).toBe('rejected');
  });

  it('falls back to the raw lane id when a node references an undeclared lane', async () => {
    // astToIr is validation-free; V16 flags this separately.
    const ir = await toIr(`
      flow "test"
        lane a "A" [Core]
        moment "Step"
          ghost: EventA
          a: EventB crosses-to ghost via Partnership
            contract
              orderId: UUID [required]
    `);

    const entry = ir.flows[0].moments[0].contextEntries[0];
    expect(entry.contextId).toBe('ghost');

    const conn = ir.flows[0].connections.find((c) => c.connectionType === 'crosses-to');
    expect(conn!.targetContextId).toBe('ghost');
  });

  it('transforms saga with timeout "none"', async () => {
    const ir = await toIr(`
      context "Test"
        aggregate "Order"
          identity orderId: UUID
        saga NoTimeoutSaga
          trigger OrderPlaced
          states Pending -> Done
          compensation "Undo"
          timeout "none"
    `);

    expect(ir.contexts[0].sagas[0].timeout).toBe('none');
  });

  // -------------------------------------------------------------------------
  // M-P4 — annotations reach policy/saga/service/invariant definitions
  // -------------------------------------------------------------------------
  describe('annotations on policy/saga/service/invariant (M-P4)', () => {
    it('attaches annotations to policy, saga, and service definitions', async () => {
      // Declarations precede the aggregate: the aggregate-member loop is
      // greedy, so annotations written after an aggregate attach to it.
      const ir = await toIr(`
        context "Test"
          @classification(PII)
          policy NotifyOnPlacement
            trigger OrderPlaced
            action "Notify the warehouse"
          @retention(HIPAA)
          saga OrderLifecycle
            trigger OrderPlaced
            states Pending -> Done
            compensation "Undo"
            timeout "none"
          @encryption("at-rest")
          service PricingService
            consumes PriceRequest
            produces PriceQuote
            description "Computes prices"
          aggregate "Order"
            identity orderId: UUID
            event OrderPlaced
              orderId: UUID
      `);

      const ctx = ir.contexts[0];
      expect(ctx.policies[0].annotations).toEqual([{ name: 'classification', value: 'PII' }]);
      expect(ctx.sagas[0].annotations).toEqual([{ name: 'retention', value: 'HIPAA' }]);
      expect(ctx.domainServices[0].annotations).toEqual([{ name: 'encryption', value: 'at-rest' }]);
    });

    it('attaches annotations to invariant definitions', async () => {
      const ir = await toIr(`
        context "Test"
          aggregate "Order"
            identity orderId: UUID
            event OrderPlaced
              orderId: UUID
            @classification(PII)
            invariant ORD-01 "Order must contain at least one item"
              scope Order
      `);

      expect(ir.contexts[0].invariants[0].annotations).toEqual([
        { name: 'classification', value: 'PII' },
      ]);
    });

    it('omits annotations key on unannotated policy/saga/service/invariant', async () => {
      const ir = await toIr(`
        context "Test"
          policy NotifyOnPlacement
            trigger OrderPlaced
            action "Notify the warehouse"
          saga OrderLifecycle
            trigger OrderPlaced
            states Pending -> Done
            compensation "Undo"
            timeout "none"
          service PricingService
            consumes PriceRequest
            produces PriceQuote
            description "Computes prices"
          aggregate "Order"
            identity orderId: UUID
            invariant ORD-01 "Order must contain at least one item"
              scope Order
      `);

      const ctx = ir.contexts[0];
      expect(ctx.policies[0].annotations).toBeUndefined();
      expect(ctx.sagas[0].annotations).toBeUndefined();
      expect(ctx.domainServices[0].annotations).toBeUndefined();
      expect(ctx.invariants[0].annotations).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // M-P12 — metadata parameter
  // -------------------------------------------------------------------------
  describe('metadata parameter (M-P12)', () => {
    it('stamps supplied name and version onto the IR', async () => {
      const doc = await parse(`
        context "Test"
          aggregate "Order"
            identity orderId: UUID
      `);
      const ir = astToIr(doc.parseResult.value, { name: 'my-spec', version: '1.2.3' });
      expect(ir.metadata).toEqual({ name: 'my-spec', version: '1.2.3' });
    });

    it('keeps historical defaults for omitted fields', async () => {
      const doc = await parse(`
        context "Test"
          aggregate "Order"
            identity orderId: UUID
      `);
      const ir = astToIr(doc.parseResult.value, { name: 'named-only' });
      expect(ir.metadata).toEqual({ name: 'named-only', version: '0.0.0' });
    });
  });
});
