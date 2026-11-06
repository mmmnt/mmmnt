/**
 * ADR-041 — commands that record one or more events: V44–V48 over an IR, and the helper V31 and V38 use.
 *
 * - V44  a command that records several events records only its own aggregate's events.
 * - V45  an event is listed once inside one outcome.
 * - V46  a `when <State>` guard names a declared state, no two outcomes share one, and a command guards
 *        every outcome or none (an unguarded choice between outcomes is an advisory).
 * - V47  the events a flow places after one placement of a multi-event command come from one outcome
 *        (advisory when the flow places only part of the outcome).
 * - V48  an outcome that no flow places (a merged project only, advisory).
 *
 * Like V22–V43 they compare names across declarations. Hand-built IR that predates the ADR carries no
 * `outcomes` and, for V44, no owning aggregate, and stays quiet.
 */
import type {
  AggregateDefinition,
  ContextDefinition,
  Diagnostic,
  EmitOutcomeDefinition,
  IntermediateRepresentation,
  MomentDefinition,
  MomentEntry,
  OrchestrationCommandDefinition,
  CommandDefinition,
  SagaDefinition,
} from '../ir/index.js';
import { emitOutcomes, emittedEvents, matchEmitOutcome } from '../ir/emits.js';

export type Finding = Pick<Diagnostic, 'message' | 'ruleId'> & {
  readonly severity?: 'error' | 'warning';
};

type AnyCommand = CommandDefinition | OrchestrationCommandDefinition;

/** A command with the declaration that owns it: an aggregate, or an orchestration. */
interface Owned {
  readonly command: AnyCommand;
  readonly aggregate?: AggregateDefinition;
  readonly saga?: SagaDefinition;
}

function ownedCommands(ctx: ContextDefinition): Owned[] {
  return [
    ...ctx.aggregates.flatMap((aggregate) =>
      (aggregate.commands ?? []).map((command) => ({ command, aggregate })),
    ),
    ...ctx.sagas.flatMap((saga) => (saga.commands ?? []).map((command) => ({ command, saga }))),
  ];
}

/** The states an aggregate or an orchestration declares; undefined when the owner cannot say. */
function declaredStates({ aggregate, saga }: Owned): Set<string> {
  if (aggregate !== undefined) {
    const s = aggregate.states;
    return new Set(
      s === undefined
        ? []
        : [
            ...s.initials,
            ...(s.initial ? [s.initial] : []),
            ...s.transitions.flatMap((t) => [t.from, t.to]),
          ],
    );
  }
  return new Set(saga?.states ?? []);
}

const textOf = (o: EmitOutcomeDefinition): string => o.events.join(', ');

/** V44: a command that records more than one distinct event records only events its aggregate declares. */
function v44(ctx: ContextDefinition): Finding[] {
  const known = new Set(ctx.events.map((e) => e.name));
  return ctx.aggregates.flatMap((agg) =>
    (agg.commands ?? [])
      .filter((c) => emittedEvents(c).length > 1)
      .flatMap((c) =>
        emittedEvents(c)
          .filter((e) => known.has(e) && !(agg.events ?? []).some((own) => own.name === e))
          .map((e) => ({
            ruleId: 'V44',
            message: `Command '${c.name}' emits '${e}', which aggregate '${agg.name}' does not declare; a command that records more than one event records only its own aggregate's events.`,
          })),
      ),
  );
}

/** V45: an event is listed at most once inside one outcome. */
function v45(ctx: ContextDefinition): Finding[] {
  return ownedCommands(ctx).flatMap(({ command }) =>
    emitOutcomes(command).flatMap((o) =>
      [...new Set(o.events.filter((e, i) => o.events.indexOf(e) !== i))].map((e) => ({
        ruleId: 'V45',
        message: `Command '${command.name}' lists '${e}' twice in one outcome.`,
      })),
    ),
  );
}

