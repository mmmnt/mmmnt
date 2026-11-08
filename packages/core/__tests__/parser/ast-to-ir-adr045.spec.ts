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

// ADR-045 D1 and D3: `trigger E [when f = v] [after X]` parses, and the IR carries `condition`.

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
context "Inventory" [Core]
  policy PromoteWaitlist
    trigger ${trigger}
    action "Promote the next customer"
    chains-to Notify
`);
  expect(doc.parseResult.lexerErrors).toHaveLength(0);
  expect(doc.parseResult.parserErrors).toHaveLength(0);
  return astToIr(doc.parseResult.value).contexts[0].policies[0];
};

describe('ADR-045 D1 grammar and D3 IR', () => {
  it('parses `when <field> = <value>` with an identifier value', async () => {
    const p = await policyOf('HoldReleased when reason = expired');
    expect(p.trigger).toBe('HoldReleased');
    expect(p.condition).toEqual({ field: 'reason', equals: 'expired' });
  });

  it('parses a string value, which may hold what an identifier cannot', async () => {
    const p = await policyOf('HoldReleased when reason = "payment failed"');
    expect(p.condition).toEqual({ field: 'reason', equals: 'payment failed' });
  });

  it('parses `after <Event>`', async () => {
    const p = await policyOf('PaymentConfirmed after SeatsHeld');
    expect(p.trigger).toBe('PaymentConfirmed');
    expect(p.condition).toEqual({ after: 'SeatsHeld' });
  });

  it('parses both, `when` first', async () => {
    const p = await policyOf('PaymentConfirmed when method = card after SeatsHeld');
    expect(p.condition).toEqual({ field: 'method', equals: 'card', after: 'SeatsHeld' });
  });

  it('reads a field named with a word that is also a keyword', async () => {
    const p = await policyOf('Answered when outcome = Succeeded');
    expect(p.condition).toEqual({ field: 'outcome', equals: 'Succeeded' });
  });

  it("gives a policy with neither exactly today's IR: no `condition` key at all", async () => {
    const p = await policyOf('HoldReleased');
    expect('condition' in p).toBe(false);
    expect(Object.keys(p).sort()).toEqual(['action', 'chainsTo', 'id', 'name', 'trigger'].sort());
  });

  it('keeps a field, lane or input named `after` parsing (the word is now a keyword)', async () => {
    const doc = await parse(`
context "Billing" [Core]
  aggregate "Invoice"
    identity invoiceId: UUID
    command Settle
      input after: DateTime, cause: string
      emits Settled
    event Settled
      invoiceId: UUID
      after: DateTime

flow "F"
  lane after "After" [Core]
  moment "M"
    after: Settled
`);
    expect(doc.parseResult.lexerErrors).toHaveLength(0);
    expect(doc.parseResult.parserErrors.map((e) => e.message)).toEqual([]);
  });
});
