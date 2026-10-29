/**
 * ADR-038 — palette conformance checks V29–V37 over an IR.
 *
 * Like V22–V28 they compare names across declarations: advisories per file, errors over a merged
 * project. Hand-built IR that predates ADR-038 carries no orchestration fields and is not checked
 * for them.
 */
import type {
  ContextDefinition,
  Diagnostic,
  GatewayDefinition,
  IntermediateRepresentation,
  IssuedCommandDefinition,
  SagaDefinition,
} from '../ir/index.js';

type Finding = Pick<Diagnostic, 'message' | 'ruleId'>;

interface Known {
  events: Set<string>;
  valueObjects: Set<string>;
  aggregateCommands: Set<string>;
  orchestrationCommands: Set<string>;
  externals: Set<string>;
  relayed: Set<string>;
}

function namesOf(ir: IntermediateRepresentation): Known {
  const contexts = ir.contexts;
  const sagas = contexts.flatMap((c) => c.sagas);
  return {
    events: new Set(contexts.flatMap((c) => c.events.map((e) => e.name))),
    valueObjects: new Set(contexts.flatMap((c) => c.valueObjects.map((v) => v.name))),
    aggregateCommands: new Set(contexts.flatMap((c) => c.commands.map((m) => m.name))),
    orchestrationCommands: new Set(sagas.flatMap((s) => (s.commands ?? []).map((m) => m.name))),
    externals: new Set((ir.externals ?? []).map((e) => e.name)),
    relayed: new Set(
      contexts.flatMap((c) => c.policies.flatMap((p) => (p.chainsTo ? [p.chainsTo] : []))),
    ),
  };
}

function v29v30(ctx: ContextDefinition, known: Known): Finding[] {
  return ctx.policies.flatMap((p) => [
    ...(p.chainsTo === undefined ||
    (!known.aggregateCommands.has(p.chainsTo) && !known.orchestrationCommands.has(p.chainsTo))
      ? [
          {
            ruleId: 'V29',
            message: `Policy '${p.name}' chains to '${p.chainsTo ?? ''}', which is no command of an aggregate or an orchestration.`,
          },
        ]
      : []),
    ...(!known.events.has(p.trigger)
      ? [
          {
            ruleId: 'V30',
            message: `Policy '${p.name}' is triggered by '${p.trigger}', which is no declared domain event.`,
          },
        ]
      : []),
  ]);
}

const issuedText = (c: IssuedCommandDefinition): string =>
  c.external ? `${c.external}.${c.name}` : c.name;

function unresolvedIssue(c: IssuedCommandDefinition, known: Known): boolean {
  return c.external ? !known.externals.has(c.external) : !known.aggregateCommands.has(c.name);
}

function issueFindings(
  saga: SagaDefinition,
  issued: IssuedCommandDefinition[],
  ruleId: string,
  known: Known,
): Finding[] {
  return issued
    .filter((c) => unresolvedIssue(c, known))
    .map((c) => ({
      ruleId,
      message: c.external
        ? `Orchestration '${saga.name}' issues '${issuedText(c)}', but '${c.external}' is no declared external.`
        : `Orchestration '${saga.name}' issues '${c.name}', which is no command of an aggregate.`,
    }));
}

