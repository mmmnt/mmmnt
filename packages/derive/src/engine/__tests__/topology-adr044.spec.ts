import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { MomentParser, type IntermediateRepresentation } from '@mmmnt/core';
import { TopologyEmitter, generateAllScenarios } from '../../index.js';

// ADR-044: a topology connection declared inside a `when` arm carries that arm as `branchCondition`.

const TICKETWAVE = resolve(import.meta.dirname, '../../../../../examples/ticketwave/spec');
const SAMMI = process.env.MOMENT_SAMMI_MODEL;

async function parse(source: string, file?: string): Promise<IntermediateRepresentation> {
  const result = await new MomentParser().parseContent(source, file);
  if (!result.success || !result.ir) {
    throw new Error(result.diagnostics.map((d) => d.message).join('; '));
  }
  return result.ir;
}

const ticketwaveSource = (): string => readFileSync(join(TICKETWAVE, 'ticketwave.moment'), 'utf-8');

// A scratch flow in TicketWave's idiom with one connection of every type inside an arm, one in the
// moment's main body of a [branch] moment, and one in a plain moment.
const SCRATCH = `
flow "arm-connections"
  lane inventory "Inventory" [Core]
  lane checkout "Checkout" [Core]

  moment "Start"
    inventory: RequestHold
    inventory: SeatsHeld
    checkout: CreateCart
      triggered-by SeatsHeld
    checkout: CartCreated

  moment "Decision" [branch]
    checkout: AddTicketsToCart
      triggered-by CartCreated
    checkout: TicketsAddedToCart
    when go
      checkout: CalculateFees
        triggered-by TicketsAddedToCart
      checkout: FeesCalculated
        triggers InitiatePayment
      checkout: InitiatePayment
      checkout: PaymentInitiated crosses-to inventory via CustomerSupplier
        contract
          holdId: UUID [required]
      checkout: ConfirmPayment
        returns-to "Start"
    when stop
      checkout: ConfirmPayment
`;

async function scratchTopology() {
  const ir = await parse(ticketwaveSource() + SCRATCH);
  const flow = ir.flows.find((f) => f.name === 'arm-connections')!;
  return { ir, flow, topology: new TopologyEmitter().emit(ir, flow) };
}

describe('ADR-044 D1 topology connections carry their arm', () => {
  it('emits the arm a connection is declared in', async () => {
    const { topology } = await scratchTopology();
    const calc = topology.connections.find(
      (c) => c.eventType === 'TicketsAddedToCart' && c.targetNodeName === 'CalculateFees',
    );
    expect(calc?.branchCondition).toBe('go');
  });

  it('emits it on every connection type declared in an arm', async () => {
    const { topology } = await scratchTopology();
    const byType = (style: string) => topology.connections.filter((c) => c.style === style);
    const inArm = topology.connections.filter((c) => c.branchCondition === 'go');
    const kinds = new Set(inArm.map((c) => (c.crossBoundary ? 'crosses-to' : c.style)));
    expect(byType('return').length).toBeGreaterThan(0);
    expect(inArm.some((c) => c.style === 'return')).toBe(true);
    expect(inArm.some((c) => c.crossBoundary)).toBe(true);
    expect(inArm.some((c) => c.sourceNodeName === 'FeesCalculated')).toBe(true); // triggers
    expect(inArm.some((c) => c.targetNodeName === 'CalculateFees')).toBe(true); // triggered-by
    expect(kinds.size).toBeGreaterThanOrEqual(3);
  });

  it('emits no field for a connection outside an arm, in a plain moment or a branch moment body', async () => {
    const { topology } = await scratchTopology();
    const outside = topology.connections.filter(
      (c) =>
        (c.eventType === 'SeatsHeld' && c.targetNodeName === 'CreateCart') ||
        (c.eventType === 'CartCreated' && c.targetNodeName === 'AddTicketsToCart'),
    );
    expect(outside).toHaveLength(2);
    for (const c of outside) {
      expect('branchCondition' in c).toBe(false);
      expect(JSON.stringify(c)).not.toContain('branchCondition');
    }
  });

  it('uses the arm condition as the key branchPredicates routes and activeBranches use', async () => {
    const { ir, flow, topology } = await scratchTopology();
    const frameRoutes = Object.values(topology.branchPredicates).flatMap((p) =>
      Object.keys(p.routes),
    );
    const activeConditions = generateAllScenarios(ir, flow).flatMap((s) =>
      s.activeBranches.map((b) => b.condition),
    );
    const armConditions = topology.connections
      .map((c) => c.branchCondition)
      .filter((c): c is string => c !== undefined);
    expect(armConditions.length).toBeGreaterThan(0);
    for (const condition of armConditions) {
      expect(frameRoutes).toContain(condition);
      expect(activeConditions).toContain(condition);
    }
  });
});

describe('ADR-044 TicketWave: payment-settlement says which arm declared which conversion', () => {
  it('gives the two ConvertHoldToReservation connections their own arms', async () => {
    const ir = await parse(ticketwaveSource(), join(TICKETWAVE, 'ticketwave.moment'));
    const flow = ir.flows.find((f) => f.name === 'payment-settlement')!;
    const topology = new TopologyEmitter().emit(ir, flow);
    const conversions = topology.connections.filter(
      (c) => c.targetNodeName === 'ConvertHoldToReservation',
    );
    expect(conversions.map((c) => [c.eventType, c.branchCondition])).toEqual([
      ['PaymentConfirmed', 'approved'],
      ['SeatsHeld', 'approved-after-rehold'],
    ]);
  });
});

describe('ADR-044 reachability sweep: the IR arm is the topology arm, for every connection', () => {
  const sweep = async (source: string, file?: string) => {
    const ir = await parse(source, file);
    const mismatches: string[] = [];
    let total = 0;
    let armed = 0;
    for (const flow of ir.flows) {
      const topology = new TopologyEmitter().emit(ir, flow);
      expect(topology.connections).toHaveLength(flow.connections.length);
      flow.connections.forEach((conn, i) => {
        total++;
        if (conn.branchCondition !== undefined) armed++;
        if (topology.connections[i].branchCondition !== conn.branchCondition)
          mismatches.push(`${flow.name} ${conn.id}`);
      });
    }
    return { mismatches, total, armed };
  };

  it('holds on TicketWave', async () => {
    const { mismatches, armed } = await sweep(
      ticketwaveSource(),
      join(TICKETWAVE, 'ticketwave.moment'),
    );
    expect(armed).toBeGreaterThan(0);
    expect(mismatches).toEqual([]);
  });

  it.runIf(SAMMI)('holds on SAMMI', async () => {
    const dir = join(SAMMI!, 'flows');
    const contexts = join(SAMMI!, 'contexts');
    const source = [
      ...readdirSync(contexts).map((f) => join(contexts, f)),
      ...readdirSync(dir).map((f) => join(dir, f)),
    ]
      .map((f) => readFileSync(f, 'utf-8'))
      .join('\n');
    const { mismatches, armed } = await sweep(source);
    expect(armed).toBeGreaterThan(0);
    expect(mismatches).toEqual([]);
  });
});
