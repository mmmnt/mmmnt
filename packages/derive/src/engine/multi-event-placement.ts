/**
 * ADR-041 D6 — which placed events belong to one placement of a multi-event command.
 *
 * The flow is the authority on what a scenario shows (the simulation never injects events), so a
 * command's events are the ones the flow places after it, in its moment, before the next command of
 * its lane. This module only reads that attribution; the scenario generator uses it to give those
 * events the command step as their cause and its timestamp, and to name the state that decides the
 * outcome the path shows.
 */
import type { CommandDefinition, OrchestrationCommandDefinition } from '@mmmnt/core';
import { emitOutcomes, emittedEvents, matchEmitOutcome } from '@mmmnt/core';

type AnyCommand = CommandDefinition | OrchestrationCommandDefinition;

/** The part of a walked node that attribution reads. */
export interface PlacedStep {
  readonly nodeName: string;
  readonly contextId: string;
  readonly momentId: string;
}

export interface Placement {
  /** Index of the command step. */
  readonly command: number;
  /** Indices of the event steps the flow places for it, in path order. */
  readonly events: readonly number[];
  /** The state that decides the outcome the path shows, when that outcome declares one. */
  readonly whenState?: string;
}

/** Every placement of a command that records more than one distinct event, along one path. */
export function multiEventPlacements(
  steps: readonly PlacedStep[],
  commandOf: (step: PlacedStep) => AnyCommand | undefined,
): Placement[] {
  return steps.flatMap((step, j): Placement[] => {
    const command = commandOf(step);
    if (command === undefined || emittedEvents(command).length < 2) return [];
    const emitted = new Set(emittedEvents(command));
    const events: number[] = [];
    for (let k = j + 1; k < steps.length; k++) {
      const next = steps[k];
      if (next.momentId !== step.momentId) break;
      if (commandOf(next) !== undefined) {
        if (next.contextId === step.contextId) break;
      } else if (emitted.has(next.nodeName)) events.push(k);
    }
    const outcomes = emitOutcomes(command);
    const i = matchEmitOutcome(
      outcomes,
      events.map((k) => steps[k].nodeName),
    );
    const whenState = i === -1 ? undefined : outcomes[i].whenState;
    return [{ command: j, events, ...(whenState === undefined ? {} : { whenState }) }];
  });
}