const v46Error = (message: string): Finding => ({ ruleId: 'V46', message, severity: 'error' });

/** V46 (a): a guard names a state the owner declares. */
function undeclaredGuards(owned: Owned, outcomes: EmitOutcomeDefinition[]): Finding[] {
  const declared = declaredStates(owned);
  const ownerText = owned.aggregate
    ? `aggregate '${owned.aggregate.name}'`
    : `orchestration '${owned.saga?.name ?? ''}'`;
  return outcomes
    .filter((o) => o.whenState !== undefined && !declared.has(o.whenState))
    .map((o) =>
      v46Error(
        `Command '${owned.command.name}' records '${textOf(o)}' when '${o.whenState ?? ''}', which is no state ${ownerText} declares.`,
      ),
    );
}

/** V46 (b): no two outcomes carry one state. */
function sharedGuards(name: string, guarded: EmitOutcomeDefinition[]): Finding[] {
  const states = guarded.map((o) => o.whenState ?? '');
  return [...new Set(states.filter((s, i) => states.indexOf(s) !== i))].map((s) =>
    v46Error(`Command '${name}' has two outcomes recorded when '${s}'.`),
  );
}

/** V46 (c) and the advisory: every outcome carries a guard, or none does. */
function guardCoverage(
  name: string,
  outcomes: EmitOutcomeDefinition[],
  guarded: number,
): Finding[] {
  if (guarded === 0)
    return [
      {
        ruleId: 'V46',
        severity: 'warning',
        message: `The choice between the outcomes of '${name}' is not declared; name the state that decides each with 'when <State>'.`,
      },
    ];
  return guarded === outcomes.length
    ? []
    : [
        v46Error(
          `Command '${name}' guards ${guarded} of its ${outcomes.length} outcomes with 'when'; guard every outcome or none.`,
        ),
      ];
}

/** V46: the guard of an outcome. */
function v46(ctx: ContextDefinition): Finding[] {
  return ownedCommands(ctx).flatMap((owned) => {
    const { name } = owned.command;
    const outcomes = emitOutcomes(owned.command);
    const guarded = outcomes.filter((o) => o.whenState !== undefined);
    return [
      ...undeclaredGuards(owned, outcomes),
      ...(outcomes.length < 2
        ? []
        : [...sharedGuards(name, guarded), ...guardCoverage(name, outcomes, guarded.length)]),
    ];
  });
}

// --- Flow placements (V47, V48) ---------------------------------------------------------------------

/** The linear paths through a moment: its main entries, and for each `when` block the entries before it plus its own. */
function momentPaths(moment: MomentDefinition): MomentEntry[][] {
  const main = moment.contextEntries;
  const branches = moment.branches ?? [];
  if (moment.sequence === undefined) return [main, ...branches.map((b) => [...main, ...b.entries])];
  const paths: MomentEntry[][] = [main];
  for (const item of moment.sequence) {
    if (item.kind !== 'branch') continue;
    const before = moment.sequence
      .slice(0, moment.sequence.indexOf(item))
      .flatMap((i) => (i.kind === 'entry' ? [main[i.index]] : []));
    paths.push([...before, ...(branches[item.index]?.entries ?? [])]);
  }
  return paths;
}

interface Placement {
  readonly flow: string;
  readonly moment: string;
  readonly command: AnyCommand;
  /** The distinct events the flow places after the command and before the next command of its lane. */
  readonly placed: string[];
}

function placementsIn(
  flow: string,
  moment: MomentDefinition,
  commands: Map<string, AnyCommand>,
): Placement[] {
  return momentPaths(moment).flatMap((path) =>
    path.flatMap((entry, i) => {
      const command = entry.nodeKind === 'command' ? commands.get(entry.nodeName) : undefined;
      if (command === undefined) return [];
      const emitted = new Set(emittedEvents(command));
      const next = path.findIndex(
        (e, j) => j > i && e.nodeKind === 'command' && e.contextId === entry.contextId,
      );
      const following = path.slice(i + 1, next === -1 ? undefined : next);
      const placed = [
        ...new Set(
          following
            .filter((e) => e.nodeKind === 'event' && emitted.has(e.nodeName))
            .map((e) => e.nodeName),
        ),
      ];
      return placed.length === 0 ? [] : [{ flow, moment: moment.name, command, placed }];
    }),
  );
}

