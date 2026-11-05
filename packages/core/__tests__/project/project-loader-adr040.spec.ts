import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { readFileSync, readdirSync } from 'node:fs';
import { ProjectLoader } from '../../src/project/index.js';
import { MomentParser } from '../../src/parser/moment-parser.js';

const FIXTURES = resolve(import.meta.dirname, '../../../../fixtures');
const VALID = resolve(FIXTURES, 'valid/process-constructs');

const filesOf = (dir: string): string[] =>
  readdirSync(resolve(VALID, dir))
    .sort()
    .map((f) => resolve(VALID, dir, f));
const project = [...filesOf('contexts'), ...filesOf('flows')];

describe('ADR-040 valid corpus: process-constructs', () => {
  it('loads as a project with no error and no V22-V43 finding', async () => {
    const result = await new ProjectLoader().loadProject(project);
    expect(result.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(result.diagnostics.filter((d) => /^V(2\d|3\d|4[0-3])$/.test(d.ruleId ?? ''))).toEqual(
      [],
    );
    expect(result.success).toBe(true);
  });

  describe('reachability sweep: every construct is reached from a fixture', () => {
    const load = async () => (await new ProjectLoader().loadProject(project)).ir;

    it('reaches a process event from a trigger, a projection source and an emitting command', async () => {
      const clinic = (await load()).contexts.find((c) => c.name === 'Clinic');
      const process = clinic?.sagas[0];
      expect(process?.events?.map((e) => e.name)).toEqual([
        'AdmissionStarted',
        'AdmissionCompleted',
        'AdmissionAbandoned',
      ]);
      expect(clinic?.policies.map((p) => p.trigger)).toContain('AdmissionCompleted');
      expect(clinic?.projections?.[0].sources).toEqual(['AdmissionAbandoned']);
      expect(process?.commands?.map((c) => c.emitsEvent)).toContain('AdmissionCompleted');
    });

    it('reaches causes from placements', async () => {
      const ir = await load();
      const causes = ir.flows.flatMap((f) =>
        f.moments.flatMap((m) => m.contextEntries.map((e) => e.cause)),
      );
      expect(causes).toEqual(expect.arrayContaining(['OwnerRequest', 'ClinicClosure']));
    });

    it('reaches a note from a moment and a hop from a same-moment triggered-by', async () => {
      const checkout = (await load()).flows.find((f) => f.name === 'Checkout');
      expect(checkout?.moments[1].notes?.[0].laneId).toBe('psp');
      const first = checkout?.moments[0].id;
      expect(
        checkout?.connections.filter(
          (c) => c.connectionType === 'triggered-by' && c.sourceMomentId === first,
        ),
      ).toHaveLength(2);
    });
  });
});

describe('ADR-040 invalid corpus exemplars, one per rule', () => {
  const rules = ['V31', 'V40', 'V41', 'V42', 'V43'];
  it.each(rules)(
    '%s fails its exemplar project with that rule, and warns for the file alone',
    async (rule) => {
      const file = resolve(FIXTURES, `invalid/process-${rule.toLowerCase()}/shop.moment`);
      const own = (d: { ruleId?: string }): boolean => /^V(31|4[0-3])$/.test(d.ruleId ?? '');
      const project = await new ProjectLoader().loadProject([file]);
      const single = await new MomentParser().parseContent(readFileSync(file, 'utf-8'), file);

      expect(project.success).toBe(false);
      expect(project.diagnostics.filter(own).map((d) => [d.severity, d.ruleId])).toEqual([
        ['error', rule],
      ]);
      expect(single.success).toBe(true);
      expect(single.diagnostics.filter(own).map((d) => [d.severity, d.ruleId])).toEqual([
        ['warning', rule],
      ]);
    },
  );

  it.each(['V5', 'V10'])('%s fails its exemplar with exactly that rule', async (rule) => {
    const file = resolve(FIXTURES, `invalid/process-${rule.toLowerCase()}/shop.moment`);
    const single = await new MomentParser().parseContent(readFileSync(file, 'utf-8'), file);
    expect(single.success).toBe(false);
    expect(
      single.diagnostics.filter((d) => d.severity === 'error').map((d) => d.message.split(':')[0]),
    ).toEqual([rule]);
  });
});
