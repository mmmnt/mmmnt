import { describe, it, expect, beforeAll } from 'vitest';
import { MomentParser, type IntermediateRepresentation } from '@mmmnt/core';
import { SpecificationDocumentGenerator } from '../../services/specification-document-generator.js';
import { renderFeatureFromIr } from '../../gherkin/feature-renderer.js';

const SOURCE = `
context "Ordering" [Core]
  aggregate "Order"
    identity orderId: UUID
    command PlaceOrder
      emits OrderPlaced
    command RecordPayment
      emits PaymentRecorded
    event OrderPlaced
      orderId: UUID
    event PaymentRecorded
      orderId: UUID

flow "Checkout"
  lane shop "Ordering" [Core]
  lane psp "CardNetwork" [External]
  moment "Order placed"
    shop: PlaceOrder
    shop: OrderPlaced
    note "The customer sees a spinner"
  moment "Card is authorised"
    note psp: "The card network authorises the card and answers within seconds"
  moment "Payment recorded"
    shop: RecordPayment
      triggered-by OrderPlaced
    shop: PaymentRecorded
`;

let ir: IntermediateRepresentation;
let feature: string;
let document: string;

beforeAll(async () => {
  const result = await new MomentParser().parseContent(SOURCE);
  if (!result.success || !result.ir) throw new Error('fixture did not parse');
  ir = result.ir;
  feature = renderFeatureFromIr(ir.flows[0], ir);
  document = new SpecificationDocumentGenerator()
    .generate(ir)
    .map((d) => d.content)
    .join('\n');
});

describe('ADR-040 D3 notes in Gherkin', () => {
  it('renders a note as a comment line, with the lane label when it has one', () => {
    expect(feature).toContain('# note (CardNetwork): The card network authorises the card');
    expect(feature).toContain('# note: The customer sees a spinner');
  });

  it('renders a note-only moment as no scenario and no step', () => {
    expect(feature).not.toContain('Scenario: Card is authorised');
    const lines = feature.split('\n');
    const at = lines.findIndex((l) => l.includes('# note (CardNetwork)'));
    expect(at).toBeGreaterThan(-1);
    expect(lines[at + 1].trim()).toBe('');
  });

  it('keeps the scenarios of the moments around the note', () => {
    expect(feature).toContain('Scenario: Order placed');
    expect(feature).toContain('Scenario: Payment recorded');
  });

  it('puts the comment of a moment that has nodes inside its own scenario', () => {
    const lines = feature.split('\n');
    const scenario = lines.findIndex((l) => l.includes('Scenario: Order placed'));
    const note = lines.findIndex((l) => l.includes('# note: The customer sees a spinner'));
    const next = lines.findIndex((l, i) => i > scenario && l.includes('Scenario:'));
    expect(note).toBeGreaterThan(scenario);
    expect(note).toBeLessThan(next);
  });
});

describe('ADR-040 D3 notes in the specification document', () => {
  it('narrates a note as a step of its moment', () => {
    expect(document).toContain('**2. Card is authorised**');
    expect(document).toContain(
      '- *note (CardNetwork):* The card network authorises the card and answers within seconds',
    );
    expect(document).toContain('- *note:* The customer sees a spinner');
  });
});