function placements(ir: IntermediateRepresentation): Placement[] {
  const commands = new Map<string, AnyCommand>();
  for (const ctx of ir.contexts)
    for (const { command } of ownedCommands(ctx))
      if (emittedEvents(command).length > 1 && !commands.has(command.name))
        commands.set(command.name, command);
  if (commands.size === 0) return [];
  const seen = new Set<string>();
  return (ir.flows ?? [])
    .flatMap((flow) => flow.moments.flatMap((m) => placementsIn(flow.name, m, commands)))
    .filter((p) => {
      const key = `${p.flow}\u0000${p.moment}\u0000${p.command.name}\u0000${p.placed.join(',')}`;
      return seen.has(key) ? false : (seen.add(key), true);
    });
}

function v47(placed: Placement[]): Finding[] {
  return placed.flatMap((p): Finding[] => {
    const outcomes = emitOutcomes(p.command);
    const where = `Flow '${p.flow}' moment '${p.moment}'`;
    const i = matchEmitOutcome(outcomes, p.placed);
    if (i === -1)
      return [
        {
          ruleId: 'V47',
          message: `${where}: ${p.placed.map((e) => `'${e}'`).join(', ')} follow one placement of '${p.command.name}' but no single outcome of it records them together; its outcomes are alternatives.`,
        },
      ];
    const missing = outcomes[i].events.filter((e) => !p.placed.includes(e));
    return missing.length === 0
      ? []
      : [
          {
            ruleId: 'V47',
            severity: 'warning',
            message: `${where}: outcome '${textOf(outcomes[i])}' of '${p.command.name}' records ${missing.map((e) => `'${e}'`).join(', ')} together with ${p.placed.map((e) => `'${e}'`).join(', ')}; the flow places ${p.placed.map((e) => `'${e}'`).join(', ')} only.`,
          },
        ];
  });
}

/** V48: over a merged project, an outcome of a command with alternatives that no flow places. */
function v48(ir: IntermediateRepresentation, placed: Placement[]): Finding[] {
  const reached = new Map<AnyCommand, Set<number>>();
  for (const p of placed) {
    const i = matchEmitOutcome(emitOutcomes(p.command), p.placed);
    if (i !== -1) reached.set(p.command, (reached.get(p.command) ?? new Set()).add(i));
  }
  return ir.contexts.flatMap((ctx) =>
    ownedCommands(ctx)
      .filter(
        ({ command }) => emitOutcomes(command).length > 1 && emittedEvents(command).length > 1,
      )
      .flatMap(({ command }) =>
        emitOutcomes(command).flatMap((o, i) =>
          reached.get(command)?.has(i)
            ? []
            : [
                {
                  ruleId: 'V48',
                  severity: 'warning' as const,
                  message: `Outcome '${textOf(o)}' of command '${command.name}' is placed by no flow.`,
                },
              ],
        ),
      ),
  );
}

export interface MultiEventOptions {
  /** True over a merged project, where V48 can see every flow. */
  readonly merged?: boolean;
}

/** Every V44–V48 finding of an IR, in declaration order. Severity is the caller's unless the finding carries its own. */
export function validateMultiEvent(
  ir: IntermediateRepresentation,
  options: MultiEventOptions = {},
): Finding[] {
  const placed = placements(ir);
  return [
    ...ir.contexts.flatMap((ctx) => [...v44(ctx), ...v45(ctx), ...v46(ctx)]),
    ...v47(placed),
    ...(options.merged ? v48(ir, placed) : []),
  ];
}
