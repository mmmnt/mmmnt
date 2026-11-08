import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { MomentParser, type IntermediateRepresentation } from '@mmmnt/core';
import { deriveNegativeScenarios } from '../simulation-scenario-generator.js';

// ADR-042: negative scenarios are derived for every path of a flow, one per (command, precondition,
// cause) not already covered. The first-arm path is derived exactly as before.

const TICKETWAVE = resolve(import.meta.dirname, '../../../../../examples/ticketwave/spec');
const SAMMI = process.env.MOMENT_SAMMI_MODEL;

async function load(source: string, file?: string): Promise<IntermediateRepresentation> {
  const result = await new MomentParser().parseContent(source, file);
  if (!result.success || !result.ir) {
    throw new Error(result.diagnostics.map((d) => d.message).join('; '));
  }
  return result.ir;
}

const ORDERING = `
context "Ordering" [Core]
  aggregate "Order"
    identity orderId: UUID
    command Place
      precondition placeable: "The order can be placed"
      emits Placed
    command Approve
      precondition approvable: "The order is pending"
      emits Approved
    command Decline
      precondition declinable: "The order is pending"
      precondition notShipped: "The order has not shipped"
      emits Declined
    command Cancel
      causes Customer, Fraud
      precondition notClosed: "The order is open"
      precondition withinWindow cause Customer: "The customer cancels in time"
      emits Cancelled
    event Placed
      orderId: UUID
    event Approved
      orderId: UUID
    event Declined
      orderId: UUID
    event Cancelled
      orderId: UUID
`;

const FLOW = (decide: string): string => `${ORDERING}
flow "Decision"
  lane o "Ordering" [Core]
  moment "Placement"
    o: Place
    o: Placed
  moment "Decide" [branch]
${decide}
`;

const ids = (list: { scenarioId: string }[]): string[] => list.map((s) => s.scenarioId);

describe('ADR-042 D1 a command only in a later arm gets its negatives', () => {
  const decide = `    when approved
      o: Approve
      o: Approved
    when declined
      o: Decline
      o: Declined [terminal]`;

  it('derives one negative per precondition of a command placed only in the second arm', async () => {
    const ir = await load(FLOW(decide));
    const negatives = deriveNegativeScenarios(ir, ir.flows[0]);
    const declined = negatives.filter((s) => s.scenarioId.includes('-neg-Decline-'));
    expect(declined.map((s) => s.scenarioId.replace(/^.*-neg-/, ''))).toEqual([
      'Decline-declinable',
      'Decline-notShipped',
    ]);
    for (const scenario of declined) {
      expect(scenario.kind).toBe('negative');
      expect(scenario.activeBranches).toEqual([
        { momentName: 'Decide', condition: 'declined', routeChosen: 'declined' },
      ]);
      expect(scenario.expectedPath.at(-1)).toContain('Decline');
      expect(scenario.events.at(-1)?.eventType).toMatch(
        /^SimFailure\.Decline\.PreconditionViolation/,
      );
    }
  });

  it('keeps the first-arm negatives first, byte for byte, in the same order', async () => {
    const ir = await load(FLOW(decide));
    const baseline = deriveNegativeScenarios(ir, ir.flows[0], { branchSelections: {} });
    const all = deriveNegativeScenarios(ir, ir.flows[0]);
    expect(baseline.length).toBeGreaterThan(0);
    expect(all.length).toBeGreaterThan(baseline.length);
    expect(JSON.stringify(all.slice(0, baseline.length))).toBe(JSON.stringify(baseline));
  });

  it('adds only what a later path reaches and nothing else', async () => {
    const ir = await load(FLOW(decide));
    const baseline = ids(deriveNegativeScenarios(ir, ir.flows[0], { branchSelections: {} }));
    const added = ids(deriveNegativeScenarios(ir, ir.flows[0])).filter(
      (id) => !baseline.includes(id),
    );
    expect(added.map((id) => id.replace(/^.*-neg-/, ''))).toEqual([
      'Decline-declinable',
      'Decline-notShipped',
    ]);
  });
});

describe('ADR-042 D4 the coverage key is the triple, not the placement', () => {
  it('adds nothing for a command placed in the first arm and again in a later arm', async () => {
    const ir = await load(
      FLOW(`    when approved
      o: Approve
      o: Approved
    when declined
      o: Approve
      o: Approved
      o: Decline
      o: Declined [terminal]`),
    );
    const approve = ids(deriveNegativeScenarios(ir, ir.flows[0])).filter((id) =>
      id.includes('-neg-Approve-'),
    );
    expect(approve).toHaveLength(1);
  });

  it('adds the pair a second cause reaches and keeps ids collision-free', async () => {
    const ir = await load(
      FLOW(`    when approved
      o: Cancel cause Customer
      o: Cancelled
    when declined
      o: Cancel cause Fraud
      o: Cancelled [terminal]`),
    );
    const all = deriveNegativeScenarios(ir, ir.flows[0]);
    const cancels = all.filter((s) => s.scenarioId.includes('-neg-Cancel-'));
    // Customer: notClosed + withinWindow (first arm). Fraud: notClosed only (withinWindow is scoped
    // to Customer), a pair the first arm did not cover.
    expect(cancels.map((s) => s.when)).toEqual([
      'Cancel is invoked for Customer without satisfying notClosed',
      'Cancel is invoked for Customer without satisfying withinWindow',
      'Cancel is invoked for Fraud without satisfying notClosed',
    ]);
    expect(new Set(ids(all)).size).toBe(all.length);
  });
});

