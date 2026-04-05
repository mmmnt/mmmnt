import { describe, it, expect } from 'vitest';
import type {
  IntermediateRepresentation,
  ContextDefinition,
  FlowDefinition,
  MomentDefinition,
  ConnectionDefinition,
  AggregateDefinition,
} from '@mmmnt/core';
import {
  generateSimulationScenario,
  generateAllScenarios,
  deriveNegativeScenarios,
} from '../simulation-scenario-generator.js';

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

function makeAggregate(overrides: Partial<AggregateDefinition> = {}): AggregateDefinition {
  return {
    id: overrides.id ?? 'agg-1',
    name: overrides.name ?? 'OrderAggregate',
    identityField: overrides.identityField ?? {
      name: 'id',
      type: 'UUID',
      isArray: false,
      required: true,
    },
    commands: overrides.commands ?? [],
    events: overrides.events ?? [],
    valueObjects: overrides.valueObjects ?? [],
    invariants: overrides.invariants ?? [],
  };
}

function makeContext(
  id: string,
  name: string,
  overrides: Partial<ContextDefinition> = {},
): ContextDefinition {
  return {
    id,
    name,
    classification: 'Core',
    aggregates: overrides.aggregates ?? [],
    domainServices: [],
    commands: overrides.commands ?? [],
    events: overrides.events ?? [],
    policies: [],
    sagas: overrides.sagas ?? [],
    valueObjects: [],
    invariants: [],
  };
}

function makeMoment(
  id: string,
  name: string,
  contextId: string,
  nodeName: string,
  nodeKind: 'command' | 'event' = 'command',
): MomentDefinition {
  return {
    id,
    name,
    contextEntries: [{ contextId, nodeName, nodeKind }],
  };
}

