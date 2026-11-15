import { describe, it, expect, beforeAll } from 'vitest';
import {
  inject,
  createDefaultCoreModule,
  createDefaultSharedCoreModule,
  EmptyFileSystem,
} from 'langium';
import { parseHelper } from 'langium/test';
import { MomentGeneratedModule, MomentGeneratedSharedModule } from '../../src/generated/module.js';
import type { MomentFile } from '../../src/generated/ast.js';
import { astToIr } from '../../src/parser/ast-to-ir.js';
import type { LangiumDocument } from 'langium';

// ADR-050 D1 and D3: `when <field>.kind = <Variant>` parses, and the IR's `condition.field` is the path
// as written. A field with no dot is ADR-045's condition, unchanged.

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

const policyOf = async (trigger: string) => {
  const doc = await parse(`
context "Admission" [Core]
  policy AdmittedStartsVisit
    trigger ${trigger}
    action "Start the visit"
    chains-to StartVisit
`);
  expect(doc.parseResult.lexerErrors).toHaveLength(0);
  expect(doc.parseResult.parserErrors).toHaveLength(0);
  return astToIr(doc.parseResult.value).contexts[0].policies[0];
};

describe('ADR-050 D1 grammar and D3 IR', () => {
  it('parses `when <field>.kind = <Variant>` and keeps the path as written', async () => {
    const p = await policyOf('DecisionRecorded when decision.kind = Admitted');
    expect(p.condition).toEqual({ field: 'decision.kind', equals: 'Admitted' });
  });

  it('combines with `after`', async () => {
    const p = await policyOf('DecisionRecorded when decision.kind = Admitted after RequestMade');
    expect(p.condition).toEqual({
      field: 'decision.kind',
      equals: 'Admitted',
      after: 'RequestMade',
    });
  });

  it('reads a path whose first segment is a keyword-like field name', async () => {
    const p = await policyOf('Answered when outcome.kind = Succeeded');
    expect(p.condition).toEqual({ field: 'outcome.kind', equals: 'Succeeded' });
  });

  it('parses a deeper or other path, which validation refuses (V56) rather than the parser', async () => {
    const p = await policyOf('Recorded when arrival.actor.sub = x');
    expect(p.condition).toEqual({ field: 'arrival.actor.sub', equals: 'x' });
  });

  it("gives a field with no dot exactly ADR-045's IR", async () => {
    const p = await policyOf('HoldReleased when reason = expired');
    expect(p.condition).toEqual({ field: 'reason', equals: 'expired' });
  });
});
