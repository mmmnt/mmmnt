import { describe, it, expect } from 'vitest';
import type {
  IntermediateRepresentation,
  ContextDefinition,
  SagaDefinition,
} from '@mmmnt/core';
import { generateSagaStateMachines } from '../saga-state-machine-generator.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMetadata() {
  return {
    name: 'test-spec',
    version: '1.0.0',
    description: 'Test specification',
    generatedAt: '2026-01-01T00:00:00Z',
  };
}

function makeIR(overrides: Partial<IntermediateRepresentation> = {}): IntermediateRepresentation {
  return {
    contexts: overrides.contexts ?? [],
    flows: overrides.flows ?? [],
    glossary: overrides.glossary ?? [],
    relationships: overrides.relationships ?? [],
    metadata: overrides.metadata ?? makeMetadata(),
  };
}

function makeContext(
  id: string,
  name: string,
  sagas: SagaDefinition[] = [],
): ContextDefinition {
  return {
    id,
    name,
    classification: 'Core',
    aggregates: [],
    domainServices: [],
    commands: [],
    events: [],
    policies: [],
    sagas,
    valueObjects: [],
    invariants: [],
  };
}

function makeSaga(overrides: Partial<SagaDefinition> = {}): SagaDefinition {
  return {
    id: overrides.id ?? 'saga-1',
    name: overrides.name ?? 'OrderFulfillment',
    trigger: overrides.trigger ?? 'OrderPlaced',
    states: overrides.states ?? ['Pending', 'Processing', 'Completed'],
    compensation: overrides.compensation ?? 'CancelOrder',
    timeout: overrides.timeout ?? '30m',
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SagaStateMachineGenerator', () => {
  it('generates a state machine from a saga definition', () => {
    const saga = makeSaga();
    const ctx = makeContext('ctx-1', 'Ordering', [saga]);
    const ir = makeIR({ contexts: [ctx] });

    const machines = generateSagaStateMachines(ir);

    expect(machines).toHaveLength(1);
    const machine = machines[0];
    expect(machine.sagaName).toBe('OrderFulfillment');
    expect(machine.context).toBe('Ordering');
    expect(machine.initialState).toBe('Pending');
    expect(machine.finalState).toBe('Completed');
    expect(machine.compensation).toBe('CancelOrder');
    expect(machine.timeout).toBe('30m');
  });

  it('builds states with correct isInitial and isFinal flags', () => {
    const saga = makeSaga({ states: ['Init', 'Middle', 'End'] });
    const ctx = makeContext('ctx-1', 'Ordering', [saga]);
    const ir = makeIR({ contexts: [ctx] });

    const machines = generateSagaStateMachines(ir);
    const states = machines[0].states;

    expect(states).toHaveLength(3);
    expect(states[0]).toEqual({ name: 'Init', isInitial: true, isFinal: false });
    expect(states[1]).toEqual({ name: 'Middle', isInitial: false, isFinal: false });
    expect(states[2]).toEqual({ name: 'End', isInitial: false, isFinal: true });
  });

  it('builds transitions from consecutive state pairs', () => {
    const saga = makeSaga({ states: ['A', 'B', 'C', 'D'] });
    const ctx = makeContext('ctx-1', 'Ordering', [saga]);
    const ir = makeIR({ contexts: [ctx] });

    const machines = generateSagaStateMachines(ir);
    const transitions = machines[0].transitions;

    expect(transitions).toHaveLength(3);
    expect(transitions[0]).toEqual({ from: 'A', to: 'B' });
    expect(transitions[1]).toEqual({ from: 'B', to: 'C' });
    expect(transitions[2]).toEqual({ from: 'C', to: 'D' });
  });

  it('reports all states reachable from initial state', () => {
    const saga = makeSaga({ states: ['Pending', 'Processing', 'Completed'] });
    const ctx = makeContext('ctx-1', 'Ordering', [saga]);
    const ir = makeIR({ contexts: [ctx] });

    const machines = generateSagaStateMachines(ir);
    const reachability = machines[0].reachability;

    expect(reachability.allReachable).toBe(true);
    expect(reachability.unreachableStates).toHaveLength(0);
  });

  it('handles a single-state saga', () => {
    const saga = makeSaga({ states: ['Only'] });
    const ctx = makeContext('ctx-1', 'Ordering', [saga]);
    const ir = makeIR({ contexts: [ctx] });

    const machines = generateSagaStateMachines(ir);
    const machine = machines[0];

    expect(machine.initialState).toBe('Only');
    expect(machine.finalState).toBe('Only');
    expect(machine.states).toHaveLength(1);
    expect(machine.states[0]).toEqual({ name: 'Only', isInitial: true, isFinal: true });
    expect(machine.transitions).toHaveLength(0);
    expect(machine.reachability.allReachable).toBe(true);
  });

  it('includes compensation and timeout from saga definition', () => {
    const saga = makeSaga({ compensation: 'Rollback', timeout: '1h' });
    const ctx = makeContext('ctx-1', 'Ordering', [saga]);
    const ir = makeIR({ contexts: [ctx] });

    const machines = generateSagaStateMachines(ir);

    expect(machines[0].compensation).toBe('Rollback');
    expect(machines[0].timeout).toBe('1h');
  });

  it('no sagas produces empty array', () => {
    const ctx = makeContext('ctx-1', 'Ordering', []);
    const ir = makeIR({ contexts: [ctx] });

    const machines = generateSagaStateMachines(ir);

    expect(machines).toHaveLength(0);
  });

  it('empty IR produces empty array', () => {
    const ir = makeIR();

    const machines = generateSagaStateMachines(ir);

    expect(machines).toHaveLength(0);
  });

  it('generates machines from multiple contexts with sagas', () => {
    const saga1 = makeSaga({ id: 'saga-1', name: 'Saga1', states: ['A', 'B'] });
    const saga2 = makeSaga({ id: 'saga-2', name: 'Saga2', states: ['X', 'Y', 'Z'] });
    const ctx1 = makeContext('ctx-1', 'CtxA', [saga1]);
    const ctx2 = makeContext('ctx-2', 'CtxB', [saga2]);
    const ir = makeIR({ contexts: [ctx1, ctx2] });

    const machines = generateSagaStateMachines(ir);

    expect(machines).toHaveLength(2);
    expect(machines[0].sagaName).toBe('Saga1');
    expect(machines[0].context).toBe('CtxA');
    expect(machines[1].sagaName).toBe('Saga2');
    expect(machines[1].context).toBe('CtxB');
  });

  it('handles empty states array gracefully', () => {
    const saga = makeSaga({ states: [] });
    const ctx = makeContext('ctx-1', 'Ordering', [saga]);
    const ir = makeIR({ contexts: [ctx] });

    const machines = generateSagaStateMachines(ir);
    const machine = machines[0];

    expect(machine.initialState).toBe('');
    expect(machine.finalState).toBe('');
    expect(machine.states).toHaveLength(0);
    expect(machine.transitions).toHaveLength(0);
    expect(machine.reachability.allReachable).toBe(true);
  });
});