function makeFlow(
  id: string,
  name: string,
  moments: MomentDefinition[],
  connections: ConnectionDefinition[] = [],
): FlowDefinition {
  return { id, name, lanes: [], moments, connections };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SimulationScenarioGenerator', () => {
  describe('generateSimulationScenario', () => {
    it('generates a basic happy path scenario', () => {
      const ctx = makeContext('ctx-1', 'Ordering', {
        commands: [
          {
            id: 'cmd-1',
            name: 'PlaceOrder',
            inputs: [{ name: 'orderId', type: 'UUID', isArray: false, required: true }],
            preconditions: [],
            emitsEvent: 'OrderPlaced',
          },
        ],
        events: [
          {
            id: 'evt-1',
            name: 'OrderPlaced',
            fields: [{ name: 'orderId', type: 'UUID', isArray: false, required: true }],
          },
        ],
      });
      const moment1 = makeMoment('fr1', 'Place Order', 'ctx-1', 'PlaceOrder', 'command');
      const moment2 = makeMoment('fr2', 'Order Placed', 'ctx-1', 'OrderPlaced', 'event');
      const flow = makeFlow('f1', 'Order Flow', [moment1, moment2]);
      const ir = makeIR({ contexts: [ctx], flows: [flow] });

      const scenario = generateSimulationScenario(ir, flow);

      expect(scenario.scenarioId).toBe('scenario-f1');
      expect(scenario.scenarioLabel).toContain('Happy Path');
      expect(scenario.expectedPath).toHaveLength(2);
      expect(scenario.events).toHaveLength(2);
      expect(scenario.given).toContain('place order');
      expect(scenario.when).toContain('Place Order');
      expect(scenario.then).toContain('Order Placed');
    });

    it('uses provided options for scenarioId and sessionId', () => {
      const ctx = makeContext('ctx-1', 'Ordering');
      const moment = makeMoment('fr1', 'Step', 'ctx-1', 'DoSomething');
      const flow = makeFlow('f1', 'Flow', [moment]);
      const ir = makeIR({ contexts: [ctx], flows: [flow] });

      const scenario = generateSimulationScenario(ir, flow, {
        scenarioId: 'custom-id',
        sessionId: 'sess-custom',
        baseTimestamp: '2026-06-15T12:00:00.000Z',
      });

      expect(scenario.scenarioId).toBe('custom-id');
      expect(scenario.events[0].sessionId).toBe('sess-custom');
      expect(scenario.events[0].timestamp).toContain('2026-06-15');
    });

    it('resolves command events with SimProcess prefix', () => {
      const agg = makeAggregate({
        commands: [
          {
            id: 'cmd-1',
            name: 'PlaceOrder',
            inputs: [],
            preconditions: [],
            emitsEvent: 'OrderPlaced',
          },
        ],
      });
      const ctx = makeContext('ctx-1', 'Ordering', { aggregates: [agg] });
      const moment = makeMoment('fr1', 'Place Order', 'ctx-1', 'PlaceOrder', 'command');
      const flow = makeFlow('f1', 'Flow', [moment]);
      const ir = makeIR({ contexts: [ctx], flows: [flow] });

      const scenario = generateSimulationScenario(ir, flow);

      expect(scenario.events[0].eventType).toBe('SimProcess.PlaceOrder');
    });

    it('resolves event nodes with plain event name', () => {
      const ctx = makeContext('ctx-1', 'Ordering', {
        events: [{ id: 'evt-1', name: 'OrderPlaced', fields: [] }],
      });
      const moment = makeMoment('fr1', 'Notified', 'ctx-1', 'OrderPlaced', 'event');
      const flow = makeFlow('f1', 'Flow', [moment]);
      const ir = makeIR({ contexts: [ctx], flows: [flow] });

      const scenario = generateSimulationScenario(ir, flow);

      expect(scenario.events[0].eventType).toBe('OrderPlaced');
      expect(scenario.events[0].productSource).toBe('ordering');
    });

    it('sets productSource to moment:simulation when context not found', () => {
      const ctx = makeContext('ctx-1', 'Ordering');
      const moment = makeMoment('fr1', 'Step', 'ctx-unknown', 'DoSomething');
      const flow = makeFlow('f1', 'Flow', [moment]);
      const ir = makeIR({ contexts: [ctx], flows: [flow] });

      const scenario = generateSimulationScenario(ir, flow);

      expect(scenario.events[0].productSource).toBe('moment:simulation');
    });

    it('generates command payload with input placeholders', () => {
      const agg = makeAggregate({
        commands: [
          {
            id: 'cmd-1',
            name: 'PlaceOrder',
            inputs: [
              { name: 'orderId', type: 'UUID', isArray: false, required: true },
              { name: 'amount', type: 'number', isArray: false, required: true },
              { name: 'notes', type: 'string', isArray: false, required: false },
            ],
            preconditions: [],
            emitsEvent: 'OrderPlaced',
          },
        ],
      });
      const ctx = makeContext('ctx-1', 'Ordering', { aggregates: [agg] });
      const moment = makeMoment('fr1', 'Place', 'ctx-1', 'PlaceOrder', 'command');
      const flow = makeFlow('f1', 'Flow', [moment]);
      const ir = makeIR({ contexts: [ctx], flows: [flow] });

      const scenario = generateSimulationScenario(ir, flow);
      const payload = scenario.events[0].payload;

      expect(payload.orderId).toBe('orderId-001');
      expect(payload.amount).toBe(0);
      expect(payload.notes).toBe('sample-notes');
    });

    it('generates event payload with field placeholders', () => {
      const ctx = makeContext('ctx-1', 'Ordering', {
        events: [
          {
            id: 'evt-1',
            name: 'OrderPlaced',
            fields: [
              { name: 'orderId', type: 'UUID', isArray: false, required: true },
              { name: 'active', type: 'boolean', isArray: false, required: true },
              { name: 'createdAt', type: 'DateTime', isArray: false, required: true },
              { name: 'date', type: 'Date', isArray: false, required: false },
              { name: 'price', type: 'Money', isArray: false, required: true },
              { name: 'tags', type: 'string[]', isArray: true, required: false },
              { name: 'meta', type: 'object', isArray: false, required: false },
            ],
          },
        ],
      });
      const moment = makeMoment('fr1', 'Notified', 'ctx-1', 'OrderPlaced', 'event');
      const flow = makeFlow('f1', 'Flow', [moment]);
      const ir = makeIR({ contexts: [ctx], flows: [flow] });

      const scenario = generateSimulationScenario(ir, flow);
      const payload = scenario.events[0].payload;

      expect(payload.orderId).toBe('orderId-001');
      expect(payload.active).toBe(true);
      expect(payload.createdAt).toBe('2026-01-01T10:00:00.000Z');
      expect(payload.date).toBe('2026-01-01');
      expect(payload.price).toBe(0);
      expect(payload.tags).toEqual([]);
      expect(payload.meta).toEqual({});
    });

    it('builds causation chain from previous event when no triggered-by connection', () => {
      const ctx = makeContext('ctx-1', 'Ordering');
      const m1 = makeMoment('fr1', 'Step 1', 'ctx-1', 'Cmd1');
      const m2 = makeMoment('fr2', 'Step 2', 'ctx-1', 'Cmd2');
      const flow = makeFlow('f1', 'Flow', [m1, m2]);
      const ir = makeIR({ contexts: [ctx], flows: [flow] });

      const scenario = generateSimulationScenario(ir, flow);

      expect(scenario.events[0].causationEventIds).toHaveLength(0);
      expect(scenario.events[1].causationEventIds).toEqual([scenario.events[0].eventId]);
    });

    it('sets correlationId consistently across all events', () => {
      const ctx = makeContext('ctx-1', 'Ordering');
      const m1 = makeMoment('fr1', 'Step 1', 'ctx-1', 'Cmd1');
      const m2 = makeMoment('fr2', 'Step 2', 'ctx-1', 'Cmd2');
      const flow = makeFlow('f1', 'Flow', [m1, m2]);
      const ir = makeIR({ contexts: [ctx], flows: [flow] });

      const scenario = generateSimulationScenario(ir, flow);

      const correlationIds = scenario.events.map((e) => e.correlationId);
      expect(new Set(correlationIds).size).toBe(1);
    });

    it('uses flow description when available', () => {
      const ctx = makeContext('ctx-1', 'Ordering');
      const moment = makeMoment('fr1', 'Step', 'ctx-1', 'Cmd');
      const flow: FlowDefinition = {
        id: 'f1',
        name: 'Flow',
        description: 'Custom description',
        lanes: [],
        moments: [moment],
        connections: [],
      };
      const ir = makeIR({ contexts: [ctx], flows: [flow] });

      const scenario = generateSimulationScenario(ir, flow);

      expect(scenario.description).toBe('Custom description');
    });
  });

  describe('generateAllScenarios', () => {
    it('generates single scenario when no branches', () => {
      const ctx = makeContext('ctx-1', 'Ordering');
      const moment = makeMoment('fr1', 'Step', 'ctx-1', 'Cmd');
      const flow = makeFlow('f1', 'Flow', [moment]);
      const ir = makeIR({ contexts: [ctx], flows: [flow] });

      const scenarios = generateAllScenarios(ir, flow);

      expect(scenarios).toHaveLength(1);
      expect(scenarios[0].scenarioLabel).toContain('Happy Path');
    });

    it('generates one scenario per branch combination', () => {
      const ctx = makeContext('ctx-1', 'Ordering');
      const branchMoment: MomentDefinition = {
        id: 'fr1',
        name: 'Decision',
        contextEntries: [{ contextId: 'ctx-1', nodeName: 'Evaluate', nodeKind: 'command' }],
        branches: [
          {
            condition: 'approved',
            entries: [{ contextId: 'ctx-1', nodeName: 'Approve', nodeKind: 'command' }],
          },
          {
            condition: 'rejected',
            entries: [{ contextId: 'ctx-1', nodeName: 'Reject', nodeKind: 'command' }],
          },
        ],
      };
      const flow = makeFlow('f1', 'Flow', [branchMoment]);
      const ir = makeIR({ contexts: [ctx], flows: [flow] });

      const scenarios = generateAllScenarios(ir, flow);

      expect(scenarios).toHaveLength(2);
      expect(scenarios[0].scenarioId).toContain('-0');
      expect(scenarios[1].scenarioId).toContain('-1');
    });

    it('generates cartesian product of multiple branch points', () => {
      const ctx = makeContext('ctx-1', 'Ordering');
      const branch1: MomentDefinition = {
        id: 'fr1',
        name: 'Step1',
        contextEntries: [],
        branches: [
          {
            condition: 'A',
            entries: [{ contextId: 'ctx-1', nodeName: 'CmdA', nodeKind: 'command' }],
          },
          {
            condition: 'B',
            entries: [{ contextId: 'ctx-1', nodeName: 'CmdB', nodeKind: 'command' }],
          },
        ],
      };
      const branch2: MomentDefinition = {
        id: 'fr2',
        name: 'Step2',
        contextEntries: [],
        branches: [
          {
            condition: 'X',
            entries: [{ contextId: 'ctx-1', nodeName: 'CmdX', nodeKind: 'command' }],
          },
          {
            condition: 'Y',
            entries: [{ contextId: 'ctx-1', nodeName: 'CmdY', nodeKind: 'command' }],
          },
        ],
      };
      const flow = makeFlow('f1', 'Flow', [branch1, branch2]);
      const ir = makeIR({ contexts: [ctx], flows: [flow] });

      const scenarios = generateAllScenarios(ir, flow);

      // 2 branches * 2 branches = 4 combinations
      expect(scenarios).toHaveLength(4);
    });

    it('uses custom scenarioId prefix from options', () => {
      const ctx = makeContext('ctx-1', 'Ordering');
      const branchMoment: MomentDefinition = {
        id: 'fr1',
        name: 'Decision',
        contextEntries: [],
        branches: [
          {
            condition: 'yes',
            entries: [{ contextId: 'ctx-1', nodeName: 'A', nodeKind: 'command' }],
          },
          {
            condition: 'no',
            entries: [{ contextId: 'ctx-1', nodeName: 'B', nodeKind: 'command' }],
          },
        ],
      };
      const flow = makeFlow('f1', 'Flow', [branchMoment]);
      const ir = makeIR({ contexts: [ctx], flows: [flow] });

      const scenarios = generateAllScenarios(ir, flow, { scenarioId: 'custom' });

      expect(scenarios[0].scenarioId).toBe('custom-0');
      expect(scenarios[1].scenarioId).toBe('custom-1');
    });
  });

  describe('scenario labeling', () => {
    it('labels Happy Path when no branches exist', () => {
      const ctx = makeContext('ctx-1', 'Ordering');
      const moment = makeMoment('fr1', 'Step', 'ctx-1', 'Cmd');
      const flow = makeFlow('f1', 'Order Flow', [moment]);
      const ir = makeIR({ contexts: [ctx], flows: [flow] });

      const scenario = generateSimulationScenario(ir, flow);

      expect(scenario.scenarioLabel).toBe('Happy Path: Order Flow');
    });

    it('labels Happy Path when first branch is selected', () => {
      const ctx = makeContext('ctx-1', 'Ordering');
      const branchMoment: MomentDefinition = {
        id: 'fr1',
        name: 'Decision',
        contextEntries: [],
        branches: [
          {
            condition: 'approved',
            entries: [{ contextId: 'ctx-1', nodeName: 'A', nodeKind: 'command' }],
          },
          {
            condition: 'rejected',
            entries: [{ contextId: 'ctx-1', nodeName: 'B', nodeKind: 'command' }],
          },
        ],
      };
      const flow = makeFlow('f1', 'Order Flow', [branchMoment]);
      const ir = makeIR({ contexts: [ctx], flows: [flow] });

      const scenario = generateSimulationScenario(ir, flow, {
        branchSelections: { Decision: 'approved' },
      });

      expect(scenario.scenarioLabel).toBe('Happy Path: Order Flow');
    });

    it('labels Failure Path when terminal branch is selected', () => {
      const ctx = makeContext('ctx-1', 'Ordering');
      const branchMoment: MomentDefinition = {
        id: 'fr1',
        name: 'Decision',
        contextEntries: [],
        branches: [
          {
            condition: 'approved',
            entries: [{ contextId: 'ctx-1', nodeName: 'A', nodeKind: 'command' }],
          },
          {
            condition: 'rejected',
            entries: [{ contextId: 'ctx-1', nodeName: 'B', nodeKind: 'command', terminal: true }],
          },
        ],
      };
      const flow = makeFlow('f1', 'Order Flow', [branchMoment]);
      const ir = makeIR({ contexts: [ctx], flows: [flow] });

      const scenario = generateSimulationScenario(ir, flow, {
        branchSelections: { Decision: 'rejected' },
      });

      expect(scenario.scenarioLabel).toBe('Failure Path: Order Flow [rejected]');
    });

    it('labels Variant when non-first, non-terminal branch is selected', () => {
      const ctx = makeContext('ctx-1', 'Ordering');
      const branchMoment: MomentDefinition = {
        id: 'fr1',
        name: 'Decision',
        contextEntries: [],
        branches: [
          {
            condition: 'path-A',
            entries: [{ contextId: 'ctx-1', nodeName: 'A', nodeKind: 'command' }],
          },
          {
            condition: 'path-B',
            entries: [{ contextId: 'ctx-1', nodeName: 'B', nodeKind: 'command' }],
          },
        ],
      };
      const flow = makeFlow('f1', 'Order Flow', [branchMoment]);
      const ir = makeIR({ contexts: [ctx], flows: [flow] });

      const scenario = generateSimulationScenario(ir, flow, {
        branchSelections: { Decision: 'path-B' },
      });

      expect(scenario.scenarioLabel).toBe('Variant: Order Flow [path-B]');
    });
  });

  describe('saga transition injection', () => {
    it('injects saga transition events when trigger event matches', () => {
      const ctx = makeContext('ctx-1', 'Ordering', {
        events: [{ id: 'evt-1', name: 'OrderPlaced', fields: [] }],
        sagas: [
          {
            id: 'saga-1',
            name: 'OrderFulfillment',
            trigger: 'OrderPlaced',
            states: ['Pending', 'Processing'],
            compensation: 'CancelOrder',
            timeout: '30m',
          },
        ],
      });
      const moment = makeMoment('fr1', 'Place Order', 'ctx-1', 'OrderPlaced', 'event');
      const flow = makeFlow('f1', 'Flow', [moment]);
      const ir = makeIR({ contexts: [ctx], flows: [flow] });

      const scenario = generateSimulationScenario(ir, flow);

      // Original event + saga transition event
      expect(scenario.events.length).toBeGreaterThan(1);
      const sagaEvent = scenario.events.find((e) => e.eventType.startsWith('SimSaga.'));
      expect(sagaEvent).toBeDefined();
      expect(sagaEvent!.eventType).toBe('SimSaga.OrderFulfillment.Pending');
      expect(sagaEvent!.payload).toEqual({
        sagaName: 'OrderFulfillment',
        state: 'Pending',
        triggeredBy: 'OrderPlaced',
      });
    });

    it('does not inject saga events when no sagas match', () => {
      const ctx = makeContext('ctx-1', 'Ordering');
      const moment = makeMoment('fr1', 'Step', 'ctx-1', 'DoSomething');
      const flow = makeFlow('f1', 'Flow', [moment]);
      const ir = makeIR({ contexts: [ctx], flows: [flow] });

      const scenario = generateSimulationScenario(ir, flow);

      const sagaEvents = scenario.events.filter((e) => e.eventType.startsWith('SimSaga.'));
      expect(sagaEvents).toHaveLength(0);
    });
  });

  describe('deriveNegativeScenarios', () => {
    it('generates negative scenarios from command preconditions', () => {
      const agg = makeAggregate({
        commands: [
          {
            id: 'cmd-1',
            name: 'PlaceOrder',
            inputs: [],
            preconditions: [
              { name: 'CustomerExists', description: 'Customer must exist' },
              { name: 'InStock', description: 'Items must be in stock' },
            ],
            emitsEvent: 'OrderPlaced',
          },
        ],
      });
      const ctx = makeContext('ctx-1', 'Ordering', { aggregates: [agg] });
      const moment = makeMoment('fr1', 'Place Order', 'ctx-1', 'PlaceOrder', 'command');
      const flow = makeFlow('f1', 'Flow', [moment]);
      const ir = makeIR({ contexts: [ctx], flows: [flow] });

      const scenarios = deriveNegativeScenarios(ir, flow);

      expect(scenarios).toHaveLength(2);
      expect(scenarios[0].scenarioId).toContain('neg-PlaceOrder-CustomerExists');
      expect(scenarios[0].scenarioLabel).toContain('Customer must exist');
      expect(scenarios[1].scenarioId).toContain('neg-PlaceOrder-InStock');

      // Each negative scenario should end with a failure event
      const failureEvent = scenarios[0].events[scenarios[0].events.length - 1];
      expect(failureEvent.eventType).toContain('SimFailure.PlaceOrder.PreconditionViolation');
      expect(failureEvent.payload).toMatchObject({
        failedPrecondition: 'CustomerExists',
        description: 'Customer must exist',
      });
    });

    it('returns empty array when no commands have preconditions', () => {
      const ctx = makeContext('ctx-1', 'Ordering');
      const moment = makeMoment('fr1', 'Step', 'ctx-1', 'DoSomething');
      const flow = makeFlow('f1', 'Flow', [moment]);
      const ir = makeIR({ contexts: [ctx], flows: [flow] });

      const scenarios = deriveNegativeScenarios(ir, flow);

      expect(scenarios).toHaveLength(0);
    });

    it('skips event nodes when deriving negative scenarios', () => {
      const ctx = makeContext('ctx-1', 'Ordering', {
        events: [{ id: 'evt-1', name: 'OrderPlaced', fields: [] }],
      });
      const moment = makeMoment('fr1', 'Step', 'ctx-1', 'OrderPlaced', 'event');
      const flow = makeFlow('f1', 'Flow', [moment]);
      const ir = makeIR({ contexts: [ctx], flows: [flow] });

      const scenarios = deriveNegativeScenarios(ir, flow);

      expect(scenarios).toHaveLength(0);
    });
  });

  describe('branch handling', () => {
    it('collects active branches with selected conditions', () => {
      const ctx = makeContext('ctx-1', 'Ordering');
      const branchMoment: MomentDefinition = {
        id: 'fr1',
        name: 'Decision',
        contextEntries: [],
        branches: [
          {
            condition: 'approved',
            entries: [{ contextId: 'ctx-1', nodeName: 'A', nodeKind: 'command' }],
          },
          {
            condition: 'rejected',
            entries: [{ contextId: 'ctx-1', nodeName: 'B', nodeKind: 'command' }],
          },
        ],
      };
      const flow = makeFlow('f1', 'Flow', [branchMoment]);
      const ir = makeIR({ contexts: [ctx], flows: [flow] });

      const scenario = generateSimulationScenario(ir, flow, {
        branchSelections: { Decision: 'rejected' },
      });

      expect(scenario.activeBranches).toHaveLength(1);
      expect(scenario.activeBranches[0].momentName).toBe('Decision');
      expect(scenario.activeBranches[0].condition).toBe('rejected');
    });

    it('stops collecting nodes at terminal branch', () => {
      const ctx = makeContext('ctx-1', 'Ordering');
      const branchMoment: MomentDefinition = {
        id: 'fr1',
        name: 'Decision',
        contextEntries: [],
        branches: [
          {
            condition: 'abort',
            entries: [
              { contextId: 'ctx-1', nodeName: 'Abort', nodeKind: 'command', terminal: true },
            ],
          },
        ],
      };
      const afterMoment = makeMoment('fr2', 'After', 'ctx-1', 'Continue');
      const flow = makeFlow('f1', 'Flow', [branchMoment, afterMoment]);
      const ir = makeIR({ contexts: [ctx], flows: [flow] });

      const scenario = generateSimulationScenario(ir, flow, {
        branchSelections: { Decision: 'abort' },
      });

      // After-moment nodes should not be included because the terminal branch stops collection
      const nodeNames = scenario.expectedPath;
      expect(nodeNames.every((n) => !n.includes('Continue'))).toBe(true);
    });
  });

  describe('node ID alignment with topology', () => {
    it('produces expectedPath IDs in {momentId}::{laneId}::{nodeName}::{scope} format', () => {
      const ctx = makeContext('ctx-ordering', 'Ordering');
      const moment = makeMoment('moment-0-Place', 'Place', 'ctx-ordering', 'PlaceOrder');
      const flow: FlowDefinition = {
        id: 'f1',
        name: 'Flow',
        lanes: [{ id: 'ordering', label: 'Ordering', contextId: 'ctx-ordering', isBranch: false }],
        moments: [moment],
        connections: [],
      };
      const ir = makeIR({ contexts: [ctx], flows: [flow] });

      const scenario = generateSimulationScenario(ir, flow);

      expect(scenario.expectedPath[0]).toBe('moment-0-Place::ordering::PlaceOrder::main');
    });

    it('uses br{index} scope matching branch position for branched moments', () => {
      const ctx = makeContext('ctx-ordering', 'Ordering');
      const branchMoment: MomentDefinition = {
        id: 'moment-0-Decision',
        name: 'Decision',
        contextEntries: [],
        branches: [
          {
            condition: 'approved',
            entries: [{ contextId: 'ctx-ordering', nodeName: 'Confirm', nodeKind: 'command' }],
          },
          {
            condition: 'rejected',
            entries: [{ contextId: 'ctx-ordering', nodeName: 'Reject', nodeKind: 'command' }],
          },
        ],
      };
      const flow: FlowDefinition = {
        id: 'f1',
        name: 'Flow',
        lanes: [{ id: 'ordering', label: 'Ordering', contextId: 'ctx-ordering', isBranch: false }],
        moments: [branchMoment],
        connections: [],
      };
      const ir = makeIR({ contexts: [ctx], flows: [flow] });

      // Happy path selects first branch (approved) → br0
      const happy = generateSimulationScenario(ir, flow);
      expect(happy.expectedPath[0]).toBe('moment-0-Decision::ordering::Confirm::br0');

      // Second branch (rejected) → br1
      const rejected = generateSimulationScenario(ir, flow, {
        branchSelections: { Decision: 'rejected' },
      });
      expect(rejected.expectedPath[0]).toBe('moment-0-Decision::ordering::Reject::br1');
    });

    it('falls back to contextId when no lane matches', () => {
      const ctx = makeContext('ctx-unknown', 'Unknown');
      const moment = makeMoment('moment-0-Step', 'Step', 'ctx-unknown', 'DoThing');
      const flow: FlowDefinition = {
        id: 'f1',
        name: 'Flow',
        lanes: [],
        moments: [moment],
        connections: [],
      };
      const ir = makeIR({ contexts: [ctx], flows: [flow] });

      const scenario = generateSimulationScenario(ir, flow);

      expect(scenario.expectedPath[0]).toBe('moment-0-Step::ctx-unknown::DoThing::main');
    });
  });
});
