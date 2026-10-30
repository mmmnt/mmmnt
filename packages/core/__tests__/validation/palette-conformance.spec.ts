import { describe, expect, it } from 'vitest';
import { validatePaletteConformance } from '../../src/validation/palette-conformance.js';
import type { IntermediateRepresentation } from '../../src/ir/index.js';

// ADR-038 V29–V37 over hand-built IR. Each rule is driven both ways, and the IR shapes that predate
// ADR-038 (no orchestration commands, issues, transitions, compensations or gateways) stay quiet.

type Loose = Record<string, unknown>;

const gw = (name: string, consumes: string, produces: string): Loose => ({
  id: name,
  name,
  consumes,
  produces,
});

function ir(ctx: Loose = {}, externals?: Loose[]): IntermediateRepresentation {
  const context = {
    name: 'Shop',
    events: [{ name: 'OrderPlaced' }, { name: 'PaymentTaken' }],
    valueObjects: [{ name: 'Money' }],
    commands: [{ name: 'PlaceOrder' }, { name: 'TakePayment' }],
    policies: [],
    sagas: [],
    aggregates: [],
    ...ctx,
  };
  return {
    contexts: [context],
    ...(externals ? { externals } : {}),
  } as unknown as IntermediateRepresentation;
}

const rules = (r: IntermediateRepresentation): string[] =>
  validatePaletteConformance(r).map((f) => f.ruleId as string);
const messages = (r: IntermediateRepresentation): string[] =>
  validatePaletteConformance(r).map((f) => f.message);

describe('V29/V30 policies', () => {
  it('accepts a policy triggered by a declared event that chains to an aggregate command', () => {
    expect(
      rules(
        ir({ policies: [{ name: 'Charge', trigger: 'OrderPlaced', chainsTo: 'TakePayment' }] }),
      ),
    ).toEqual([]);
  });
  it('flags a policy that chains to nothing, or to an unknown command', () => {
    const r = ir({
      policies: [
        { name: 'Idle', trigger: 'OrderPlaced' },
        { name: 'Lost', trigger: 'OrderPlaced', chainsTo: 'Ghost' },
      ],
    });
    expect(messages(r)).toEqual([
      "Policy 'Idle' chains to '', which is no command of an aggregate or an orchestration.",
      "Policy 'Lost' chains to 'Ghost', which is no command of an aggregate or an orchestration.",
    ]);
  });
  it('flags a policy triggered by an undeclared event', () => {
    expect(
      rules(ir({ policies: [{ name: 'Odd', trigger: 'Nothing', chainsTo: 'PlaceOrder' }] })),
    ).toEqual(['V30']);
  });
});

describe('V31–V35 orchestrations', () => {
  const saga = (s: Loose): Loose => ({
    name: 'Checkout',
    trigger: 'StartCheckout',
    states: [],
    ...s,
  });
  const own = [{ name: 'StartCheckout' }, { name: 'Retry' }];

  it('checks nothing on an orchestration that predates ADR-038', () => {
    expect(rules(ir({ sagas: [saga({ trigger: 'Anything' })] }))).toEqual([]);
  });

  it('accepts a well-formed orchestration with every optional part absent', () => {
    expect(rules(ir({ sagas: [saga({ commands: own })] }))).toEqual([]);
  });

  it('V31: an orchestration command must not emit a domain event', () => {
    const r = ir({
      sagas: [saga({ commands: [{ name: 'StartCheckout', emitsEvent: 'OrderPlaced' }] })],
    });
    expect(messages(r)).toEqual([
      "Orchestration 'Checkout' command 'StartCheckout' emits 'OrderPlaced'; an orchestration generates no domain event.",
    ]);
  });

  it('V32: the orchestration is invoked by one of its own commands', () => {
    expect(rules(ir({ sagas: [saga({ commands: [{ name: 'Other' }] })] }))).toEqual(['V32']);
  });

  it('V33: issued commands resolve to aggregate commands or declared externals', () => {
    const r = ir(
      {
        sagas: [
          saga({
            commands: own,
            issues: [
              { name: 'PlaceOrder' },
              { name: 'Ghost' },
              { name: 'Charge', external: 'Stripe' },
              { name: 'Send', external: 'Mailer' },
            ],
          }),
        ],
      },
      [{ name: 'Stripe' }],
    );
    expect(messages(r)).toEqual([
      "Orchestration 'Checkout' issues 'Ghost', which is no command of an aggregate.",
      "Orchestration 'Checkout' issues 'Mailer.Send', but 'Mailer' is no declared external.",
    ]);
  });

  it('V34: a command step is on an own command that some policy chains to', () => {
    const r = ir({
      policies: [{ name: 'Again', trigger: 'PaymentTaken', chainsTo: 'Retry' }],
      sagas: [
        saga({
          commands: own,
          transitions: [
            { from: 'a', to: 'b', onEvent: 'OrderPlaced' },
            { from: 'b', to: 'c', onCommand: 'Retry' },
            { from: 'c', to: 'd', onCommand: 'StartCheckout' },
            { from: 'd', to: 'e', onCommand: 'Elsewhere' },
          ],
        }),
      ],
    });
    expect(messages(r)).toEqual([
      "Orchestration 'Checkout' step c -> d is on 'StartCheckout', which no policy chains to.",
      "Orchestration 'Checkout' step d -> e is on 'Elsewhere', which is none of its own commands.",
    ]);
  });

  it("V35: 'compensation none' stands alone, and compensations are on own commands issuing known commands", () => {
    const r = ir({
      sagas: [
        saga({
          commands: own,
          compensations: [
            { none: true, onCommand: '', issues: [] },
            { onCommand: 'Elsewhere', issues: [{ name: 'Ghost' }] },
          ],
        }),
      ],
    });
    expect(messages(r)).toEqual([
      "Orchestration 'Checkout' declares 'compensation none' beside other compensation lines.",
      "Orchestration 'Checkout' compensates on 'Elsewhere', which is none of its own commands.",
      "Orchestration 'Checkout' issues 'Ghost', which is no command of an aggregate.",
    ]);
  });

  it("V35: a lone 'compensation none' and a valid compensation pass", () => {
    expect(
      rules(
        ir({
          sagas: [
            saga({ commands: own, compensations: [{ none: true, onCommand: '', issues: [] }] }),
          ],
        }),
      ),
    ).toEqual([]);
    expect(
      rules(
        ir({
          sagas: [
            saga({
              commands: own,
              compensations: [{ onCommand: 'Retry', issues: [{ name: 'PlaceOrder' }] }],
            }),
          ],
        }),
      ),
    ).toEqual([]);
  });
});

