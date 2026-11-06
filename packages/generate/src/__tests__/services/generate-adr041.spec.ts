import { describe, it, expect } from 'vitest';
import { MomentParser, type IntermediateRepresentation } from '@mmmnt/core';
import { SpecificationDocumentGenerator } from '../../services/specification-document-generator.js';
import { renderFeatureFromIr } from '../../gherkin/feature-renderer.js';

async function load(source: string): Promise<IntermediateRepresentation> {
  const result = await new MomentParser().parseContent(source);
  if (!result.success || !result.ir) {
    throw new Error(result.diagnostics.map((d) => d.message).join('; '));
  }
  return result.ir;
}

const CONTEXT = (emits: string): string => `
context "Inventory" [Core]
  aggregate "SeatHold"
    identity holdId: UUID
    state initial Active
    state Active -> Closing on Convert
    command Convert
      input holdId: UUID
      precondition holdActive: "The hold is active"
      emits ${emits}
    event Converted
      holdId: UUID
    event Closed
      holdId: UUID
`;

const FLOW = `
flow "Convert"
  lane inv "Inventory" [Core]
  moment "Hold converts"
    inv: Convert
    inv: Converted
    inv: Closed
`;

const BRANCHED = `
flow "Convert"
  lane inv "Inventory" [Core]
  moment "Hold converts" [branch]
    when plain
      inv: Convert
      inv: Converted
    when closing
      inv: Convert
      inv: Converted
      inv: Closed
`;

const doc = (ir: IntermediateRepresentation): string =>
  new SpecificationDocumentGenerator()
    .generate(ir)
    .map((d) => d.content)
    .join('\n');

const steps = (feature: string): string[] =>
  feature
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /^(Given|When|Then|And) /.test(l));

describe('ADR-041 D5 Gherkin', () => {
  it('renders the first event of an outcome as Then and the events recorded with it as And', async () => {
    const ir = await load(CONTEXT('Converted, Closed') + FLOW);
    expect(steps(renderFeatureFromIr(ir.flows[0], ir))).toEqual([
      'Given The hold is active',
      'When Inventory performs Convert with holdId',
      'Then Inventory emits Converted',
      'And Inventory emits Closed',
    ]);
  });

  it('keeps the events after a single-event command as Then steps, as before', async () => {
    const ir = await load(CONTEXT('Converted') + FLOW);
    expect(steps(renderFeatureFromIr(ir.flows[0], ir))).toEqual([
      'Given The hold is active',
      'When Inventory performs Convert with holdId',
      'Then Inventory emits Converted',
      'Then Inventory emits Closed',
    ]);
  });

  it('never starts a scenario with And', async () => {
    const ir = await load(CONTEXT('Converted, Closed') + FLOW);
    const feature = renderFeatureFromIr(ir.flows[0], ir);
    for (const scenario of feature.split('Scenario:').slice(1)) {
      expect(steps(scenario)[0]).not.toMatch(/^And /);
    }
  });

  it('renders only the outcome each branch places, one scenario per alternative', async () => {
    const ir = await load(CONTEXT('Converted | Converted, Closed') + BRANCHED);
    const feature = renderFeatureFromIr(ir.flows[0], ir);
    const [plain, closing] = feature.split('Scenario:').slice(1);
    expect(steps(plain).filter((s) => s.includes('emits'))).toEqual([
      'Then Inventory emits Converted',
    ]);
    expect(steps(closing).filter((s) => s.includes('emits'))).toEqual([
      'Then Inventory emits Converted',
      'And Inventory emits Closed',
    ]);
  });
});

describe('ADR-041 D5 specification document', () => {
  it('writes `produces A, B` for events recorded together', async () => {
    const text = doc(await load(CONTEXT('Converted, Closed') + FLOW));
    expect(text).toContain('Inventory performs **Convert** → produces **Converted**, **Closed**');
    expect(text).toContain('| **Convert** | The hold is active | Converted, Closed |');
    expect(text).toContain('Inventory->>Inventory: Convert → Converted, Closed');
  });

  it('writes `produces A or B` for alternative outcomes', async () => {
    const text = doc(await load(CONTEXT('Converted | Closed') + FLOW));
    expect(text).toContain('Inventory performs **Convert** → produces **Converted** or **Closed**');
    expect(text).toContain('| **Convert** | The hold is active | Converted or Closed |');
    expect(text).toContain('Inventory->>Inventory: Convert → Converted or Closed');
  });

  it('names the state of a guarded outcome', async () => {
    const text = doc(
      await load(CONTEXT('Converted when Active | Converted, Closed when Closing') + FLOW),
    );
    expect(text).toContain(
      'Inventory performs **Convert** → produces **Converted** when Active, or **Converted**, **Closed** when Closing',
    );
    expect(text).toContain(
      '| **Convert** | The hold is active | Converted when Active, or Converted, Closed when Closing |',
    );
  });

  it('is unchanged for a single-event command', async () => {
    const text = doc(await load(CONTEXT('Converted') + FLOW));
    expect(text).toContain('Inventory performs **Convert** → produces **Converted**\n');
    expect(text).toContain('| **Convert** | The hold is active | Converted |');
    expect(text).toContain('Inventory->>Inventory: Convert → Converted\n');
  });
});
