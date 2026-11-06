/**
 * ADR-038 — palette conformance checks V29–V37 (and ADR-040's V40–V43) over an IR.
 *
 * Like V22–V28 they compare names across declarations: advisories per file, errors over a merged
 * project. Hand-built IR that predates ADR-038 carries no orchestration fields and is not checked
 * for them.
 */
import type {
  ConnectionDefinition,
  ContextDefinition,
  GatewayDefinition,
  IntermediateRepresentation,
  IssuedCommandDefinition,
  MomentEntry,
  PreconditionDefinition,
  SagaDefinition,
} from '../ir/index.js';
import { emittedEvents } from '../ir/emits.js';
import { validateMultiEvent, type Finding as MultiEventFinding } from './multi-event.js';

/**
 * A finding carries its own severity only when the rule can decide on what the IR holds; without one the
 * caller's severity applies (a warning per file, an error over a merged project).
 */
type Finding = MultiEventFinding;

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
  const ownEvents = new Set((saga.events ?? []).map((e) => e.name));
  const compensations = saga.compensations ?? [];
  return [
    ...saga.commands.flatMap((c) =>
      emittedEvents(c)
        .filter((e) => !ownEvents.has(e))
        .map((e) => ({
          ruleId: 'V31',
          message: `Orchestration '${saga.name}' command '${c.name}' emits '${e}', which the orchestration does not declare; it emits only its own events.`,
        })),
    ),
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

/**
 * V40 (ADR-040): an event is declared by one owner, an aggregate or an orchestration. Only names that
 * a process event declares are checked, so IR that predates ADR-040 stays quiet.
 */
function v40(ctx: ContextDefinition): Finding[] {
  const owners = new Map<string, string[]>();
  const add = (event: string, owner: string): void => {
    owners.set(event, [...(owners.get(event) ?? []), owner]);
  };
  for (const agg of ctx.aggregates)
    for (const e of agg.events ?? []) add(e.name, `aggregate '${agg.name}'`);
  const processNames = new Set<string>();
  for (const saga of ctx.sagas)
    for (const e of saga.events ?? []) {
      add(e.name, `orchestration '${saga.name}'`);
      processNames.add(e.name);
    }
  return [...owners]
    .filter(([name, who]) => processNames.has(name) && who.length > 1)
    .map(([name, who]) => ({
      ruleId: 'V40',
      message: `Event '${name}' is declared by ${who.join(' and ')}; an event has one owner.`,
    }));
}

interface CauseCommand {
  name: string;
  causes?: string[];
  preconditions?: PreconditionDefinition[];
}

function allCommands(ir: IntermediateRepresentation): CauseCommand[] {
  return ir.contexts.flatMap((c) => [...c.commands, ...c.sagas.flatMap((s) => s.commands ?? [])]);
}

/** V41 on the declarations: a precondition's cause is one the command declares. */
function v41Declarations(commands: CauseCommand[]): Finding[] {
  return commands.flatMap((cmd) =>
    (cmd.preconditions ?? []).flatMap((pre) =>
      (pre.causes ?? [])
        .filter((cause) => !(cmd.causes ?? []).includes(cause))
        .map((cause) => ({
          ruleId: 'V41',
          message: `Precondition '${pre.name}' of command '${cmd.name}' names cause '${cause}', which the command does not declare.`,
        })),
    ),
  );
}

function placementCauseFindings(
  flowName: string,
  entry: MomentEntry,
  cmd: CauseCommand,
): Finding[] {
  if (entry.cause !== undefined) {
    return (cmd.causes ?? []).includes(entry.cause)
      ? []
      : [
          {
            ruleId: 'V41',
            message: `Flow '${flowName}' places '${cmd.name}' for cause '${entry.cause}', which the command does not declare.`,
          },
        ];
  }
  const scoped = (cmd.preconditions ?? []).some((p) => (p.causes ?? []).length > 0);
  return (cmd.causes ?? []).length > 0 && scoped
    ? [
        {
          ruleId: 'V42',
          message: `Flow '${flowName}' places '${cmd.name}' without a cause, but the command has cause-scoped preconditions.`,
        },
      ]
    : [];
}

/** V41 and V42 on the placements of every flow. */
function v41v42Placements(ir: IntermediateRepresentation, commands: CauseCommand[]): Finding[] {
  const byName = new Map(commands.map((c) => [c.name, c]));
  return (ir.flows ?? []).flatMap((flow) =>
    flow.moments.flatMap((moment) =>
      [...moment.contextEntries, ...(moment.branches ?? []).flatMap((b) => b.entries)].flatMap(
        (entry) => {
          const cmd = byName.get(entry.nodeName);
          return cmd === undefined ? [] : placementCauseFindings(flow.name, entry, cmd);
        },
      ),
    ),
  );
}

interface SameMomentTrigger {
  readonly cause: string;
  readonly node: string;
  readonly momentName: string;
}

interface MomentNames {
  readonly name: string;
  /** The nodes this moment places that no earlier moment placed. */
  readonly names: Set<string>;
}

/** The `triggered-by` connections whose cause sits in the same moment as the node, and whose node the model declares. */
function sameMomentTrigger(
  conn: ConnectionDefinition,
  sameMoment: Map<string, MomentNames>,
  known: Set<string>,
): SameMomentTrigger[] {
  const { sourceNodeName: cause, targetNodeName: node } = conn;
  if (conn.connectionType !== 'triggered-by' || cause === undefined || node === undefined)
    return [];
  const moment = sameMoment.get(conn.sourceMomentId);
  if (!known.has(node) || !moment?.names.has(cause)) return [];
  return [{ cause, node, momentName: moment.name }];
}

/**
 * V43 (ADR-040 D4): a `triggered-by` whose cause is placed in the same moment, and in no earlier one, is
 * a hop a policy declares: (a) event -> the policy it triggers, (b) policy -> the command it chains to,
 * (c) event -> a command that a policy triggered by the event chains to. A target the model does not
 * declare is not checked.
 *
 * Severity follows what the IR can decide. In (a) the node is a policy and in (b) the cause is a policy,
 * so the declaration that would support the hop is the policy's own and the IR holds it: a refusal is an
 * error. In (c) the supporting policy is any policy triggered by the event, and it may be declared in a
 * file the IR does not include: a refusal is left to the caller (an advisory per file, an error over a
 * merged project).
 */
function v43(ir: IntermediateRepresentation): Finding[] {
  const policies = ir.contexts.flatMap((c) => c.policies);
  const policyNames = new Set(policies.map((p) => p.name));
  const known = new Set([
    ...policyNames,
    ...ir.contexts.flatMap((c) => [
      ...c.commands.map((m) => m.name),
      ...c.events.map((e) => e.name),
      ...c.sagas.flatMap((s) => (s.commands ?? []).map((m) => m.name)),
    ]),
  ]);
  const declared = (t: SameMomentTrigger): boolean =>
    policies.some(
      (p) =>
        (p.name === t.node && p.trigger === t.cause) ||
        (p.name === t.cause && p.chainsTo === t.node) ||
        (p.trigger === t.cause && p.chainsTo === t.node),
    );
  return (ir.flows ?? []).flatMap((flow) => {
    const earlier = new Set<string>();
    const sameMoment = new Map<string, MomentNames>();
    for (const moment of flow.moments) {
      const names = [
        ...moment.contextEntries,
        ...(moment.branches ?? []).flatMap((b) => b.entries),
      ].map((e) => e.nodeName);
      sameMoment.set(moment.id, {
        name: moment.name,
        names: new Set(names.filter((n) => !earlier.has(n))),
      });
      names.forEach((n) => earlier.add(n));
    }
    return flow.connections
      .flatMap((conn) => sameMomentTrigger(conn, sameMoment, known))
      .filter((t) => !declared(t))
      .map((t) => ({
        ruleId: 'V43',
        message: `Flow '${flow.name}' moment '${t.momentName}': '${t.node}' is triggered-by '${t.cause}' in the same moment, but no policy declares that hop.`,
        ...(policyNames.has(t.node) || policyNames.has(t.cause)
          ? { severity: 'error' as const }
          : {}),
      }));
  });
}

/** Every V29–V37 finding of an IR, in declaration order. Severity is the caller's (see the module comment). */
export function validatePaletteConformance(
  ir: IntermediateRepresentation,
  options: { readonly merged?: boolean } = {},
): Finding[] {
  const known = namesOf(ir);
  const commands = allCommands(ir);
  return [
    ...ir.contexts.flatMap((ctx) => [
      ...v29v30(ctx, known),
      ...ctx.sagas.flatMap((saga) => orchestrationFindings(saga, known)),
      ...v36(ctx),
      ...v37(ctx, known),
      ...v40(ctx),
    ]),
    ...v41Declarations(commands),
    ...v41v42Placements(ir, commands),
    ...v43(ir),
    ...validateMultiEvent(ir, options),
    ...(ir.externals ?? []).flatMap((e) =>
      gatewayFindings(`external '${e.name}'`, e.gateways ?? [], known),
    ),
  ];
}
