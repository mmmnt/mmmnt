import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { readdirSync } from 'node:fs';
import { ProjectLoader } from '../../src/project/index.js';
import { MomentParser } from '../../src/parser/moment-parser.js';
import { emittedEvents, emitOutcomes } from '../../src/index.js';

const FIXTURES = resolve(import.meta.dirname, '../../../../fixtures');
const VALID = resolve(FIXTURES, 'valid/multi-event-commands');

const filesOf = (dir: string): string[] =>
  readdirSync(resolve(VALID, dir))
    .sort()
    .map((f) => resolve(VALID, dir, f));
const project = [...filesOf('contexts'), ...filesOf('flows')];

describe('ADR-041 valid corpus: multi-event-commands', () => {
  it('loads as a project with no error, and one advisory: the unguarded alternatives of SettleInvoice', async () => {
    const result = await new ProjectLoader().loadProject(project);
    expect(result.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(result.success).toBe(true);
    expect(result.diagnostics.map((d) => [d.severity, d.ruleId])).toEqual([['warning', 'V46']]);
    expect(result.diagnostics[0].message).toContain("'SettleInvoice'");
  });

  describe('reachability sweep: every construct is reached from the corpus', () => {
    const load = async () => (await new ProjectLoader().loadProject(project)).ir;
    const commands = async () => {
      const billing = (await load()).contexts[0];
      return new Map(
        [
          ...billing.aggregates.flatMap((a) => a.commands),
          ...billing.sagas.flatMap((s) => s.commands ?? []),
        ].map((c) => [c.name, c]),
      );
    };

    it('reaches events recorded together, on an aggregate and on an orchestration', async () => {
      const all = await commands();
      expect(emitOutcomes(all.get('IssueInvoice')!)).toEqual([
        { events: ['InvoiceIssued', 'InvoiceNumbered'] },
      ]);
      expect(emitOutcomes(all.get('StartRun')!)).toEqual([{ events: ['RunStarted', 'RunLogged'] }]);
    });

    it('reaches alternative outcomes without a guard', async () => {
      expect(emitOutcomes((await commands()).get('SettleInvoice')!)).toEqual([
        { events: ['InvoiceSettled'] },
        { events: ['InvoicePartlySettled'] },
      ]);
    });

    it('reaches a guard on an aggregate command, with the two shapes in one clause', async () => {
      expect(emitOutcomes((await commands()).get('VoidInvoice')!)).toEqual([
        { events: ['InvoiceVoided'], whenState: 'Draft' },
        { events: ['InvoiceVoided', 'CreditNoted'], whenState: 'Issued' },
      ]);
    });

    it('reaches a guard on an orchestration command, naming an orchestration state', async () => {
      const finish = (await commands()).get('FinishRun')!;
      expect(emitOutcomes(finish).map((o) => o.whenState)).toEqual(['Collecting', 'Closed']);
      expect(emittedEvents(finish)).toEqual(['RunSucceeded', 'RunAbandoned']);
    });

    it('reaches a plain single event, which carries no outcomes', async () => {
      const ir = {
        ...(await load()),
      };
      const plain = ir.contexts[0].aggregates
        .flatMap((a) => a.commands)
        .filter((c) => c.outcomes === undefined);
      expect(plain).toEqual([]);
      const single = await new MomentParser().parseContent(
        'context "C" [Core]\n  aggregate "A"\n    identity aId: UUID\n    command Do\n      emits Done\n    event Done\n      aId: UUID\n',
      );
      expect(single.ir?.contexts[0].aggregates[0].commands[0].outcomes).toBeUndefined();
    });

    it('places every outcome of the alternatives from a flow', async () => {
      const flows = (await load()).flows;
      const placed = flows.flatMap((f) =>
        f.moments.flatMap((m) =>
          (m.branches ?? []).flatMap((b) => b.entries.map((e) => e.nodeName)),
        ),
      );
      expect(placed).toEqual(
        expect.arrayContaining([
          'InvoicePartlySettled',
          'InvoiceSettled',
          'RunAbandoned',
          'RunSucceeded',
          'CreditNoted',
        ]),
      );
    });
  });
});

describe('ADR-041 invalid corpus: each exemplar fails with exactly its rule', () => {
  const ADR041 = /^V(31|38|4[4-8])$/;
  const cases: [string, string, 'error' | 'warning'][] = [
    ['multi-event-v31', 'V31', 'error'],
    ['multi-event-v38', 'V38', 'error'],
    ['multi-event-v44', 'V44', 'error'],
    ['multi-event-v45', 'V45', 'error'],
    ['multi-event-v46-state', 'V46', 'error'],
    ['multi-event-v46-duplicate', 'V46', 'error'],
    ['multi-event-v46-partial', 'V46', 'error'],
    ['multi-event-v47', 'V47', 'error'],
  ];

  it.each(cases)(
    '%s reports %s as the only finding over a project',
    async (name, rule, severity) => {
      const file = resolve(FIXTURES, `invalid/${name}/shop.moment`);
      const result = await new ProjectLoader().loadProject([file]);
      expect(result.success).toBe(false);
      expect(result.diagnostics.map((d) => [d.severity, d.ruleId])).toEqual([[severity, rule]]);
      expect(ADR041.test(rule)).toBe(true);
    },
  );

  it.each(cases.filter(([, rule]) => ['V31', 'V38', 'V44', 'V45', 'V47'].includes(rule)))(
    '%s is an advisory in a single file',
    async (name, rule) => {
      const file = resolve(FIXTURES, `invalid/${name}/shop.moment`);
      const { readFileSync } = await import('node:fs');
      const result = await new MomentParser().parseContent(readFileSync(file, 'utf-8'), file);
      expect(result.success).toBe(true);
      expect(result.diagnostics.map((d) => [d.severity, d.ruleId])).toEqual([['warning', rule]]);
    },
  );
});
