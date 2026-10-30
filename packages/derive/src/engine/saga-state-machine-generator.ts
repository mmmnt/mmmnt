import type { IntermediateRepresentation, SagaDefinition } from '@mmmnt/core';

export interface SagaStateMachine {
  readonly sagaName: string;
  readonly context: string;
  readonly initialState: string;
  readonly finalState: string;
  readonly states: readonly SagaState[];
  readonly transitions: readonly SagaTransition[];
  readonly compensation: string;
  readonly timeout: string;
  readonly reachability: {
    readonly allReachable: boolean;
    readonly unreachableStates: readonly string[];
  };
}

export interface SagaState {
  readonly name: string;
  readonly isInitial: boolean;
  readonly isFinal: boolean;
}

export interface SagaTransition {
  readonly from: string;
  readonly to: string;
  /** Domain event that fires this transition (`-> To on Event` in the spec).
   *  Omitted when the spec declares no mapping — never invented. */
  readonly onEvent?: string;
}

export function generateSagaStateMachines(ir: IntermediateRepresentation): SagaStateMachine[] {
  const machines: SagaStateMachine[] = [];

  for (const context of ir.contexts) {
    for (const saga of context.sagas) {
      const machine = buildStateMachine(saga, context.name);
      machines.push(machine);
    }
  }

  return machines;
}

function buildStateMachine(saga: SagaDefinition, contextName: string): SagaStateMachine {
  const sagaStates = saga.states;
  const initialState = sagaStates.length > 0 ? sagaStates[0] : '';
  const finalState = sagaStates.length > 0 ? sagaStates[sagaStates.length - 1] : '';

  const states = buildStates(sagaStates, initialState, finalState);
  const transitions = buildTransitions(saga);
  const reachability = computeReachability(states, transitions, initialState);

  // Audit fix #8: earlyExitStates was invented — the IR carries no basis for
  // early-exit semantics (SagaDefinition has only trigger/states/compensation/
  // timeout), so the field is omitted rather than fabricated.
  return {
    sagaName: saga.name,
    context: contextName,
    initialState,
    finalState,
    states,
    transitions,
    compensation: saga.compensation,
    timeout: saga.timeout,
    reachability,
  };
}

function buildStates(
  stateNames: readonly string[],
  initialState: string,
  finalState: string,
): SagaState[] {
  return stateNames.map((name) => ({
    name,
    isInitial: name === initialState,
    isFinal: name === finalState,
  }));
}

function buildTransitions(saga: SagaDefinition): SagaTransition[] {
  // M-S6: the IR's transitions carry the declared `on <Event>` mapping when
  // the spec binds a transition to a domain event — emit it verbatim.
  if (saga.transitions) {
    return saga.transitions.map((t) => ({
      from: t.from,
      to: t.to,
      ...(t.onEvent !== undefined ? { onEvent: t.onEvent } : {}),
    }));
  }

  // Hand-built IR without transitions: derive the unmapped chain from the
  // flat states list (historical shape, no onEvent).
  const stateNames = saga.states;
  const transitions: SagaTransition[] = [];
  for (let i = 0; i < stateNames.length - 1; i++) {
    transitions.push({
      from: stateNames[i],
      to: stateNames[i + 1],
    });
  }
  return transitions;
}

function computeReachability(
  states: readonly SagaState[],
  transitions: readonly SagaTransition[],
  initialState: string,
): { readonly allReachable: boolean; readonly unreachableStates: readonly string[] } {
  if (states.length === 0) {
    return { allReachable: true, unreachableStates: [] };
  }

  const adjacency = new Map<string, string[]>();
  for (const t of transitions) {
    const neighbors = adjacency.get(t.from) ?? [];
    neighbors.push(t.to);
    adjacency.set(t.from, neighbors);
  }

  const reachable = bfsReachable(initialState, adjacency);
  const unreachableStates = states.filter((s) => !reachable.has(s.name)).map((s) => s.name);

  return {
    allReachable: unreachableStates.length === 0,
    unreachableStates,
  };
}

function bfsReachable(
  start: string,
  adjacency: ReadonlyMap<string, readonly string[]>,
): Set<string> {
  const visited = new Set<string>();
  const queue: string[] = [start];
  visited.add(start);

  while (queue.length > 0) {
    const current = queue.shift()!;
    const neighbors = adjacency.get(current) ?? [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
  }

  return visited;
}
