import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { MomentParser } from '../../src/parser/moment-parser.js';
import { ProjectLoader } from '../../src/project/index.js';

// ADR-050 D2: V56 (a `when` path that is not `<field>.kind` on a union field, or a union field guarded
// without `.kind`) and V57 (a variant the union does not declare). V49 reads the path's first segment.

const FIXTURE = resolve(import.meta.dirname, '../../../../fixtures/valid/union-conditions');

const MODEL = (guard: string): string => `
context "Admission" [Core]
  value-object Decision
    | Admitted
    | Refused
        reason: "Disabled" | "Superseded"
    | Postponed
  value-object Actor
    sub: string
  value-object Code: "a" | "b"
  aggregate "Request"
    identity requestId: UUID
    command StartVisit
      input requestId: UUID
      emits VisitStarted
    event DecisionRecorded
      requestId: UUID
      decision: Decision
      decisions: Decision[]
      byStream: Decision{stream}
      actor: Actor
      code: Code
      inline: "x" | "y"
      count: number
    event VisitStarted
      requestId: UUID
  policy AdmittedStartsVisit
    trigger DecisionRecorded when ${guard}
    action "Start the visit"
    chains-to StartVisit
`;

type Finding = { ruleId?: string; severity: string; message: string };
const ruleOf = (d: Finding): string => d.ruleId ?? d.message.split(':')[0];

async function findings(source: string): Promise<Finding[]> {
  const result = await new MomentParser().parseContent(source);
  // A guard the grammar cannot read is a parse error, not a finding: none may hide behind the filter.
  expect(result.diagnostics.filter((d) => /Expecting|Unexpected/.test(d.message))).toEqual([]);
  return result.diagnostics.filter((d) => /^V(49|56|57)$/.test(ruleOf(d)));
}
const rules = async (guard: string): Promise<string[]> =>
  (await findings(MODEL(guard))).map(ruleOf);

describe('ADR-050 D2 validation', () => {
  it('says nothing about `<union field>.kind = <declared variant>`', async () => {
    expect(await rules('decision.kind = Admitted')).toEqual([]);
    expect(await rules('decision.kind = "Postponed"')).toEqual([]);
  });

  it('says nothing about the valid union-conditions fixture', async () => {
    const source = readFileSync(resolve(FIXTURE, 'admission.moment'), 'utf8');
    expect(await findings(source)).toEqual([]);
  });

  it('V49 reads the first segment: a path on a field the trigger does not declare', async () => {
    const out = await findings(MODEL('verdict.kind = Admitted'));
    expect(out.map(ruleOf)).toEqual(['V49']);
    expect(out[0].message).toContain("'verdict'");
  });

  it('V57: a variant the union does not declare', async () => {
    const out = await findings(MODEL('decision.kind = Accepted'));
    expect(out.map(ruleOf)).toEqual(['V57']);
    expect(out[0].message).toContain("'Accepted'");
    expect(out[0].message).toContain("'Decision'");
    expect(out[0].message).toContain('Admitted, Refused, Postponed');
  });

  it('V56: a path on a field that is not a union', async () => {
    for (const guard of [
      'actor.kind = x', // a record value object
      'code.kind = a', // a scalar code set
      'inline.kind = x', // an inline code set
      'count.kind = x', // a built-in
    ]) {
      expect({ guard, rules: await rules(guard) }).toEqual({ guard, rules: ['V56'] });
    }
  });

  it('V56: a path into a union other than `.kind`, or deeper', async () => {
    expect(await rules('decision.reason = Disabled')).toEqual(['V56']);
    expect(await rules('decision.kind.name = Admitted')).toEqual(['V56']);
  });

  it('V56: a union array or map field (which element?)', async () => {
    expect(await rules('decisions.kind = Admitted')).toEqual(['V56']);
    expect(await rules('byStream.kind = Admitted')).toEqual(['V56']);
  });

  it('V56: a union field guarded without `.kind` (an object is never a string)', async () => {
    const out = await findings(MODEL('decision = Admitted'));
    expect(out.map(ruleOf)).toEqual(['V56']);
    expect(out[0].message).toContain("'decision.kind'");
  });

  it('says nothing new about a guard with no dot on a field that is not a union', async () => {
    expect(await rules('code = a')).toEqual([]);
    expect(await rules('count = "3"')).toEqual([]);
  });

  it('is a warning per file and an error over a merged project, like V49', async () => {
    const out = await findings(MODEL('decision.kind = Accepted'));
    expect(out.map((d) => [ruleOf(d), d.severity])).toEqual([['V57', 'warning']]);
    const file = join(mkdtempSync(join(tmpdir(), 'adr050-')), 'admission.moment');
    writeFileSync(file, MODEL('decision.kind = Accepted'));
    const project = await new ProjectLoader().loadProject([file]);
    expect(project.diagnostics.filter((d) => d.ruleId === 'V57').map((d) => d.severity)).toEqual([
      'error',
    ]);
  });

  it("says nothing when the field's union is declared in another file of the project", async () => {
    const model = MODEL('decision.kind = Admitted');
    const union = model.slice(
      model.indexOf('  value-object Decision'),
      model.indexOf('  value-object Actor'),
    );
    const own = model.replace(union, '');
    // In one file the union is unknown: nothing can be decided, so nothing is said.
    expect(await findings(own)).toEqual([]);
    const dir = mkdtempSync(join(tmpdir(), 'adr050-split-'));
    writeFileSync(join(dir, 'a.moment'), own);
    writeFileSync(join(dir, 'b.moment'), `context "Shared" [Core]\n${union}`);
    const project = await new ProjectLoader().loadProject([
      join(dir, 'a.moment'),
      join(dir, 'b.moment'),
    ]);
    expect(project.diagnostics.filter((d) => /^V(49|56|57)$/.test(d.ruleId ?? ''))).toEqual([]);
    // The merged project still checks the variant against the other file's union.
    writeFileSync(join(dir, 'a.moment'), own.replace('= Admitted', '= Accepted'));
    const bad = await new ProjectLoader().loadProject([
      join(dir, 'a.moment'),
      join(dir, 'b.moment'),
    ]);
    expect(bad.diagnostics.filter((d) => d.ruleId === 'V57')).toHaveLength(1);
  });
});
