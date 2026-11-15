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
