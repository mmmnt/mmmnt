/**
 * MMNT-26 Moment Grammar — Verification Tests
 *
 * Tests verify that the moment.langium grammar correctly parses all 21
 * Langium constructs (10 spatial + 11 temporal) and rejects invalid syntax.
 *
 * Xray Test issues: MMNT-668–675
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
        expect(cmd.emits).toBe('OrderPlaced');
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

  it('parses saga with trigger, states, compensation, timeout', async () => {
    const doc = await parse(`
      context "Test" [Core]
        saga OrderFulfillment
          trigger PlaceOrder
          states Pending -> Reserved -> Shipped -> Complete
          compensation "Cancel reservation and refund"
          timeout "none"
    `);
    expect(doc.parseResult.parserErrors).toHaveLength(0);
    const member = doc.parseResult.value.contexts[0].members[0];
    expect(member.$type).toBe('SagaDeclaration');
    if (member.$type === 'SagaDeclaration') {
      expect(member.name).toBe('OrderFulfillment');
      expect(member.states).toHaveLength(4);
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
        frame "Step 1"
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
        frame "Step"
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
        frame "Step"
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
        frame "Order submission"
          ordering: PlaceOrder
          ordering: OrderPlaced
    `);
    expect(doc.parseResult.parserErrors).toHaveLength(0);
    const flow = doc.parseResult.value.flows[0];
    expect(flow.frames).toHaveLength(1);
    expect(flow.frames[0].label).toBe('Order submission');
    expect(flow.frames[0].nodes).toHaveLength(2);
    expect(flow.frames[0].nodes[0].laneId).toBe('ordering');
    expect(flow.frames[0].nodes[0].nodeName).toBe('PlaceOrder');
  });

  it('parses node modifiers: multiplicity, optional, terminal', async () => {
    const doc = await parse(`
      flow "test"
        lane main "Main" [Core]
        frame "Modifiers"
          main: EventA (×3)
          main: EventB [optional]
          main: EventC [terminal]
    `);
    expect(doc.parseResult.parserErrors).toHaveLength(0);
    const nodes = doc.parseResult.value.flows[0].frames[0].nodes;
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
        frame "Crossing"
          ordering: OrderPlaced crosses-to fulfillment via CustomerSupplier
            contract
              orderId: UUID [required]
              items: OrderItem[]
    `);
    expect(doc.parseResult.parserErrors).toHaveLength(0);
    const node = doc.parseResult.value.flows[0].frames[0].nodes[0];
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
        frame "Contract"
          a: Event crosses-to b via Partnership
            contract
              id: UUID [required]
              name: string
              items: Item[] [required]
    `);
    expect(doc.parseResult.parserErrors).toHaveLength(0);
    const fields = doc.parseResult.value.flows[0].frames[0].nodes[0].crossing!.fields;
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
        frame "Step"
          a: DoSomething
            triggered-by PriorEvent
    `);
    expect(doc.parseResult.parserErrors).toHaveLength(0);
    const node = doc.parseResult.value.flows[0].frames[0].nodes[0];
    expect(node.connections).toHaveLength(1);
    expect(node.connections[0].$type).toBe('TriggeredBy');
  });

  it('parses triggers connection', async () => {
    const doc = await parse(`
      flow "test"
        lane a "A" [Core]
        frame "Step"
          a: SomeEvent
            triggers DownstreamProcess
    `);
    expect(doc.parseResult.parserErrors).toHaveLength(0);
    const node = doc.parseResult.value.flows[0].frames[0].nodes[0];
    expect(node.connections).toHaveLength(1);
    expect(node.connections[0].$type).toBe('Triggers');
  });

  it('parses returns-to connection', async () => {
    const doc = await parse(`
      flow "test"
        lane a "A" [Core]
        frame "Step 1"
          a: First
        frame "Step 2"
          a: Second
            returns-to "Step 1"
    `);
    expect(doc.parseResult.parserErrors).toHaveLength(0);
    const node = doc.parseResult.value.flows[0].frames[1].nodes[0];
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
        frame "Outcome" [branch]
          when success
            main: SuccessEvent
          when failure
            errors: FailureEvent [terminal]
    `);
    expect(doc.parseResult.parserErrors).toHaveLength(0);
    const frame = doc.parseResult.value.flows[0].frames[0];
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
        frame "Three-way" [branch]
          when optionA
            a: EventA
          when optionB
            b: EventB
          when optionC
            c: EventC
    `);
    expect(doc.parseResult.parserErrors).toHaveLength(0);
    const frame = doc.parseResult.value.flows[0].frames[0];
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
    expect(doc.parseResult.value.flows[0].frames.length).toBeGreaterThanOrEqual(4);
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
        frame "Step"
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
    expect(astContent).toContain('Frame');
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
