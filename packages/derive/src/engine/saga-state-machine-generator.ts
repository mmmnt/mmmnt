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
  readonly earlyExitStates: readonly string[];
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
  const transitions = buildTransitions(sagaStates);
  const reachability = computeReachability(states, transitions, initialState);

  // States where the saga can be preempted by a successful conversion
  // on the happy path (any state that's not initial or final).
  const earlyExitStates = sagaStates.filter((s) => s !== initialState && s !== finalState);

  return {
    sagaName: saga.name,
    context: contextName,
    initialState,
    finalState,
    states,
    transitions,
    compensation: saga.compensation,
    timeout: saga.timeout,
    earlyExitStates,
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

function buildTransitions(stateNames: readonly string[]): SagaTransition[] {
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
