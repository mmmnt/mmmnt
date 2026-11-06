import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { readdirSync } from 'node:fs';
import { ProjectLoader } from '@mmmnt/core';
import {
  TopologyEmitter,
  deriveNegativeScenarios,
  generateAllScenarios,
  generateEventCatalog,
  generateImpactAnalysis,
} from '../../index.js';

const VALID = resolve(import.meta.dirname, '../../../../../fixtures/valid/multi-event-commands');
const filesOf = (dir: string): string[] =>
  readdirSync(resolve(VALID, dir))
    .sort()
    .map((f) => resolve(VALID, dir, f));

async function load() {
  const { ir } = await new ProjectLoader().loadProject([
    ...filesOf('contexts'),
    ...filesOf('flows'),
  ]);
  return ir;
}

describe('ADR-041 fixtures/valid/multi-event-commands derives end to end', () => {
  it('derives a scenario per alternative of every flow, each showing one outcome', async () => {
    const ir = await load();
    const billing = ir.flows.find((f) => f.name === 'Billing')!;
    const scenarios = generateAllScenarios(ir, billing);
    expect(scenarios).toHaveLength(4);
    const settles = scenarios.map((s) =>
      s.events
        .map((e) => e.eventType)
        .filter((t) => t.startsWith('InvoiceS') || t.startsWith('InvoiceP')),
    );
    expect(settles.flat().sort()).toEqual([
      'InvoicePartlySettled',
      'InvoicePartlySettled',
      'InvoiceSettled',
      'InvoiceSettled',
    ]);
    const issued = scenarios[0].events.slice(0, 3).map((e) => e.eventType);
    expect(issued).toEqual(['SimProcess.IssueInvoice', 'InvoiceIssued', 'InvoiceNumbered']);
  });

  it('records the process events of an orchestration command together, as a sibling pair', async () => {
    const ir = await load();
    const billing = ir.flows.find((f) => f.name === 'Billing')!;
    const events = generateAllScenarios(ir, billing)[0].events;
    const at = events.findIndex((e) => e.eventType === 'SimProcess.StartRun');
    expect(events.slice(at, at + 3).map((e) => e.eventType)).toEqual([
      'SimProcess.StartRun',
      'RunStarted',
      'RunLogged',
    ]);
    expect(events[at + 2].causationEventIds).toEqual([events[at].eventId]);
  });

  it('names the guard state on the scenarios that reach a guarded outcome', async () => {
    const ir = await load();
    const voidFlow = ir.flows.find((f) => f.name === 'Void')!;
    const [draft, issued] = generateAllScenarios(ir, voidFlow);
    expect(draft.when).toContain('VoidInvoice is invoked while Invoice is Draft');
    expect(issued.when).toContain('VoidInvoice is invoked while Invoice is Issued');
  });

  it('derives a rejection with no event of any outcome', async () => {
    const ir = await load();
    const billing = ir.flows.find((f) => f.name === 'Billing')!;
    const rejected = deriveNegativeScenarios(ir, billing).find((s) =>
      s.scenarioId.endsWith('neg-IssueInvoice-hasLines'),
    );
    expect(rejected?.events.map((e) => e.eventType)).toEqual([
      'SimProcess.IssueInvoice',
      'SimFailure.IssueInvoice.PreconditionViolation',
    ]);
  });

  it('catalogs and links every event, and adds no relationship to the topology', async () => {
    const ir = await load();
    const catalog = generateEventCatalog(ir).events;
    expect(catalog.find((e) => e.eventName === 'InvoiceNumbered')?.producer).toMatchObject({
      command: 'IssueInvoice',
      recordedWith: ['InvoiceIssued'],
    });
    expect(catalog.find((e) => e.eventName === 'RunLogged')?.producer).toMatchObject({
      process: 'CollectionRun',
      command: 'StartRun',
    });
    const impact = generateImpactAnalysis(ir).nodes;
    expect(impact.find((n) => n.name === 'IssueInvoice')?.triggers).toEqual(
      expect.arrayContaining(['event:Billing:InvoiceIssued', 'event:Billing:InvoiceNumbered']),
    );
    const topology = new TopologyEmitter().emit(ir, ir.flows[0]);
    expect(topology.frames.length).toBeGreaterThan(0);
  });
});
