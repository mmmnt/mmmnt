import { describe, expect, it } from 'vitest';
import { validateModelCompleteness } from '../../src/validation/model-completeness.js';
import type { IntermediateRepresentation } from '../../src/ir/index.js';

// Hand-built IR: the shapes that predate ADR-037 (no projections, queries or rules) stay quiet, and
// the reference rules V38–V39 are driven both ways without the parser in between.

type Loose = Record<string, unknown>;

function ir(ctx: Loose = {}, flows: Loose[] = []): IntermediateRepresentation {
  const context = {
    name: 'Shop',
    events: [{ name: 'OrderPlaced' }],
    valueObjects: [],
    commands: [{ name: 'PlaceOrder', emitsEvent: 'OrderPlaced' }],
    policies: [],
    sagas: [],
    aggregates: [],
    domainServices: [],
    relationships: [],
    ...ctx,
  };
  return {
    contexts: [context],
    flows,
    glossary: [],
    externals: [],
    relationships: [],
  } as unknown as IntermediateRepresentation;
}

const rules = (r: IntermediateRepresentation): string[] =>
  validateModelCompleteness(r).map((f) => f.ruleId as string);

const flow = (connections: Loose[]): Loose => ({
  name: 'checkout',
  lanes: [{ id: 'shop', contextName: 'Shop', classification: 'Core' }],
  moments: [
    {
      contextEntries: [{ nodeName: 'PlaceOrder' }],
      branches: [{ condition: 'paid', entries: [{ nodeName: 'OrderPlaced' }] }],
    },
  ],
  connections,
});

describe('model completeness over hand-built IR', () => {
  it('checks nothing a context predating ADR-037 does not declare', () => {
    expect(rules(ir())).toEqual([]);
  });

  it('V38: a command emits a declared event, or is flagged', () => {
    expect(rules(ir({ commands: [{ name: 'PlaceOrder', emitsEvent: 'OrderPlaced' }] }))).toEqual(
      [],
    );
    expect(
      validateModelCompleteness(ir({ commands: [{ name: 'Cancel', emitsEvent: 'Gone' }] })),
    ).toEqual([
      { ruleId: 'V38', message: "Command 'Cancel' emits 'Gone', which is no declared event." },
    ]);
  });

  it('V39: a triggers target is placed in the flow, including inside a when block', () => {
    const placed = flow([
      { connectionType: 'triggers', sourceNodeName: 'PlaceOrder', targetNodeName: 'OrderPlaced' },
    ]);
    expect(rules(ir({}, [placed]))).toEqual([]);
    const dangling = flow([
      { connectionType: 'triggers', sourceNodeName: 'PlaceOrder', targetNodeName: 'Ship' },
    ]);
    expect(validateModelCompleteness(ir({}, [dangling]))).toEqual([
      {
        ruleId: 'V39',
        message:
          "In flow 'checkout', 'PlaceOrder' triggers 'Ship', which is placed nowhere in the flow.",
      },
    ]);
  });

  it('V39 ignores other connection kinds and names an anonymous source plainly', () => {
    const other = flow([
      {
        connectionType: 'triggered-by',
        sourceNodeName: 'OrderPlaced',
        targetNodeName: 'Elsewhere',
      },
    ]);
    expect(rules(ir({}, [other]))).toEqual([]);
    const anonymous = flow([{ connectionType: 'triggers', targetNodeName: 'Ship' }]);
    expect(validateModelCompleteness(ir({}, [anonymous]))[0]?.message).toBe(
      "In flow 'checkout', '' triggers 'Ship', which is placed nowhere in the flow.",
    );
  });
});