describe('ADR-042 D2 an explicit selection keeps today meaning', () => {
  it('walks only the selected path', async () => {
    const ir = await load(
      FLOW(`    when approved
      o: Approve
      o: Approved
    when declined
      o: Decline
      o: Declined [terminal]`),
    );
    const selected = ids(
      deriveNegativeScenarios(ir, ir.flows[0], { branchSelections: { Decide: 'declined' } }),
    ).map((id) => id.replace(/^.*-neg-/, ''));
    expect(selected).toEqual(['Place-placeable', 'Decline-declinable', 'Decline-notShipped']);
  });
});

describe('ADR-042 TicketWave: every refusal an arm issues is reached', () => {
  it('reaches FailPayment, DeclineTransfer, CancelTransfer and JoinWaitlist', async () => {
    const file = join(TICKETWAVE, 'ticketwave.moment');
    const ir = await load(readFileSync(file, 'utf-8'), file);
    const all = ir.flows.flatMap((f) => ids(deriveNegativeScenarios(ir, f)));
    for (const expected of [
      'neg-FailPayment-paymentPending',
      'neg-DeclineTransfer-transferPending',
      'neg-CancelTransfer-transferPending',
      'neg-JoinWaitlist-notAlreadyOnWaitlist',
    ]) {
      expect(
        all.filter((id) => id.endsWith(expected)),
        expected,
      ).toHaveLength(1);
    }
  });
});

interface Command {
  name: string;
  preconditions: { name: string; causes?: string[] }[];
}

/** Every command a context declares, found structurally so the sweep does not share the generator's lookup. */
function commandsOf(value: unknown, found: Command[] = []): Command[] {
  if (Array.isArray(value)) value.forEach((v) => commandsOf(v, found));
  else if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof record.name === 'string' && Array.isArray(record.preconditions))
      found.push(record as unknown as Command);
    Object.values(record).forEach((v) => commandsOf(v, found));
  }
  return found;
}

/** The `when` text of every (placed command, applicable precondition, cause) of a flow. */
function expectedRefusals(
  ir: IntermediateRepresentation,
  flow: IntermediateRepresentation['flows'][number],
): string[] {
  const placements = flow.moments.flatMap((m) => [
    ...m.contextEntries,
    ...(m.branches ?? []).flatMap((b) => b.entries),
  ]);
  return placements.flatMap((entry) => {
    const ctx = ir.contexts.find((c) => c.id === entry.contextId);
    const command = commandsOf(ctx).find((c) => c.name === entry.nodeName);
    const forCause = entry.cause !== undefined ? ` for ${entry.cause}` : '';
    return (command?.preconditions ?? [])
      .filter((pre) => !pre.causes?.length || (entry.cause && pre.causes.includes(entry.cause)))
      .map((pre) => `${entry.nodeName} is invoked${forCause} without satisfying ${pre.name}`);
  });
}

/** Reachability sweep: every (command, precondition, cause) of every placed command has a negative. */
function sweep(ir: IntermediateRepresentation): { orphans: string[]; triples: number } {
  const orphans: string[] = [];
  let triples = 0;
  for (const flow of ir.flows) {
    const negatives = deriveNegativeScenarios(ir, flow).map((s) => s.when);
    for (const when of expectedRefusals(ir, flow)) {
      triples++;
      if (!negatives.includes(when)) orphans.push(`${flow.name}: ${when}`);
    }
  }
  return { orphans, triples };
}

describe('ADR-042 reachability sweep', () => {
  it('reaches every declared refusal of every placed command in TicketWave', async () => {
    const file = join(TICKETWAVE, 'ticketwave.moment');
    const ir = await load(readFileSync(file, 'utf-8'), file);
    const { orphans, triples } = sweep(ir);
    expect(triples).toBeGreaterThan(0);
    expect(orphans).toEqual([]);
  });

  it.runIf(SAMMI)('reaches every declared refusal of every placed command in SAMMI', async () => {
    const read = (dir: string) =>
      readdirSync(join(SAMMI!, dir)).map((f) => readFileSync(join(SAMMI!, dir, f), 'utf-8'));
    const ir = await load([...read('contexts'), ...read('flows')].join('\n'));
    const { orphans } = sweep(ir);
    expect(orphans).toEqual([]);
  });
});
