import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MomentParser, type IntermediateRepresentation } from '@mmmnt/core';
import { generateSimulationScenario } from '../simulation-scenario-generator.js';
import { generatePolicyDefinitions } from '../policy-definitions-generator.js';

// ADR-050 D4: for `when <field>.kind = V`, the occurrence a declared reaction names carries
// `<field>: { kind: V }`; every other occurrence carries another variant, so it decidably does not meet
// the guard. D3: `policy-definitions.json` carries the path as written.

const FIXTURE = resolve(
  import.meta.dirname,
  '../../../../../fixtures/valid/union-conditions/admission.moment',
);

async function load(source: string): Promise<IntermediateRepresentation> {
  const result = await new MomentParser().parseContent(source);
  if (!result.success || !result.ir) {
    throw new Error(result.diagnostics.map((d) => d.message).join('; '));
  }
  return result.ir;
}

const fixture = (): string => readFileSync(FIXTURE, 'utf8');
const decided = (ir: IntermediateRepresentation) =>
  generateSimulationScenario(ir, ir.flows[0]).events.filter(
    (e) => e.eventType === 'DecisionRecorded',
  );

describe('ADR-050 D4 the occurrence the reaction names carries the variant', () => {
  it('writes `{kind: Admitted}` on the named occurrence and another variant on the other', async () => {
    const [first, second] = decided(await load(fixture()));
    expect(second.payload.decision).toEqual({ kind: 'Admitted' });
    expect(first.payload.decision).toEqual({ kind: 'Refused' });
  });

  it('moves the other occurrence to the first variant no guard declares', async () => {
    const source = fixture().replace(
      'trigger DecisionRecorded when decision.kind = Admitted',
      'trigger DecisionRecorded when decision.kind = Refused',
    );
    const [first, second] = decided(await load(source));
    expect(second.payload.decision).toEqual({ kind: 'Refused' });
    expect(first.payload.decision).toEqual({ kind: 'Admitted' });
  });

  it('leaves a union with one variant at its sample on the other occurrence', async () => {
    const source = fixture().replace(/\| Admitted[\s\S]*?\| Postponed\n/, '| Admitted\n');
    const [first, second] = decided(await load(source));
    expect(second.payload.decision).toEqual({ kind: 'Admitted' });
    expect(first.payload.decision).toEqual({});
  });

  it('leaves both occurrences at the sample `{}` when the policy declares no condition', async () => {
    const source = fixture().replace(
      'trigger DecisionRecorded when decision.kind = Admitted',
      'trigger DecisionRecorded',
    );
    const [first, second] = decided(await load(source));
    expect(first.payload.decision).toEqual({});
    expect(second.payload.decision).toEqual({});
  });

  it('carries the path as written in policy-definitions.json (D3)', async () => {
    const defs = generatePolicyDefinitions(await load(fixture()));
    expect(defs.find((d) => d.name === 'AdmittedDecisionStartsVisit')?.condition).toEqual({
      field: 'decision.kind',
      equals: 'Admitted',
    });
  });
});

// ADR-050 D4, the edges: where the union is declared, which fields a guard cannot set, and how the other
// occurrence's variant is chosen when several guards read the same field.
describe('ADR-050 D4 edges of the union guard', () => {
  const MODEL = (opts: {
    unionAt?: 'context' | 'aggregate' | 'other-context' | 'nowhere';
    field?: string;
    policies: string;
    variants?: string[];
  }): string => {
    const variants = (opts.variants ?? ['Admitted', 'Refused', 'Postponed'])
      .map((v) => `    | ${v}`)
      .join('\n');
    const union = `  value-object Decision\n${variants}\n`;
    const at = opts.unionAt ?? 'context';
    return `
context "Admission" [Core]
${at === 'context' ? union : ''}
  aggregate "Request"
    identity requestId: UUID
${at === 'aggregate' ? union.replace(/^ {2}/gm, '    ') : ''}
    command RecordDecision
      input requestId: UUID
      emits DecisionRecorded
    command StartVisit
      input requestId: UUID
      emits VisitStarted
    command NotifyPostponed
      input requestId: UUID
      emits PostponedNotified
    event DecisionRecorded
      requestId: UUID
      ${opts.field ?? 'decision: Decision'}
    event VisitStarted
      requestId: UUID
    event PostponedNotified
      requestId: UUID
${opts.policies}

${at === 'other-context' ? `context "Shared" [Generic]\n${union}` : ''}

flow "N1 - Decided twice"
  lane admission "Admission" [Core]
  moment "The request is decided"
    admission: RecordDecision
    admission: DecisionRecorded
    admission: DecisionRecorded
    admission: StartVisit
      triggered-by DecisionRecorded
    admission: VisitStarted
`;
  };
  const policy = (name: string, guard: string, chainsTo: string): string => `
  policy ${name}
    trigger DecisionRecorded when ${guard}
    action "React"
    chains-to ${chainsTo}`;
  const ADMITTED = policy('AdmittedStartsVisit', 'decision.kind = Admitted', 'StartVisit');
  const decisions = async (source: string): Promise<unknown[]> =>
    decided(await load(source)).map((e) => e.payload.decision);

  it('finds a union declared inside the aggregate', async () => {
    expect(await decisions(MODEL({ unionAt: 'aggregate', policies: ADMITTED }))).toEqual([
      { kind: 'Refused' },
      { kind: 'Admitted' },
    ]);
  });

  it('finds a union declared in another context of the model', async () => {
    expect(await decisions(MODEL({ unionAt: 'other-context', policies: ADMITTED }))).toEqual([
      { kind: 'Refused' },
      { kind: 'Admitted' },
    ]);
  });

  it('writes nothing when the union is declared nowhere (V56/V57 cannot decide; nor can derive)', async () => {
    expect(await decisions(MODEL({ unionAt: 'nowhere', policies: ADMITTED }))).toEqual([{}, {}]);
  });

  it('writes nothing for a path other than `.kind` (V56 refuses it)', async () => {
    const other = policy('ReasonStartsVisit', 'decision.reason = Disabled', 'StartVisit');
    expect(await decisions(MODEL({ policies: other }))).toEqual([{}, {}]);
  });

  it('writes nothing on a union array field (V56 refuses it)', async () => {
    const source = MODEL({ field: 'decision: Decision[]', policies: ADMITTED });
    const values = await decisions(source);
    expect(values.every((v) => !(typeof v === 'object' && v !== null && 'kind' in v))).toBe(true);
  });

  it('writes nothing on a guarded field the payload does not carry (an exclusive second member)', async () => {
    const source = MODEL({
      field: 'note: string | decision: Decision',
      policies: ADMITTED,
    });
    const events = decided(await load(source));
    expect(events.map((e) => 'decision' in e.payload)).toEqual([false, false]);
  });

  it('moves the other occurrence to a variant no guard on the field declares', async () => {
    const postponed = policy('PostponedNotifies', 'decision.kind = Refused', 'NotifyPostponed');
    expect(await decisions(MODEL({ policies: ADMITTED + postponed }))).toEqual([
      { kind: 'Postponed' },
      { kind: 'Admitted' },
    ]);
  });

  it('falls back to the first other variant when every variant is guarded', async () => {
    const refused = policy('RefusedNotifies', 'decision.kind = Refused', 'NotifyPostponed');
    const source = MODEL({ policies: ADMITTED + refused, variants: ['Admitted', 'Refused'] });
    expect(await decisions(source)).toEqual([{ kind: 'Refused' }, { kind: 'Admitted' }]);
  });
});