function orchestrationFindings(saga: SagaDefinition, known: Known): Finding[] {
  if (saga.commands === undefined) return [];
  const own = new Set(saga.commands.map((c) => c.name));
  const compensations = saga.compensations ?? [];
  return [
    ...saga.commands
      .filter((c) => c.emitsEvent !== undefined)
      .map((c) => ({
        ruleId: 'V31',
        message: `Orchestration '${saga.name}' command '${c.name}' emits '${c.emitsEvent ?? ''}'; an orchestration generates no domain event.`,
      })),
    ...(own.has(saga.trigger)
      ? []
      : [
          {
            ruleId: 'V32',
            message: `Orchestration '${saga.name}' is invoked by '${saga.trigger}', which is none of its own commands.`,
          },
        ]),
    ...issueFindings(saga, saga.issues ?? [], 'V33', known),
    ...(saga.transitions ?? []).flatMap((t) => {
      if (t.onCommand === undefined) return [];
      if (!own.has(t.onCommand))
        return [
          {
            ruleId: 'V34',
            message: `Orchestration '${saga.name}' step ${t.from} -> ${t.to} is on '${t.onCommand}', which is none of its own commands.`,
          },
        ];
      return known.relayed.has(t.onCommand)
        ? []
        : [
            {
              ruleId: 'V34',
              message: `Orchestration '${saga.name}' step ${t.from} -> ${t.to} is on '${t.onCommand}', which no policy chains to.`,
            },
          ];
    }),
    ...(compensations.some((c) => c.none) && compensations.length > 1
      ? [
          {
            ruleId: 'V35',
            message: `Orchestration '${saga.name}' declares 'compensation none' beside other compensation lines.`,
          },
        ]
      : []),
    ...compensations.flatMap((c) =>
      c.none
        ? []
        : [
            ...(own.has(c.onCommand)
              ? []
              : [
                  {
                    ruleId: 'V35',
                    message: `Orchestration '${saga.name}' compensates on '${c.onCommand}', which is none of its own commands.`,
                  },
                ]),
            ...issueFindings(saga, c.issues, 'V35', known),
          ],
    ),
  ];
}

function v36(ctx: ContextDefinition): Finding[] {
  return ctx.aggregates.flatMap((agg) => {
    const states = agg.states;
    if (states === undefined) return [];
    const commands = new Set(agg.commands.map((c) => c.name));
    const out: Finding[] = [];
    if (states.initials.length !== 1)
      out.push({
        ruleId: 'V36',
        message: `Aggregate '${agg.name}' declares ${states.initials.length} initial states; exactly one is required.`,
      });
    for (const t of states.transitions.filter((t) => !commands.has(t.command)))
      out.push({
        ruleId: 'V36',
        message: `Aggregate '${agg.name}' moves ${t.from} -> ${t.to} on '${t.command}', which is none of its commands.`,
      });
    const reached = new Set(states.initial === undefined ? [] : [states.initial]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const t of states.transitions)
        if (reached.has(t.from) && !reached.has(t.to)) {
          reached.add(t.to);
          grew = true;
        }
    }
    const named = new Set(states.transitions.flatMap((t) => [t.from, t.to]));
    for (const s of [...named].filter((s) => !reached.has(s)))
      out.push({
        ruleId: 'V36',
        message: `Aggregate '${agg.name}' state '${s}' is not reachable from its initial state.`,
      });
    return out;
  });
}

function gatewayFindings(owner: string, gateways: GatewayDefinition[], known: Known): Finding[] {
  const io = new Set([...known.events, ...known.valueObjects]);
  return gateways.flatMap((g) =>
    (
      [
        ['consumes', g.consumes],
        ['produces', g.produces],
      ] as const
    )
      .filter(([, name]) => !io.has(name))
      .map(([verb, name]) => ({
        ruleId: 'V37',
        message: `Gateway '${g.name}' of ${owner} ${verb} '${name}', which is no declared event or value object.`,
      })),
  );
}

function v37(ctx: ContextDefinition, known: Known): Finding[] {
  return [
    ...(ctx.projections ?? []).flatMap((p) =>
      gatewayFindings(`projection '${p.name}'`, p.gateways ?? [], known),
    ),
    ...ctx.policies.flatMap((p) => gatewayFindings(`policy '${p.name}'`, p.gateways ?? [], known)),
    ...ctx.sagas.flatMap((s) =>
      gatewayFindings(`orchestration '${s.name}'`, s.gateways ?? [], known),
    ),
  ];
}

/** Every V29–V37 finding of an IR, in declaration order. Severity is the caller's (see the module comment). */
export function validatePaletteConformance(ir: IntermediateRepresentation): Finding[] {
  const known = namesOf(ir);
  return [
    ...ir.contexts.flatMap((ctx) => [
      ...v29v30(ctx, known),
      ...ctx.sagas.flatMap((saga) => orchestrationFindings(saga, known)),
      ...v36(ctx),
      ...v37(ctx, known),
    ]),
    ...(ir.externals ?? []).flatMap((e) =>
      gatewayFindings(`external '${e.name}'`, e.gateways ?? [], known),
    ),
  ];
}
