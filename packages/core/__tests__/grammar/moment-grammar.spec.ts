/**
 * MMNT-26 Moment Grammar — Verification Tests
 *
 * Tests verify that the moment.langium grammar correctly parses all 21
 * Langium constructs (10 spatial + 11 temporal) and rejects invalid syntax.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import {
  inject,
  createDefaultCoreModule,
  createDefaultSharedCoreModule,
  EmptyFileSystem,
  type LangiumDocument,
} from 'langium';
import { parseHelper } from 'langium/test';
import { MomentGeneratedModule, MomentGeneratedSharedModule } from '../../src/generated/module.js';
import type { MomentFile } from '../../src/generated/ast.js';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const FIXTURES = resolve(import.meta.dirname, '../../../..', 'fixtures');
const GENERATED = resolve(import.meta.dirname, '../../src/generated');

function readFixture(relativePath: string): string {
  return readFileSync(resolve(FIXTURES, relativePath), 'utf-8');
}

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

// ---------------------------------------------------------------------------
// MMNT-668 — Spatial Constructs: Context + Aggregate parsing
// ---------------------------------------------------------------------------
describe('Moment Grammar > Spatial Constructs', () => {
  it('parses context declaration with classification', async () => {
    const doc = await parse('context "OrderManagement" [Core]');
    expect(doc.parseResult.lexerErrors).toHaveLength(0);
    expect(doc.parseResult.parserErrors).toHaveLength(0);
    const file = doc.parseResult.value;
    expect(file.contexts).toHaveLength(1);
    expect(file.contexts[0].name).toBe('OrderManagement');
    expect(file.contexts[0].classification?.value).toBe('Core');
  });

  it('parses aggregate with identity field', async () => {
    const doc = await parse(`
      context "Test" [Core]
        aggregate "Order"
          identity orderId: UUID
    `);
    expect(doc.parseResult.parserErrors).toHaveLength(0);
    const ctx = doc.parseResult.value.contexts[0];
    expect(ctx.members).toHaveLength(1);
    const agg = ctx.members[0];
    expect(agg.$type).toBe('AggregateDeclaration');
    if (agg.$type === 'AggregateDeclaration') {
      expect(agg.name).toBe('Order');
      expect(agg.identityField.name).toBe('orderId');
      expect(agg.identityField.type.typeName).toBe('UUID');
    }
  });

  it('parses command with input, precondition, and emits', async () => {
    const doc = await parse(`
      context "Test" [Core]
        aggregate "Order"
          identity orderId: UUID
          command PlaceOrder
            input customerId: UUID, items: OrderItem[]
            precondition orderNotPlaced: "Order not placed"
            emits OrderPlaced
    `);
    expect(doc.parseResult.parserErrors).toHaveLength(0);
    const agg = doc.parseResult.value.contexts[0].members[0];
    if (agg.$type === 'AggregateDeclaration') {
      const cmd = agg.members[0];
      expect(cmd.$type).toBe('CommandDeclaration');
      if (cmd.$type === 'CommandDeclaration') {
        expect(cmd.name).toBe('PlaceOrder');
        expect(cmd.inputs).toHaveLength(2);
        expect(cmd.inputs[1].type.isArray).toBe(true);
        expect(cmd.preconditions).toHaveLength(1);
        expect(cmd.emits.outcomes.map((o) => o.events)).toEqual([['OrderPlaced']]);
      }
    }
  });

  it('parses domain event with typed fields', async () => {
    const doc = await parse(`
      context "Test" [Core]
        aggregate "Order"
          identity orderId: UUID
          event OrderPlaced
            orderId: UUID
            placedAt: DateTime
    `);
    expect(doc.parseResult.parserErrors).toHaveLength(0);
    const agg = doc.parseResult.value.contexts[0].members[0];
    if (agg.$type === 'AggregateDeclaration') {
      const evt = agg.members[0];
      expect(evt.$type).toBe('DomainEventDeclaration');
      if (evt.$type === 'DomainEventDeclaration') {
        expect(evt.name).toBe('OrderPlaced');
        expect(evt.fields).toHaveLength(2);
      }
    }
  });

  it('parses value object with typed fields', async () => {
    const doc = await parse(`
      context "Test" [Core]
        aggregate "Order"
          identity orderId: UUID
          value-object OrderItem
            productId: UUID
            quantity: number
            unitPrice: Money
    `);
    expect(doc.parseResult.parserErrors).toHaveLength(0);
    const agg = doc.parseResult.value.contexts[0].members[0];
    if (agg.$type === 'AggregateDeclaration') {
      const vo = agg.members[0];
      expect(vo.$type).toBe('ValueObjectDeclaration');
      if (vo.$type === 'ValueObjectDeclaration') {
        expect(vo.name).toBe('OrderItem');
        expect(vo.fields).toHaveLength(3);
      }
    }
  });

  // ---------------------------------------------------------------------------
  // MMNT-669 — Spatial Constructs: Invariant, Service, Policy, Saga, Relationship
  // ---------------------------------------------------------------------------
  it('parses invariant declaration with scope', async () => {
    const doc = await parse(`
      context "Test" [Core]
        aggregate "Order"
          identity orderId: UUID
          invariant ORD-01 "Order must have items"
            scope Order
    `);
    expect(doc.parseResult.parserErrors).toHaveLength(0);
    const agg = doc.parseResult.value.contexts[0].members[0];
    if (agg.$type === 'AggregateDeclaration') {
      const inv = agg.members[0];
      expect(inv.$type).toBe('InvariantDeclaration');
      if (inv.$type === 'InvariantDeclaration') {
        expect(inv.id).toBe('ORD-01');
        expect(inv.scope).toBe('Order');
      }
    }
  });

  it('parses domain service with consumes and produces', async () => {
    const doc = await parse(`
      context "Test" [Core]
        service SchemaValidator
          consumes MomentData
          produces ValidationResult
          description "Validates specification structure"
    `);
    expect(doc.parseResult.parserErrors).toHaveLength(0);
    const member = doc.parseResult.value.contexts[0].members[0];
    expect(member.$type).toBe('DomainServiceDeclaration');
    if (member.$type === 'DomainServiceDeclaration') {
      expect(member.name).toBe('SchemaValidator');
      expect(member.consumes).toBe('MomentData');
      expect(member.produces).toBe('ValidationResult');
    }
  });

  it('parses policy with trigger, action, and chains-to', async () => {
    const doc = await parse(`
      context "Test" [Core]
        policy OnOrderPlaced
          trigger OrderPlaced
          action "Check inventory"
          chains-to CheckInventory
    `);
    expect(doc.parseResult.parserErrors).toHaveLength(0);
    const member = doc.parseResult.value.contexts[0].members[0];
    expect(member.$type).toBe('PolicyDeclaration');
    if (member.$type === 'PolicyDeclaration') {
      expect(member.name).toBe('OnOrderPlaced');
      expect(member.chainsTo).toBe('CheckInventory');
    }
  });

  it('parses an orchestration with its own commands, invoked-by, issues, states, compensation, timeout', async () => {
    const doc = await parse(`
      context "Test" [Core]
        orchestration OrderFulfillment
          command StartFulfillment
            input orderId: UUID
          command CancelFulfillment
          invoked-by StartFulfillment
          issues ReserveStock, Carrier.ship
          states Pending -> Reserved -> Shipped -> Complete
          compensation on CancelFulfillment issues ReleaseStock
          timeout "none"
    `);
    expect(doc.parseResult.parserErrors).toHaveLength(0);
    const member = doc.parseResult.value.contexts[0].members[0];
    expect(member.$type).toBe('SagaDeclaration');
    if (member.$type === 'SagaDeclaration') {
      expect(member.keyword).toBe('orchestration');
      expect(member.name).toBe('OrderFulfillment');
      expect(member.commands.map((c) => c.name)).toEqual(['StartFulfillment', 'CancelFulfillment']);
      expect(member.invokedBy).toBe('StartFulfillment');
      expect(member.issues.map((c) => [c.target, c.operation])).toEqual([
        ['ReserveStock', undefined],
        ['Carrier', 'ship'],
      ]);
      expect(member.initialState).toBe('Pending');
      expect(member.transitions.map((t) => t.target)).toEqual(['Reserved', 'Shipped', 'Complete']);
      expect(member.compensations.map((c) => [c.command, c.undo.map((u) => u.target)])).toEqual([
        ['CancelFulfillment', ['ReleaseStock']],
      ]);
    }
  });

  it('parses orchestration steps on its own commands', async () => {
    const doc = await parse(`
      context "Test" [Core]
        saga HoldLifecycle
          command TrackHold
          command AwaitConversion
          command CloseHold
          invoked-by TrackHold
          issues ConvertHold
          states Held -> Converting on AwaitConversion -> Converted on CloseHold -> Expired
          compensation none
          timeout P30D
    `);
    expect(doc.parseResult.lexerErrors).toHaveLength(0);
    expect(doc.parseResult.parserErrors).toHaveLength(0);
    const member = doc.parseResult.value.contexts[0].members[0];
    expect(member.$type).toBe('SagaDeclaration');
    if (member.$type === 'SagaDeclaration') {
      expect(member.keyword).toBe('saga');
      expect(member.transitions.map((t) => t.command)).toEqual([
        'AwaitConversion',
        'CloseHold',
        undefined,
      ]);
      expect(member.compensations.map((c) => c.none)).toEqual([true]);
    }
  });

  it('refuses the event-started saga form with prose compensation (ADR-038 §2)', async () => {
    const doc = await parse(`
      context "Test" [Core]
        saga OrderFulfillment
          trigger OrderPlaced
          states Pending -> Reserved on InventoryReserved
          compensation "Cancel reservation and refund"
          timeout "none"
    `);
    expect(doc.parseResult.parserErrors.length).toBeGreaterThan(0);
  });

  it('refuses an orchestration with no compensation line (ADR-038 O2)', async () => {
    const doc = await parse(`
      context "Test" [Core]
        orchestration OrderFulfillment
          command StartFulfillment
          invoked-by StartFulfillment
          issues ReserveStock
          states Pending
          timeout "none"
    `);
    expect(doc.parseResult.parserErrors.length).toBeGreaterThan(0);
  });

  it('refuses a policy that invokes no command (ADR-038 §1)', async () => {
    const doc = await parse(`
      context "Test" [Core]
        policy ProjectOnOrderPlaced
          trigger OrderPlaced
          action "update the order list"
    `);
    expect(doc.parseResult.parserErrors.length).toBeGreaterThan(0);
  });

  it('refuses a condition-triggered policy (ADR-038 §1)', async () => {
    const doc = await parse(`
      context "Test" [Core]
        policy ReEncode
          trigger condition "the encoder changed"
          action "re-encode"
          chains-to Rebuild
    `);
    expect(doc.parseResult.parserErrors.length).toBeGreaterThan(0);
  });

  it('parses aggregate internal state (ADR-038 §3)', async () => {
    const doc = await parse(`
      context "Test" [Core]
        aggregate "Node"
          identity nodeId: UUID
          state initial WritesOpen
          state WritesOpen -> Paused on PauseWrites
          command PauseWrites
            emits WritesPaused
          event WritesPaused
            state: string
    `);
    expect(doc.parseResult.parserErrors).toHaveLength(0);
    const agg = doc.parseResult.value.contexts[0].members[0];
    if (agg.$type === 'AggregateDeclaration') {
      expect(agg.states.map((m) => [m.initial, m.name, m.from, m.to, m.command])).toEqual([
        [true, 'WritesOpen', undefined, undefined, undefined],
        [false, undefined, 'WritesOpen', 'Paused', 'PauseWrites'],
      ]);
    }
  });

  it('parses gateways on an external, a projection and a policy (ADR-038 §4)', async () => {
    const doc = await parse(`
      external Hosted "upstream"
        gateway ReadEnvelope
          consumes Envelope
          produces Budget
      context "Test" [Core]
        projection ConnectionsList
          sources ConnectionOpened
          gateway ResolveConnection
            consumes ConnectionToken
            produces Actor
            description "per request"
        policy RebuildOnImported
          trigger SnapshotImported
          action "rebuild"
          chains-to Rebuild
          gateway PickEncoder
            consumes SnapshotImported
            produces Encoder
    `);
    expect(doc.parseResult.parserErrors).toHaveLength(0);
    const file = doc.parseResult.value;
    expect(file.externals[0].gateways.map((g) => g.name)).toEqual(['ReadEnvelope']);
    const [projection, policy] = file.contexts[0].members;
    if (projection.$type === 'ProjectionDeclaration') {
      expect(projection.gateways.map((g) => [g.consumes, g.produces])).toEqual([
        ['ConnectionToken', 'Actor'],
      ]);
    }
    if (policy.$type === 'PolicyDeclaration') {
      expect(policy.gateways.map((g) => g.name)).toEqual(['PickEncoder']);
    }
  });

  it('parses context relationship declaration', async () => {
    const doc = await parse(`
      context "Test" [Core]
        relationship Ordering -> Fulfillment
          type CustomerSupplier
          contract "Supplier provides order data"
    `);
    expect(doc.parseResult.parserErrors).toHaveLength(0);
    const member = doc.parseResult.value.contexts[0].members[0];
    expect(member.$type).toBe('ContextRelationshipDeclaration');
    if (member.$type === 'ContextRelationshipDeclaration') {
      expect(member.source).toBe('Ordering');
      expect(member.target).toBe('Fulfillment');
      expect(member.type).toBe('CustomerSupplier');
    }
  });
});

// ---------------------------------------------------------------------------
// MMNT-670 — Temporal Constructs: Flow, Lane, Frame, Node
// ---------------------------------------------------------------------------
describe('Moment Grammar > Temporal Constructs', () => {
  it('parses flow declaration with description', async () => {
    const doc = await parse(`
      flow "order-placed"
        description "Order triggers fulfillment"
        lane ordering "Ordering" [Core]
        moment "Step 1"
          ordering: PlaceOrder
    `);
    expect(doc.parseResult.parserErrors).toHaveLength(0);
    const flow = doc.parseResult.value.flows[0];
    expect(flow.name).toBe('order-placed');
    expect(flow.description).toBe('Order triggers fulfillment');
  });

  it('parses lane declaration with classification', async () => {
    const doc = await parse(`
      flow "test"
        lane ordering "Ordering" [Core]
        lane shipping "Shipping" [Supporting]
        moment "Step"
          ordering: DoSomething
    `);
    expect(doc.parseResult.parserErrors).toHaveLength(0);
    const flow = doc.parseResult.value.flows[0];
    expect(flow.lanes).toHaveLength(2);
    expect(flow.lanes[0].id).toBe('ordering');
    expect(flow.lanes[0].label).toBe('Ordering');
    expect(flow.lanes[0].classification?.value).toBe('Core');
    expect(flow.lanes[1].classification?.value).toBe('Supporting');
  });

  it('parses branch-lane declaration', async () => {
    const doc = await parse(`
      flow "test"
        lane main "Main" [Core]
        branch-lane errors "Errors" [Terminal]
        moment "Step"
          main: DoSomething
    `);
    expect(doc.parseResult.parserErrors).toHaveLength(0);
    const flow = doc.parseResult.value.flows[0];
    expect(flow.lanes).toHaveLength(2);
    expect(flow.lanes[1].isBranch).toBe(true);
    expect(flow.lanes[1].id).toBe('errors');
  });

  it('parses frame with node placements', async () => {
    const doc = await parse(`
      flow "test"
        lane ordering "Ordering" [Core]
        moment "Order submission"
          ordering: PlaceOrder
          ordering: OrderPlaced
    `);
    expect(doc.parseResult.parserErrors).toHaveLength(0);
    const flow = doc.parseResult.value.flows[0];
    expect(flow.moments).toHaveLength(1);
    expect(flow.moments[0].label).toBe('Order submission');
    expect(flow.moments[0].nodes).toHaveLength(2);
    expect(flow.moments[0].nodes[0].laneId).toBe('ordering');
    expect(flow.moments[0].nodes[0].nodeName).toBe('PlaceOrder');
  });

  it('parses node modifiers: multiplicity, optional, terminal', async () => {
    const doc = await parse(`
      flow "test"
        lane main "Main" [Core]
        moment "Modifiers"
          main: EventA (×3)
          main: EventB [optional]
          main: EventC [terminal]
    `);
    expect(doc.parseResult.parserErrors).toHaveLength(0);
    const nodes = doc.parseResult.value.flows[0].moments[0].nodes;
    expect(nodes).toHaveLength(3);
    expect(nodes[0].multiplicity?.count).toBe(3);
    expect(nodes[1].modifier?.type).toBe('optional');
    expect(nodes[2].modifier?.type).toBe('terminal');
  });

  // ---------------------------------------------------------------------------
  // MMNT-671 — Temporal Constructs: Connections + Schema Contracts
  // ---------------------------------------------------------------------------
  it('parses crosses-to with relationship type and contract block', async () => {
    const doc = await parse(`
      flow "test"
        lane ordering "Ordering" [Core]
        lane fulfillment "Fulfillment" [Supporting]
        moment "Crossing"
          ordering: OrderPlaced crosses-to fulfillment via CustomerSupplier
            contract
              orderId: UUID [required]
              items: OrderItem[]
    `);
    expect(doc.parseResult.parserErrors).toHaveLength(0);
    const node = doc.parseResult.value.flows[0].moments[0].nodes[0];
    expect(node.crossing).toBeDefined();
    expect(node.crossing!.targetLaneId).toBe('fulfillment');
    expect(node.crossing!.relationshipType).toBe('CustomerSupplier');
    expect(node.crossing!.fields).toHaveLength(2);
  });

  it('parses schema contract with required and optional fields', async () => {
    const doc = await parse(`
      flow "test"
        lane a "A" [Core]
        lane b "B" [Supporting]
        moment "Contract"
          a: Event crosses-to b via Partnership
            contract
              id: UUID [required]
              name: string
              items: Item[] [required]
    `);
    expect(doc.parseResult.parserErrors).toHaveLength(0);
    const fields = doc.parseResult.value.flows[0].moments[0].nodes[0].crossing!.fields;
    expect(fields).toHaveLength(3);
    expect(fields[0].required).toBe(true);
    expect(fields[1].required).toBeFalsy();
    expect(fields[2].type.isArray).toBe(true);
    expect(fields[2].required).toBe(true);
  });

  it('parses triggered-by connection', async () => {
    const doc = await parse(`
      flow "test"
        lane a "A" [Core]
        moment "Step"
          a: DoSomething
            triggered-by PriorEvent
    `);
    expect(doc.parseResult.parserErrors).toHaveLength(0);
    const node = doc.parseResult.value.flows[0].moments[0].nodes[0];
    expect(node.connections).toHaveLength(1);
    expect(node.connections[0].$type).toBe('TriggeredBy');
  });

  it('parses triggers connection', async () => {
    const doc = await parse(`
      flow "test"
        lane a "A" [Core]
        moment "Step"
          a: SomeEvent
            triggers DownstreamProcess
    `);
    expect(doc.parseResult.parserErrors).toHaveLength(0);
    const node = doc.parseResult.value.flows[0].moments[0].nodes[0];
    expect(node.connections).toHaveLength(1);
    expect(node.connections[0].$type).toBe('Triggers');
  });

  it('parses returns-to connection', async () => {
    const doc = await parse(`
      flow "test"
        lane a "A" [Core]
        moment "Step 1"
          a: First
        moment "Step 2"
          a: Second
            returns-to "Step 1"
    `);
    expect(doc.parseResult.parserErrors).toHaveLength(0);
    const node = doc.parseResult.value.flows[0].moments[1].nodes[0];
    expect(node.connections).toHaveLength(1);
    expect(node.connections[0].$type).toBe('ReturnsTo');
  });

  // ---------------------------------------------------------------------------
  // MMNT-672 — Temporal Constructs: Branch Frames + When Blocks
  // ---------------------------------------------------------------------------
  it('parses branch frame with when blocks', async () => {
    const doc = await parse(`
      flow "test"
        lane main "Main" [Core]
        lane errors "Errors" [Supporting]
        moment "Outcome" [branch]
          when success
            main: SuccessEvent
          when failure
            errors: FailureEvent [terminal]
    `);
    expect(doc.parseResult.parserErrors).toHaveLength(0);
    const frame = doc.parseResult.value.flows[0].moments[0];
    expect(frame.isBranch).toBe(true);
    expect(frame.whenBlocks).toHaveLength(2);
    expect(frame.whenBlocks[0].condition).toBe('success');
    expect(frame.whenBlocks[1].condition).toBe('failure');
  });

  it('parses multiple when conditions in branch frame', async () => {
    const doc = await parse(`
      flow "test"
        lane a "A" [Core]
        lane b "B" [Supporting]
        lane c "C" [Generic]
        moment "Three-way" [branch]
          when optionA
            a: EventA
          when optionB
            b: EventB
          when optionC
            c: EventC
    `);
    expect(doc.parseResult.parserErrors).toHaveLength(0);
    const frame = doc.parseResult.value.flows[0].moments[0];
    expect(frame.whenBlocks).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// MMNT-673 — Sample File Acceptance: Minimal + Multi-Context
// ---------------------------------------------------------------------------
describe('Moment Grammar > Sample File Acceptance', () => {
  it('parses minimal context file without errors', async () => {
    const input = readFixture('valid/minimal/contexts/ordering.moment');
    const doc = await parse(input);
    expect(doc.parseResult.lexerErrors).toHaveLength(0);
    expect(doc.parseResult.parserErrors).toHaveLength(0);
    expect(doc.parseResult.value.contexts).toHaveLength(1);
  });

  it('parses minimal flow file without errors', async () => {
    const input = readFixture('valid/minimal/flows/order-placed.moment');
    const doc = await parse(input);
    expect(doc.parseResult.lexerErrors).toHaveLength(0);
    expect(doc.parseResult.parserErrors).toHaveLength(0);
    expect(doc.parseResult.value.flows).toHaveLength(1);
  });

  it('parses multi-context ordering file without errors', async () => {
    const input = readFixture('valid/multi-context/contexts/ordering.moment');
    const doc = await parse(input);
    expect(doc.parseResult.lexerErrors).toHaveLength(0);
    expect(doc.parseResult.parserErrors).toHaveLength(0);
  });

  it('parses multi-context fulfillment file without errors', async () => {
    const input = readFixture('valid/multi-context/contexts/fulfillment.moment');
    const doc = await parse(input);
    expect(doc.parseResult.lexerErrors).toHaveLength(0);
    expect(doc.parseResult.parserErrors).toHaveLength(0);
  });

  it('parses multi-context shipping file without errors', async () => {
    const input = readFixture('valid/multi-context/contexts/shipping.moment');
    const doc = await parse(input);
    expect(doc.parseResult.lexerErrors).toHaveLength(0);
    expect(doc.parseResult.parserErrors).toHaveLength(0);
  });

  it('parses multi-context flow file without errors', async () => {
    const input = readFixture('valid/multi-context/flows/order-to-shipment.moment');
    const doc = await parse(input);
    expect(doc.parseResult.lexerErrors).toHaveLength(0);
    expect(doc.parseResult.parserErrors).toHaveLength(0);
    expect(doc.parseResult.value.flows).toHaveLength(1);
    expect(doc.parseResult.value.flows[0].lanes.length).toBeGreaterThanOrEqual(3);
    expect(doc.parseResult.value.flows[0].moments.length).toBeGreaterThanOrEqual(4);
  });
});

// ---------------------------------------------------------------------------
// ADR-027 — Unified File: Spatial + Temporal Coexistence
// ---------------------------------------------------------------------------
describe('Moment Grammar > Unified File (ADR-027)', () => {
  it('parses a file with both context and flow', async () => {
    const input = readFixture('valid/unified/ordering.moment');
    const doc = await parse(input);
    expect(doc.parseResult.lexerErrors).toHaveLength(0);
    expect(doc.parseResult.parserErrors).toHaveLength(0);

    const file = doc.parseResult.value;
    expect(file.contexts).toHaveLength(2);
    expect(file.flows).toHaveLength(1);

    expect(file.contexts[0].name).toBe('Ordering');
    expect(file.contexts[1].name).toBe('Fulfillment');
    expect(file.flows[0].name).toBe('order-placed');
  });

  it('parses multiple contexts in one file', async () => {
    const doc = await parse(`
      context "Alpha" [Core]
        aggregate "A"
          identity id: UUID

      context "Beta" [Supporting]
        aggregate "B"
          identity id: UUID
    `);
    expect(doc.parseResult.parserErrors).toHaveLength(0);
    expect(doc.parseResult.value.contexts).toHaveLength(2);
    expect(doc.parseResult.value.contexts[0].name).toBe('Alpha');
    expect(doc.parseResult.value.contexts[1].name).toBe('Beta');
    expect(doc.parseResult.value.flows).toHaveLength(0);
  });

  it('still parses context-only files (backward compat)', async () => {
    const doc = await parse(`
      context "Solo" [Core]
        aggregate "Thing"
          identity id: UUID
    `);
    expect(doc.parseResult.parserErrors).toHaveLength(0);
    expect(doc.parseResult.value.contexts).toHaveLength(1);
    expect(doc.parseResult.value.flows).toHaveLength(0);
  });

  it('still parses flow-only files (backward compat)', async () => {
    const input = readFixture('valid/minimal/flows/order-placed.moment');
    const doc = await parse(input);
    expect(doc.parseResult.parserErrors).toHaveLength(0);
    expect(doc.parseResult.value.contexts).toHaveLength(0);
    expect(doc.parseResult.value.flows).toHaveLength(1);
  });

  it('rejects empty files (no declarations)', async () => {
    const doc = await parse('');
    expect(doc.parseResult.parserErrors.length).toBeGreaterThan(0);
  });

  it('allows interleaved contexts and flows', async () => {
    const doc = await parse(`
      context "First" [Core]
        aggregate "A"
          identity id: UUID

      flow "middle-flow"
        lane a "First" [Core]
        moment "Step"
          a: SomeEvent crosses-to a via Partnership
            contract
              id: UUID [required]

      context "Second" [Supporting]
        aggregate "B"
          identity id: UUID
    `);
    expect(doc.parseResult.lexerErrors).toHaveLength(0);
    expect(doc.parseResult.parserErrors).toHaveLength(0);
    expect(doc.parseResult.value.contexts).toHaveLength(2);
    expect(doc.parseResult.value.flows).toHaveLength(1);
    expect(doc.parseResult.value.contexts[0].name).toBe('First');
    expect(doc.parseResult.value.contexts[1].name).toBe('Second');
  });
});

// ---------------------------------------------------------------------------
// MMNT-674 — Negative Parse Cases
// ---------------------------------------------------------------------------
describe('Moment Grammar > Negative Parse Cases', () => {
  it('rejects file without context or flow declaration', async () => {
    const input = readFixture('invalid/no-declaration.moment');
    const doc = await parse(input);
    const totalErrors = doc.parseResult.lexerErrors.length + doc.parseResult.parserErrors.length;
    expect(totalErrors).toBeGreaterThan(0);
  });

  it('rejects unknown modifier keyword', async () => {
    const input = readFixture('invalid/unknown-modifier.moment');
    const doc = await parse(input);
    const totalErrors = doc.parseResult.lexerErrors.length + doc.parseResult.parserErrors.length;
    expect(totalErrors).toBeGreaterThan(0);
  });

  it('produces diagnostics for syntax errors', async () => {
    const doc = await parse('this is not valid moment syntax');
    const totalErrors = doc.parseResult.lexerErrors.length + doc.parseResult.parserErrors.length;
    expect(totalErrors).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// MMNT-675 — Generated Output + Build Pipeline
// ---------------------------------------------------------------------------
describe('Moment Grammar > Generated Output', () => {
  it('ast.ts exists after generate', () => {
    expect(existsSync(resolve(GENERATED, 'ast.ts'))).toBe(true);
  });

  it('grammar.ts exists after generate', () => {
    expect(existsSync(resolve(GENERATED, 'grammar.ts'))).toBe(true);
  });

  it('module.ts exists after generate', () => {
    expect(existsSync(resolve(GENERATED, 'module.ts'))).toBe(true);
  });

  it('generated AST covers all 21 Langium constructs', () => {
    const astContent = readFileSync(resolve(GENERATED, 'ast.ts'), 'utf-8');
    // 10 spatial constructs
    expect(astContent).toContain('ContextDeclaration');
    expect(astContent).toContain('AggregateDeclaration');
    expect(astContent).toContain('CommandDeclaration');
    expect(astContent).toContain('DomainEventDeclaration');
    expect(astContent).toContain('ValueObjectDeclaration');
    expect(astContent).toContain('InvariantDeclaration');
    expect(astContent).toContain('DomainServiceDeclaration');
    expect(astContent).toContain('PolicyDeclaration');
    expect(astContent).toContain('SagaDeclaration');
    expect(astContent).toContain('ContextRelationshipDeclaration');
    // 11 temporal constructs
    expect(astContent).toContain('FlowDeclaration');
    expect(astContent).toContain('LaneDeclaration');
    expect(astContent).toContain('Moment');
    expect(astContent).toContain('NodePlacement');
    expect(astContent).toContain('ContextCrossing');
    expect(astContent).toContain('TriggeredBy');
    expect(astContent).toContain('Triggers');
    expect(astContent).toContain('ReturnsTo');
    expect(astContent).toContain('WhenBlock');
    expect(astContent).toContain('ContractField');
    expect(astContent).toContain('Multiplicity');
    // Schema contract as first-class grammar node (EXIT-C5)
    expect(astContent).toContain('interface ContractField');
  });
});

// ---------------------------------------------------------------------------
// ADR-040 — process events, causes, notes. The words `cause`, `causes` and `note` become keywords;
// fields, inputs and lanes that used them keep parsing.
// ---------------------------------------------------------------------------
describe('Moment Grammar > ADR-040', () => {
  const errorsOf = async (input: string): Promise<string[]> => {
    const doc = await parse(input);
    return [
      ...doc.parseResult.lexerErrors.map((e) => e.message),
      ...doc.parseResult.parserErrors.map((e) => e.message),
    ];
  };

  const PROCESS = (body: string): string => `
context "C" [Core]
  orchestration P
    command Go
${body}
    invoked-by Go
    issues Do
    states S
    compensation none
    timeout "none"
`;

  it('parses events between an orchestration command and invoked-by, with or without fields', async () => {
    expect(await errorsOf(PROCESS('    event Started\n      a: UUID\n    event Finished'))).toEqual(
      [],
    );
  });

  it('parses a field named invoked-by in a process event before the real invoked-by', async () => {
    expect(await errorsOf(PROCESS('    event Started\n      invoked-by: string'))).toEqual([]);
  });

  it('parses causes, a cause-scoped precondition and a placement cause', async () => {
    const src = `
context "C" [Core]
  aggregate "A"
    identity aId: UUID
    command Cancel
      causes Customer, Ticketing
      precondition Window cause Customer, Admin: "Ahead of time"
      emits Cancelled
    event Cancelled
      aId: UUID
flow "F"
  lane l "C" [Core]
  moment "M"
    l: Cancel cause Customer
`;
    expect(await errorsOf(src)).toEqual([]);
  });

  it('parses fields, inputs and lanes named cause or causes', async () => {
    const src = `
context "C" [Core]
  aggregate "A"
    identity cause: UUID
    command Do
      input cause: string, causes: string
      emits Done
    event Done
      cause: string
      causes: string
flow "F"
  lane cause "Cause" [Core]
  moment "M"
    cause: Foo
    cause: Bar cause Baz
    cause: Qux
`;
    expect(await errorsOf(src)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// ADR-041 — a command records one or more events
// ---------------------------------------------------------------------------
describe('ADR-041 D1 emits clause', () => {
  const AGGREGATE = (emits: string): string => `
context "C" [Core]
  aggregate "A"
    identity aId: UUID
    state initial Open
    state Open -> OneUseLeft on Use
    command Use
      emits Done
    command Do
      ${emits}
    event Done
      aId: UUID
`;

  async function outcomesOf(emits: string) {
    const doc = await parse(AGGREGATE(emits));
    expect(doc.parseResult.lexerErrors).toHaveLength(0);
    expect(doc.parseResult.parserErrors).toHaveLength(0);
    const agg = doc.parseResult.value.contexts[0].members[0];
    if (agg.$type !== 'AggregateDeclaration') throw new Error('expected an aggregate');
    const cmd = agg.members.find((m) => m.$type === 'CommandDeclaration' && m.name === 'Do');
    if (cmd?.$type !== 'CommandDeclaration') throw new Error('expected command Do');
    return cmd.emits.outcomes.map((o) => ({ events: [...o.events], state: o.state }));
  }

  it('parses the plain form as one outcome with one event and no guard', async () => {
    expect(await outcomesOf('emits A')).toEqual([{ events: ['A'], state: undefined }]);
  });

  it('parses `emits A, B` as one outcome of two events', async () => {
    expect(await outcomesOf('emits A, B')).toEqual([{ events: ['A', 'B'], state: undefined }]);
  });

  it('parses `emits A | B` as two outcomes, with or without spaces around the bar', async () => {
    const expected = [
      { events: ['A'], state: undefined },
      { events: ['B'], state: undefined },
    ];
    expect(await outcomesOf('emits A | B')).toEqual(expected);
    expect(await outcomesOf('emits A|B')).toEqual(expected);
  });

  it('binds `,` tighter than `|` and attaches `when` to the outcome it follows', async () => {
    expect(await outcomesOf('emits A, B when Open | C when OneUseLeft')).toEqual([
      { events: ['A', 'B'], state: 'Open' },
      { events: ['C'], state: 'OneUseLeft' },
    ]);
  });

  it('parses a clause that continues on the next line', async () => {
    expect(await outcomesOf('emits A when Open\n        | A, B when OneUseLeft')).toEqual([
      { events: ['A'], state: 'Open' },
      { events: ['A', 'B'], state: 'OneUseLeft' },
    ]);
  });

  it('requires an aggregate command to name at least one event', async () => {
    const doc = await parse(AGGREGATE('emits'));
    expect(doc.parseResult.parserErrors.length).toBeGreaterThan(0);
  });

  it('refuses a dangling `,` or `|`', async () => {
    expect((await parse(AGGREGATE('emits A,'))).parseResult.parserErrors.length).toBeGreaterThan(0);
    expect((await parse(AGGREGATE('emits A |'))).parseResult.parserErrors.length).toBeGreaterThan(
      0,
    );
  });

  const ORCHESTRATION = (command: string): string => `
context "C" [Core]
  aggregate "A"
    identity aId: UUID
    command Go
      emits Went
    event Went
      aId: UUID
  orchestration P
    ${command}
    event Started
      aId: UUID
    event Finished
      aId: UUID
    invoked-by Start
    issues Go
    states Running -> Done on Finish
    compensation none
    timeout window
`;

  it('lets an orchestration command take the same clause, or omit it', async () => {
    for (const clause of ['emits Started, Finished', 'emits Started | Finished', '']) {
      const doc = await parse(ORCHESTRATION(`command Start\n      ${clause}\n    command Finish`));
      expect(doc.parseResult.lexerErrors).toHaveLength(0);
      expect(doc.parseResult.parserErrors).toEqual([]);
    }
    const doc = await parse(
      ORCHESTRATION('command Start\n      emits Started, Finished\n    command Finish'),
    );
    const saga = doc.parseResult.value.contexts[0].members.find(
      (m) => m.$type === 'SagaDeclaration',
    );
    if (saga?.$type !== 'SagaDeclaration') throw new Error('expected a saga');
    expect(saga.commands[0].emits?.outcomes[0].events).toEqual(['Started', 'Finished']);
    expect(saga.commands[1].emits).toBeUndefined();
  });

  it('leaves `when` out of the words a field may be named, as before the clause existed', async () => {
    const doc = await parse(`
context "C" [Core]
  aggregate "A"
    identity aId: UUID
    command Do
      emits Done
    event Done
      when: DateTime
      aId: UUID
`);
    expect(doc.parseResult.parserErrors.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// ADR-043 — `[outcome]` is a second exit modifier; the word stays usable as a field, lane or input name
// ---------------------------------------------------------------------------
describe('ADR-043 D1 exit modifier', () => {
  const errorsOf = async (input: string): Promise<string[]> => {
    const doc = await parse(input);
    return [
      ...doc.parseResult.lexerErrors.map((e) => e.message),
      ...doc.parseResult.parserErrors.map((e) => e.message),
    ];
  };

  const FLOW = (placement: string): string => `
flow "F"
  lane l "L" [Core]
  moment "M" [branch]
    when a
      l: First
      ${placement}
    when b
      l: Other
`;

  it('parses [outcome] on a placement in an arm', async () => {
    const src = FLOW('l: Done [outcome]');
    expect(await errorsOf(src)).toEqual([]);
    const doc = await parse(src);
    const arm = doc.parseResult.value.flows[0].moments[0].whenBlocks[0];
    expect(arm.nodes[1].modifier?.type).toBe('outcome');
  });

  it('leaves [terminal] and [optional] as they were', async () => {
    for (const modifier of ['terminal', 'optional']) {
      const src = FLOW(`l: Done [${modifier}]`);
      expect(await errorsOf(src)).toEqual([]);
      const doc = await parse(src);
      expect(doc.parseResult.value.flows[0].moments[0].whenBlocks[0].nodes[1].modifier?.type).toBe(
        modifier,
      );
    }
  });

  it('still rejects an unknown modifier', async () => {
    expect((await errorsOf(FLOW('l: Done [result]'))).length).toBeGreaterThan(0);
  });

  it('parses a field, a lane and an input named outcome', async () => {
    const src = `
context "C" [Core]
  aggregate "A"
    identity outcome: UUID
    command Do
      input outcome: string, other: string
      emits Done
    event Done
      outcome: string
flow "F"
  lane outcome "Outcome" [Core]
  moment "M"
    outcome: Foo
    outcome: Bar
`;
    expect(await errorsOf(src)).toEqual([]);
  });
});