describe('V36 aggregate states', () => {
  const agg = (states?: Loose): Loose => ({
    name: 'Order',
    commands: [{ name: 'PlaceOrder' }],
    ...(states ? { states } : {}),
  });

  it('checks nothing for an aggregate without states', () => {
    expect(rules(ir({ aggregates: [agg()] }))).toEqual([]);
  });

  it('accepts one initial state reaching every state by its own commands', () => {
    const states = {
      initial: 'New',
      initials: ['New'],
      transitions: [{ from: 'New', to: 'Placed', command: 'PlaceOrder' }],
    };
    expect(rules(ir({ aggregates: [agg(states)] }))).toEqual([]);
  });

  it('flags missing or duplicate initials, foreign commands, and unreachable states', () => {
    const none = { initials: [], transitions: [{ from: 'New', to: 'Placed', command: 'Ship' }] };
    expect(messages(ir({ aggregates: [agg(none)] }))).toEqual([
      "Aggregate 'Order' declares 0 initial states; exactly one is required.",
      "Aggregate 'Order' moves New -> Placed on 'Ship', which is none of its commands.",
      "Aggregate 'Order' state 'New' is not reachable from its initial state.",
      "Aggregate 'Order' state 'Placed' is not reachable from its initial state.",
    ]);
    const two = { initial: 'New', initials: ['New', 'Draft'], transitions: [] };
    expect(rules(ir({ aggregates: [agg(two)] }))).toEqual(['V36']);
  });
});

describe('V37 gateways', () => {
  it('accepts gateways over declared events and value objects, and owners without gateways', () => {
    const r = ir(
      {
        projections: [
          { name: 'Sales', gateways: [gw('In', 'OrderPlaced', 'Money')] },
          { name: 'Bare' },
        ],
        policies: [{ name: 'Charge', trigger: 'OrderPlaced', chainsTo: 'TakePayment' }],
        sagas: [{ name: 'Checkout', trigger: 'x', states: [] }],
      },
      [{ name: 'Stripe' }],
    );
    expect(rules(r)).toEqual([]);
  });

  it('names each owner whose gateway consumes or produces something undeclared', () => {
    const bad = (name: string): Loose[] => [gw(name, 'Nothing', 'Money')];
    const r = ir(
      {
        projections: [{ name: 'Sales', gateways: bad('P') }],
        policies: [
          { name: 'Charge', trigger: 'OrderPlaced', chainsTo: 'TakePayment', gateways: bad('Q') },
        ],
        sagas: [{ name: 'Checkout', trigger: 'x', states: [], gateways: bad('S') }],
      },
      [{ name: 'Stripe', gateways: [gw('E', 'OrderPlaced', 'Receipt')] }],
    );
    expect(messages(r)).toEqual([
      "Gateway 'P' of projection 'Sales' consumes 'Nothing', which is no declared event or value object.",
      "Gateway 'Q' of policy 'Charge' consumes 'Nothing', which is no declared event or value object.",
      "Gateway 'S' of orchestration 'Checkout' consumes 'Nothing', which is no declared event or value object.",
      "Gateway 'E' of external 'Stripe' produces 'Receipt', which is no declared event or value object.",
    ]);
  });

  it('tolerates a context without projections and an IR without externals', () => {
    expect(rules(ir({ projections: undefined }))).toEqual([]);
  });
});
