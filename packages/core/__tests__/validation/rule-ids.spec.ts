import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MomentParser } from '../../src/parser/moment-parser.js';
import { SYNTAX_LEVEL_RULES } from '../../src/validation/moment-validator.js';

// Every syntax-level rule's diagnostic carries its id in `ruleId`, as the model-level rules' do.
// The message keeps its `V55: ` prefix, so a reader of the message alone still sees the rule.

const CONTEXTS = `
context "Ordering" [Core]
  aggregate "Order"
    identity orderId: UUID
    command PlaceOrder
      input customerId: UUID
      emits OrderPlaced
    event OrderPlaced
      orderId: UUID
context "Fulfillment" [Supporting]
  aggregate "FulfillmentRequest"
    identity fulfillmentId: UUID
    command InitiateFulfillment
      input orderId: UUID
      emits FulfillmentInitiated
    event FulfillmentInitiated
      fulfillmentId: UUID
`;

const flow = (body: string, contexts = CONTEXTS): string => `${contexts}
flow "test"
  lane ordering "Ordering" [Core]
  lane fulfillment "Fulfillment" [Supporting]
${body}
`;

const valueObjects = (members: string): string => `
context "Intake" [Core]
  value-object Ref
    stream: string
${members}
`;

/** One spec per syntax-level rule that the rule reports. */
const CASES: Record<string, string> = {
  'SP-01': flow(`  lane other "NonExistent" [Core]
  moment "Step"
    ordering: PlaceOrder
    other: Something`),
  'SP-02': flow(`  moment "Step"
    ordering: NotAnEvent crosses-to fulfillment via CustomerSupplier
      contract
        id: UUID [required]`),
  'SP-03': flow(
    `  moment "Step"
    ordering: SomeEvent crosses-to fulfillment via Partnership
      contract`,
    '',
  ),
  V1: flow(`  moment "Step"
    ordering: NotDeclaredAnywhere`),
  V2: flow(
    `  branch-lane errors "Errors" [Terminal]
  moment "Step"
    ordering: SomeEvent crosses-to errors via Partnership
      contract
        id: UUID [required]`,
    '',
  ),
  V5: flow(
    `  moment "Step 1"
    ordering: DoSomething
      triggered-by NonExistent`,
    '',
  ),
  V6: flow(
    `  moment "Step 1"
    ordering: First
  moment "Step 2"
    ordering: Second
      returns-to "Non-existent"`,
    '',
  ),
  V7: flow(
    `  moment "Step"
    ordering: SomeEvent [optional] crosses-to fulfillment via Partnership
      contract
        id: UUID [required]`,
    '',
  ),
  V8: flow(
    `  moment "Step"
    ordering: First [terminal]
    ordering: Second`,
    '',
  ),
  V9: flow(`  moment "Step"
    ordering: PlaceOrder crosses-to fulfillment via CustomerSupplier
      contract
        id: UUID [required]`),
  V10: flow(
    `  moment "Empty"
  moment "Full"
    ordering: Something`,
    '',
  ),
  V11: flow(`  moment "Step"
    ordering: PlaceOrder (×3)`),
  V12: `
context "Test"
  aggregate "Order"
    identity orderId: UUID
    event OrderPlaced
      orderId: UUID
      legacyId: string [deprecated "Use orderId" -> "missingField"]
`,
  V13: flow(
    `  moment "Step"
    nonexistent: SomeEvent`,
    '',
  ),
  V14: flow(`  moment "Step"
    ordering: OrderPlaced crosses-to fulfillment via Partnership
      contract
        id: UUID [required]`),
  V16: flow(
    `  branch-lane errors "Errors" [Terminal]
  moment "Step"
    ordering: SomeEvent`,
    '',
  ),
  V17: flow(
    `  moment "Step 1"
    ordering: First
  moment "Step 2"
    ordering: Second
      returns-to "Step 1"
  moment "Step 3"
    ordering: Third
      returns-to "Step 1"`,
    '',
  ),
  V18: `
context "Test"
  @sensitivity(High)
  aggregate "Order"
    identity orderId: UUID
`,
  V19: `
context "Test"
  aggregate "Order"
    identity orderId: UUID
    event OrderPlaced
      orderId: UUID
  @classification(PII)
`,
  V20: flow(
    `  moment "Step 1"
    ordering: EarlyEvent
  moment "Step 2"
    ordering: LateEvent
      triggers EarlyEvent`,
    '',
  ),
  V52: valueObjects(`  value-object Arrival
    kind: string
    | Live
    | Replay`),
  V53: valueObjects(`  value-object Arrival
    | Live
    | Live`),
  V54: valueObjects(`  value-object Holder
    pointer?: string | ref: Ref`),
  V55: valueObjects(`  value-object Holder
    hash: string [pattern "([a-f"]`),
};

const PREFIX = /^((?:V|SP-)\d+):/;

describe('every validation diagnostic carries its ruleId', () => {
  it('has a case for each syntax-level rule, and the validator reports no other code', () => {
    const source = readFileSync(
      resolve(import.meta.dirname, '../../src/validation/moment-validator.ts'),
      'utf8',
    );
    const codes = new Set([...source.matchAll(/\bcode: '([^']+)'/g)].map((m) => m[1]));
    expect([...codes].sort()).toEqual([...SYNTAX_LEVEL_RULES].sort());
    expect(Object.keys(CASES).sort()).toEqual([...SYNTAX_LEVEL_RULES].sort());
  });

  it.each(Object.entries(CASES))('%s', async (rule, source) => {
    const { diagnostics } = await new MomentParser().parseContent(source);

    expect(diagnostics.filter((d) => d.ruleId === rule)).not.toEqual([]);
    for (const d of diagnostics) {
      expect(d.ruleId, d.message).toBeDefined();
      const prefix = PREFIX.exec(d.message)?.[1];
      if (prefix !== undefined) expect(d.ruleId).toBe(prefix);
    }
  });
});
