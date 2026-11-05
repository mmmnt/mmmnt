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

  it('V31: an orchestration command must not emit an event the orchestration does not declare', () => {
    const r = ir({
      sagas: [saga({ commands: [{ name: 'StartCheckout', emitsEvent: 'OrderPlaced' }] })],
    });
    expect(messages(r)).toEqual([
      "Orchestration 'Checkout' command 'StartCheckout' emits 'OrderPlaced', which the orchestration does not declare; it emits only its own events.",
    ]);
  });

  it('V31: an orchestration command may emit a process event the orchestration declares', () => {
    const r = ir({
      sagas: [
        saga({
          commands: [{ name: 'StartCheckout', emitsEvent: 'CheckoutStarted' }],
          events: [{ name: 'CheckoutStarted' }],
        }),
      ],
    });
    expect(rules(r)).toEqual([]);
  });

  it('V31: a command may not emit a process event of another orchestration', () => {
    const r = ir({
      sagas: [
        saga({ commands: [{ name: 'StartCheckout', emitsEvent: 'Other' }], events: [] }),
        saga({
          name: 'Other',
          trigger: 'Go',
          commands: [{ name: 'Go' }],
          events: [{ name: 'Other' }],
        }),
      ],
    });
    expect(rules(r)).toEqual(['V31']);
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

describe('V40 one owner per event', () => {
  const saga = (name: string, events: Loose[], extra: Loose = {}): Loose => ({
    name,
    trigger: 'Go',
    states: [],
    commands: [{ name: 'Go' }],
    events,
    ...extra,
  });

  it('accepts process events with names no other construct declares', () => {
    const r = ir({ sagas: [saga('Checkout', [{ name: 'CheckoutDone' }])] });
    expect(rules(r)).toEqual([]);
  });

  it('refuses a process event that repeats the name of an aggregate event', () => {
    const r = ir({
      aggregates: [{ name: 'Order', events: [{ name: 'OrderPlaced' }] }],
      sagas: [saga('Checkout', [{ name: 'OrderPlaced' }])],
    });
    expect(messages(r)).toEqual([
      "Event 'OrderPlaced' is declared by aggregate 'Order' and orchestration 'Checkout'; an event has one owner.",
    ]);
  });

  it('refuses a process event that repeats the name of another orchestration event', () => {
    const r = ir({
      sagas: [saga('A', [{ name: 'Done' }]), saga('B', [{ name: 'Done' }])],
    });
    expect(rules(r)).toEqual(['V40']);
  });

  it('stays quiet for IR that predates ADR-040 (no orchestration events)', () => {
    const r = ir({
      aggregates: [{ name: 'Order', events: [{ name: 'OrderPlaced' }] }],
      sagas: [saga('Checkout', undefined as unknown as Loose[])],
    });
    expect(rules(r)).toEqual([]);
  });
});

// ADR-040 V41/V42: causes of commands, preconditions and placements, over hand-built IR.
describe('V41/V42 causes', () => {
  const cancel = (extra: Loose = {}): Loose => ({
    name: 'CancelAppointment',
    causes: ['OwnerRequest', 'ClinicClosure'],
    preconditions: [
      { name: 'IsOpen', description: 'open' },
      { name: 'Window', description: 'ahead', causes: ['OwnerRequest'] },
    ],
    ...extra,
  });
  const withFlow = (
    command: Loose,
    entries: Loose[],
    ctx: Loose = {},
  ): IntermediateRepresentation =>
    ({
      ...ir({ commands: [command], ...ctx }),
      flows: [
        {
          name: 'F',
          lanes: [],
          connections: [],
          moments: [{ id: 'm0', name: 'M', contextEntries: entries }],
        },
      ],
    }) as unknown as IntermediateRepresentation;
  const place = (cause?: string): Loose => ({
    nodeName: 'CancelAppointment',
    nodeKind: 'command',
    ...(cause ? { cause } : {}),
  });

  it('accepts a command with scoped preconditions placed for a declared cause', () => {
    expect(rules(withFlow(cancel(), [place('OwnerRequest')]))).toEqual([]);
  });

  it('accepts IR that predates ADR-040 (no causes anywhere)', () => {
    const plain = { name: 'CancelAppointment', preconditions: [{ name: 'P', description: 'd' }] };
    expect(rules(withFlow(plain, [place()]))).toEqual([]);
  });

  it('V41: a precondition names a cause the command does not declare', () => {
    const cmd = cancel({
      preconditions: [{ name: 'Window', description: 'x', causes: ['Typo'] }],
    });
    expect(messages(withFlow(cmd, [place('OwnerRequest')]))).toEqual([
      "Precondition 'Window' of command 'CancelAppointment' names cause 'Typo', which the command does not declare.",
    ]);
  });

  it('V41: a precondition names a cause on a command that declares none', () => {
    const cmd = {
      name: 'CancelAppointment',
      preconditions: [{ name: 'Window', description: 'x', causes: ['OwnerRequest'] }],
    };
    expect(rules(ir({ commands: [cmd] }))).toEqual(['V41']);
  });

  it('V41: a placement names a cause the command does not declare', () => {
    expect(messages(withFlow(cancel(), [place('Typo')]))).toEqual([
      "Flow 'F' places 'CancelAppointment' for cause 'Typo', which the command does not declare.",
    ]);
  });

  it('V41: a placement names a cause on a command that declares none', () => {
    const plain = { name: 'CancelAppointment', preconditions: [] };
    expect(rules(withFlow(plain, [place('OwnerRequest')]))).toEqual(['V41']);
  });

  it('V42: a command with a scoped precondition is placed with no cause', () => {
    expect(messages(withFlow(cancel(), [place()]))).toEqual([
      "Flow 'F' places 'CancelAppointment' without a cause, but the command has cause-scoped preconditions.",
    ]);
  });

  it('V42: quiet when no precondition is scoped, even if the command declares causes', () => {
    const cmd = cancel({ preconditions: [{ name: 'IsOpen', description: 'open' }] });
    expect(rules(withFlow(cmd, [place()]))).toEqual([]);
  });

  it('V41/V42 also cover orchestration commands and placements inside when blocks', () => {
    const saga = {
      name: 'P',
      trigger: 'Go',
      states: [],
      commands: [
        {
          name: 'Go',
          causes: ['Manual'],
          preconditions: [{ name: 'Only', description: 'd', causes: ['Manual'] }],
        },
      ],
    };
    const base = ir({ sagas: [saga] });
    const model = {
      ...base,
      flows: [
        {
          name: 'F',
          lanes: [],
          connections: [],
          moments: [
            {
              id: 'm0',
              name: 'M',
              contextEntries: [],
              branches: [{ condition: 'c', entries: [{ nodeName: 'Go', nodeKind: 'command' }] }],
            },
          ],
        },
      ],
    } as unknown as IntermediateRepresentation;
    expect(rules(model)).toEqual(['V42']);
  });
});

// ADR-040 V43: a same-moment triggered-by is a hop a policy declares.
describe('V43 same-moment hops', () => {
  const policy = (name: string, trigger: string, chainsTo: string): Loose => ({
    name,
    trigger,
    chainsTo,
    action: 'a',
  });
  const model = (
    moments: Loose[],
    connections: Loose[],
    policies: Loose[] = [policy('ReserveOnOrder', 'OrderPlaced', 'TakePayment')],
  ): IntermediateRepresentation =>
    ({
      ...ir({ policies }),
      flows: [{ name: 'F', lanes: [], moments, connections }],
    }) as unknown as IntermediateRepresentation;
  const moment = (id: string, ...names: string[]): Loose => ({
    id,
    name: id,
    contextEntries: names.map((nodeName) => ({ nodeName, nodeKind: 'event' })),
  });
  const trig = (momentId: string, cause: string, node: string): Loose => ({
    connectionType: 'triggered-by',
    sourceMomentId: momentId,
    sourceNodeName: cause,
    targetNodeName: node,
  });

  it('accepts (a): the policy is triggered by the event placed earlier in the moment', () => {
    const r = model(
      [moment('m0', 'OrderPlaced', 'ReserveOnOrder')],
      [trig('m0', 'OrderPlaced', 'ReserveOnOrder')],
    );
    expect(rules(r)).toEqual([]);
  });

  it('accepts (b): the command is the one the policy chains to', () => {
    const r = model(
      [moment('m0', 'OrderPlaced', 'ReserveOnOrder', 'TakePayment')],
      [trig('m0', 'ReserveOnOrder', 'TakePayment')],
    );
    expect(rules(r)).toEqual([]);
  });

  it('accepts (c): a command that a policy triggered by the event chains to', () => {
    const r = model(
      [moment('m0', 'OrderPlaced', 'TakePayment')],
      [trig('m0', 'OrderPlaced', 'TakePayment')],
    );
    expect(rules(r)).toEqual([]);
  });

  it('refuses a hop no policy declares', () => {
    const r = model(
      [moment('m0', 'PaymentTaken', 'ReserveOnOrder')],
      [trig('m0', 'PaymentTaken', 'ReserveOnOrder')],
    );
    expect(messages(r)).toEqual([
      "Flow 'F' moment 'm0': 'ReserveOnOrder' is triggered-by 'PaymentTaken' in the same moment, but no policy declares that hop.",
    ]);
  });

  it('refuses a command chained from a different event', () => {
    const r = model(
      [moment('m0', 'PaymentTaken', 'TakePayment')],
      [trig('m0', 'PaymentTaken', 'TakePayment')],
    );
    expect(rules(r)).toEqual(['V43']);
  });

  it('does not check a triggered-by whose cause sits in a prior moment', () => {
    const r = model(
      [moment('m0', 'PaymentTaken'), moment('m1', 'ReserveOnOrder')],
      [trig('m1', 'PaymentTaken', 'ReserveOnOrder')],
    );
    expect(rules(r)).toEqual([]);
  });

  it('does not check a target the model does not declare (a single file without the project)', () => {
    const r = model([moment('m0', 'A', 'B')], [trig('m0', 'A', 'B')], []);
    expect(rules(r)).toEqual([]);
  });

  it('looks into when blocks for the moment and the cause', () => {
    const r = model(
      [
        {
          id: 'm0',
          name: 'm0',
          contextEntries: [{ nodeName: 'OrderPlaced', nodeKind: 'event' }],
          branches: [
            { condition: 'ok', entries: [{ nodeName: 'ReserveOnOrder', nodeKind: 'policy' }] },
          ],
        },
      ],
      [trig('m0', 'OrderPlaced', 'ReserveOnOrder')],
    );
    expect(rules(r)).toEqual([]);
  });

  it('stays quiet for IR with no flow connections', () => {
    expect(rules(ir({}))).toEqual([]);
  });
});
