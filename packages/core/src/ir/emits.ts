import type { EmitOutcomeDefinition } from './context-definition.js';

/** The fields of a command, aggregate or orchestration, that say what it emits (ADR-041 D3). */
export interface EmitsFields {
  readonly emitsEvent?: string | undefined;
  readonly outcomes?: readonly EmitOutcomeDefinition[] | undefined;
}

/**
 * Every outcome a command can record (ADR-041 D3): `outcomes` when the clause was not the plain
 * single form, else the one-event outcome built from `emitsEvent` (so hand-built IR that sets only
 * `emitsEvent` reads as a single outcome), else none (an orchestration command that emits nothing).
 */
export function emitOutcomes(cmd: EmitsFields): EmitOutcomeDefinition[] {
  if (cmd.outcomes !== undefined) return cmd.outcomes.map((o) => ({ ...o, events: [...o.events] }));
  return cmd.emitsEvent ? [{ events: [cmd.emitsEvent] }] : [];
}

/** Every distinct event the command can record, in declaration order (ADR-041 D3). */
export function emittedEvents(cmd: EmitsFields): string[] {
  return [...new Set(emitOutcomes(cmd).flatMap((o) => o.events))];
}

/**
 * Which outcome the events a flow places after one placement of the command record (ADR-041 V47, D6):
 * the outcome whose events are exactly those, else the first outcome that holds them all, else -1.
 */
export function matchEmitOutcome(
  outcomes: readonly EmitOutcomeDefinition[],
  placed: readonly string[],
): number {
  const exact = outcomes.findIndex(
    (o) => o.events.length === placed.length && placed.every((e) => o.events.includes(e)),
  );
  return exact !== -1
    ? exact
    : outcomes.findIndex((o) => placed.every((e) => o.events.includes(e)));
}
