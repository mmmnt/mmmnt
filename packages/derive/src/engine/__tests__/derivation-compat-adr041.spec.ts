import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { MomentParser, type IntermediateRepresentation } from '@mmmnt/core';
import {
  TopologyEmitter,
  deriveNegativeScenarios,
  deriveTimeoutScenarios,
  generateAllScenarios,
  generateEventCatalog,
  generateImpactAnalysis,
  generatePolicyDefinitions,
  generateSagaStateMachines,
} from '../../index.js';

// ADR-041 compat proof, items 2 and 4: the committed ticketwave facet files are what the derivations
// write for the committed spec, so no derived artifact drifts from the model without a visible diff.

const EXAMPLE = resolve(import.meta.dirname, '../../../../../examples/ticketwave');
const FACET = join(EXAMPLE, 'facet');

const kebab = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
const committed = (file: string): unknown => JSON.parse(readFileSync(join(FACET, file), 'utf-8'));
const roundTrip = (value: unknown): unknown => JSON.parse(JSON.stringify(value));
/** Derivations stamp the moment they ran; the files hold the moment `moment simulate` ran. */
const withoutStamp = (value: unknown): unknown => {
  const copy = roundTrip(value) as { metadata?: Record<string, unknown> };
  if (copy.metadata) delete copy.metadata.generatedAt;
  return copy;
};

async function loadTicketwave(): Promise<IntermediateRepresentation> {
  const file = join(EXAMPLE, 'spec/ticketwave.moment');
  const result = await new MomentParser().parseContent(readFileSync(file, 'utf-8'), file);
  if (!result.success || !result.ir) throw new Error('ticketwave did not parse');
  return result.ir;
}

describe('ADR-041 derivation compat: examples/ticketwave/facet is the derivation of the spec', () => {
  it('holds every scenario the derivations write, byte for byte, and no other', async () => {
    const ir = await loadTicketwave();
    const expected = new Map<string, unknown>();
    for (const flow of ir.flows) {
      for (const s of [
        ...generateAllScenarios(ir, flow),
        ...deriveNegativeScenarios(ir, flow),
        ...deriveTimeoutScenarios(ir, flow),
      ])
        expected.set(`${s.scenarioId}.json`, roundTrip(s));
    }
    const files = readdirSync(FACET).filter((f) => f.startsWith('scenario-'));
    expect(files.sort()).toEqual([...expected.keys()].sort());
    for (const [file, scenario] of expected) expect(committed(file), file).toEqual(scenario);
  });

  it('holds the topology of every flow', async () => {
    const ir = await loadTicketwave();
    for (const flow of ir.flows) {
      const file = `topology-${kebab(flow.name)}.json`;
      expect(withoutStamp(committed(file)), file).toEqual(
        withoutStamp(new TopologyEmitter().emit(ir, flow)),
      );
    }
  });

  it('holds the event catalog, impact analysis, saga state machines and policy definitions', async () => {
    const ir = await loadTicketwave();
    const artifacts: [string, unknown][] = [
      ['event-catalog.json', generateEventCatalog(ir)],
      ['impact-analysis.json', generateImpactAnalysis(ir)],
      ['saga-state-machines.json', generateSagaStateMachines(ir)],
      ['policy-definitions.json', generatePolicyDefinitions(ir)],
    ];
    for (const [file, value] of artifacts)
      expect(withoutStamp(committed(file)), file).toEqual(withoutStamp(value));
  });

  it('lists the recorded-together and alternative events in the committed catalog', () => {
    const catalog = committed('event-catalog.json') as {
      events: { eventName: string; producer: Record<string, unknown> }[];
    };
    const producer = (name: string) => catalog.events.find((e) => e.eventName === name)?.producer;
    expect(producer('HoldClosed')).toMatchObject({
      aggregate: 'SeatHold',
      command: 'ConvertHoldToReservation',
      recordedWith: ['HoldConvertedToReservation'],
    });
    expect(producer('AccessCodeExhausted')).toMatchObject({
      command: 'RedeemAccessCode',
      recordedWith: ['AccessCodeRedeemed'],
      alternativeTo: ['AccessCodeRedeemed'],
    });
  });
});
