import { describe, it, expect } from 'vitest';
import type {
  IntermediateRepresentation,
  ContextDefinition,
  FlowDefinition,
  MomentDefinition,
  ConnectionDefinition,
  AggregateDefinition,
  SagaDefinition,
} from '@mmmnt/core';
import {
  generateSimulationScenario,
  generateAllScenarios,
  deriveNegativeScenarios,
  deriveTimeoutScenarios,
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

  describe('scenario kind classification (M-S15)', () => {
    const makeDecisionMoment = (terminalOnReject: boolean): MomentDefinition => ({
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
          entries: [
            { contextId: 'ctx-1', nodeName: 'B', nodeKind: 'command', terminal: terminalOnReject },
          ],
        },
      ],
    });

    it("kind is 'happy' when no branch points exist", () => {
      const ctx = makeContext('ctx-1', 'Ordering');
      const flow = makeFlow('f1', 'Order Flow', [makeMoment('fr1', 'Step', 'ctx-1', 'Cmd')]);
      const ir = makeIR({ contexts: [ctx], flows: [flow] });

      expect(generateSimulationScenario(ir, flow).kind).toBe('happy');
    });

    it("kind is 'happy' when every reached branch point takes its first arm", () => {
      const ctx = makeContext('ctx-1', 'Ordering');
      const flow = makeFlow('f1', 'Order Flow', [makeDecisionMoment(false)]);
      const ir = makeIR({ contexts: [ctx], flows: [flow] });

      const scenario = generateSimulationScenario(ir, flow, {
        branchSelections: { Decision: 'approved' },
      });

      expect(scenario.kind).toBe('happy');
    });

    it("kind is 'variant' for a non-first, non-terminal arm", () => {
      const ctx = makeContext('ctx-1', 'Ordering');
      const flow = makeFlow('f1', 'Order Flow', [makeDecisionMoment(false)]);
      const ir = makeIR({ contexts: [ctx], flows: [flow] });

      const scenario = generateSimulationScenario(ir, flow, {
        branchSelections: { Decision: 'rejected' },
      });

      expect(scenario.kind).toBe('variant');
    });

    it("kind is 'failure' when the selected arm is terminal", () => {
      const ctx = makeContext('ctx-1', 'Ordering');
      const flow = makeFlow('f1', 'Order Flow', [makeDecisionMoment(true)]);
      const ir = makeIR({ contexts: [ctx], flows: [flow] });

      const scenario = generateSimulationScenario(ir, flow, {
        branchSelections: { Decision: 'rejected' },
      });

      expect(scenario.kind).toBe('failure');
    });

    it("kind is 'negative' on every derived negative scenario", () => {
      const ctx = makeContext('ctx-1', 'Ordering', {
        commands: [
          {
            id: 'cmd-1',
            name: 'PlaceOrder',
            inputs: [],
            preconditions: [{ name: 'CustomerVerified', description: 'customer is verified' }],
            emitsEvent: 'OrderPlaced',
          },
        ],
      });
      const flow = makeFlow('f1', 'Order Flow', [
        makeMoment('fr1', 'Place Order', 'ctx-1', 'PlaceOrder', 'command'),
      ]);
      const ir = makeIR({ contexts: [ctx], flows: [flow] });

      const negatives = deriveNegativeScenarios(ir, flow);

      expect(negatives.length).toBeGreaterThan(0);
      for (const neg of negatives) {
        expect(neg.kind).toBe('negative');
      }
    });

    it('every scenario from generateAllScenarios carries a kind consistent with its label', () => {
      const ctx = makeContext('ctx-1', 'Ordering');
      const flow = makeFlow('f1', 'Order Flow', [makeDecisionMoment(true)]);
      const ir = makeIR({ contexts: [ctx], flows: [flow] });

      const scenarios = generateAllScenarios(ir, flow);

      expect(scenarios).toHaveLength(2);
      const byKind = Object.fromEntries(scenarios.map((s) => [s.kind, s.scenarioLabel]));
      expect(byKind.happy).toContain('Happy Path');
      expect(byKind.failure).toContain('Failure Path');
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

  describe('returns-to loop unroll', () => {
    function makeReturnsToFlow(): FlowDefinition {
      const start = makeMoment('fr1', 'Start', 'ctx-1', 'Record', 'event');
      const gate: MomentDefinition = {
        id: 'fr2',
        name: 'Gate',
        contextEntries: [],
        branches: [
          {
            condition: 'ok',
            entries: [{ contextId: 'ctx-1', nodeName: 'Accept', nodeKind: 'event' }],
          },
          {
            condition: 'retry',
            entries: [{ contextId: 'ctx-1', nodeName: 'Reject', nodeKind: 'event' }],
          },
        ],
      };
      const finish = makeMoment('fr3', 'Finish', 'ctx-1', 'Done', 'event');
      const connections: ConnectionDefinition[] = [
        {
          id: 'conn-r1',
          sourceMomentId: 'fr2',
          targetContextId: 'ctx-1',
          eventId: 'evt-Reject',
          sourceNodeName: 'Reject',
          connectionType: 'returns-to',
          targetMomentLabel: 'Start',
          targetMomentId: 'fr1',
          branchCondition: 'retry',
        },
      ];
      return makeFlow('f1', 'Retry Flow', [start, gate, finish], connections);
    }

    it('unrolls a returns-to arm back into the target moment with no contradiction', () => {
      const ctx = makeContext('ctx-1', 'Ordering');
      const flow = makeReturnsToFlow();
      const ir = makeIR({ contexts: [ctx], flows: [flow] });

      const scenario = generateSimulationScenario(ir, flow, {
        branchSelections: { Gate: 'retry' },
      });

      // Reject → back to Start → retry succeeds via first arm → continue
      expect(scenario.expectedPath).toEqual([
        'fr1::ctx-1::Record::main',
        'fr2::ctx-1::Reject::br1',
        'fr1::ctx-1::Record::main',
        'fr2::ctx-1::Accept::br0',
        'fr3::ctx-1::Done::main',
      ]);

      // No reject-then-accept contradiction: Reject is never immediately
      // followed by Accept — the target moment's nodes intervene.
      const rejectIdx = scenario.expectedPath.findIndex((p) => p.includes('Reject'));
      const acceptIdx = scenario.expectedPath.findIndex((p) => p.includes('Accept'));
      expect(rejectIdx).toBeLessThan(acceptIdx);
      expect(scenario.expectedPath[rejectIdx + 1]).toContain('Record');

      // Events stay 1:1 aligned with the unrolled path
      expect(scenario.events).toHaveLength(scenario.expectedPath.length);
      scenario.events.forEach((e, i) => {
        expect(e.payload.nodeId).toBe(scenario.expectedPath[i]);
      });
    });

    it('unrolls each returns-to at most once per scenario', () => {
      const ctx = makeContext('ctx-1', 'Ordering');
      const flow = makeReturnsToFlow();
      const ir = makeIR({ contexts: [ctx], flows: [flow] });

      const scenario = generateSimulationScenario(ir, flow, {
        branchSelections: { Gate: 'retry' },
      });

      const rejects = scenario.expectedPath.filter((p) => p.includes('Reject'));
      expect(rejects).toHaveLength(1);
    });

    it('still enumerates branch points downstream of a returns-to arm', () => {
      const ctx = makeContext('ctx-1', 'Ordering');
      const flow = makeReturnsToFlow();
      const ir = makeIR({ contexts: [ctx], flows: [flow] });

      const scenarios = generateAllScenarios(ir, flow);

      expect(scenarios).toHaveLength(2);
      const paths = scenarios.map((s) => s.expectedPath.join('|'));
      expect(new Set(paths).size).toBe(2);
    });
  });

  describe('cross-product pruning', () => {
    function makeTerminalThenBranchFlow(): FlowDefinition {
      const gate1: MomentDefinition = {
        id: 'fr1',
        name: 'Gate1',
        contextEntries: [],
        branches: [
          {
            condition: 'ok',
            entries: [{ contextId: 'ctx-1', nodeName: 'Continue', nodeKind: 'event' }],
          },
          {
            condition: 'fail',
            entries: [{ contextId: 'ctx-1', nodeName: 'Abort', nodeKind: 'event', terminal: true }],
          },
        ],
      };
      const gate2: MomentDefinition = {
        id: 'fr2',
        name: 'Gate2',
        contextEntries: [],
        branches: [
          {
            condition: 'x',
            entries: [{ contextId: 'ctx-1', nodeName: 'PathX', nodeKind: 'event' }],
          },
          {
            condition: 'y',
            entries: [{ contextId: 'ctx-1', nodeName: 'PathY', nodeKind: 'event' }],
          },
        ],
      };
      return makeFlow('f1', 'Pruned Flow', [gate1, gate2]);
    }

    it('does not enumerate branch points after a terminal truncation', () => {
      const ctx = makeContext('ctx-1', 'Ordering');
      const flow = makeTerminalThenBranchFlow();
      const ir = makeIR({ contexts: [ctx], flows: [flow] });

      const scenarios = generateAllScenarios(ir, flow);

      // ok×{x,y} + fail = 3, not the naive 2×2 = 4
      expect(scenarios).toHaveLength(3);
    });

    it('produces no two scenarios with identical expectedPath', () => {
      const ctx = makeContext('ctx-1', 'Ordering');
      const flow = makeTerminalThenBranchFlow();
      const ir = makeIR({ contexts: [ctx], flows: [flow] });

      const scenarios = generateAllScenarios(ir, flow);

      const paths = scenarios.map((s) => s.expectedPath.join('|'));
      expect(new Set(paths).size).toBe(scenarios.length);
    });

    it('gives every distinct path a distinct label', () => {
      const ctx = makeContext('ctx-1', 'Ordering');
      const flow = makeTerminalThenBranchFlow();
      const ir = makeIR({ contexts: [ctx], flows: [flow] });

      const scenarios = generateAllScenarios(ir, flow);

      const labels = scenarios.map((s) => s.scenarioLabel);
      expect(new Set(labels).size).toBe(scenarios.length);
      expect(labels).toContain('Happy Path: Pruned Flow');
      expect(labels).toContain('Variant: Pruned Flow [y]');
      expect(labels).toContain('Failure Path: Pruned Flow [fail]');
    });

    it('reindexes scenario ids sequentially over the deduped set', () => {
      const ctx = makeContext('ctx-1', 'Ordering');
      const flow = makeTerminalThenBranchFlow();
      const ir = makeIR({ contexts: [ctx], flows: [flow] });

      const scenarios = generateAllScenarios(ir, flow);

      expect(scenarios.map((s) => s.scenarioId)).toEqual([
        'scenario-f1-0',
        'scenario-f1-1',
        'scenario-f1-2',
      ]);
    });

    it('derives activeBranches only from branch points actually reached', () => {
      const ctx = makeContext('ctx-1', 'Ordering');
      const flow = makeTerminalThenBranchFlow();
      const ir = makeIR({ contexts: [ctx], flows: [flow] });

      const scenario = generateSimulationScenario(ir, flow, {
        branchSelections: { Gate1: 'fail', Gate2: 'y' },
      });

      // Gate2 is behind the terminal truncation and never reached
      expect(scenario.activeBranches).toHaveLength(1);
      expect(scenario.activeBranches[0].momentName).toBe('Gate1');
      expect(scenario.scenarioLabel).toBe('Failure Path: Pruned Flow [fail]');
    });

    it('includes all non-first-arm conditions in the label bracket', () => {
      const ctx = makeContext('ctx-1', 'Ordering');
      const gate1: MomentDefinition = {
        id: 'fr1',
        name: 'Gate1',
        contextEntries: [],
        branches: [
          { condition: 'a', entries: [{ contextId: 'ctx-1', nodeName: 'A', nodeKind: 'event' }] },
          { condition: 'b', entries: [{ contextId: 'ctx-1', nodeName: 'B', nodeKind: 'event' }] },
        ],
      };
      const gate2: MomentDefinition = {
        id: 'fr2',
        name: 'Gate2',
        contextEntries: [],
        branches: [
          { condition: 'x', entries: [{ contextId: 'ctx-1', nodeName: 'X', nodeKind: 'event' }] },
          {
            condition: 'z',
            entries: [{ contextId: 'ctx-1', nodeName: 'Z', nodeKind: 'event', terminal: true }],
          },
        ],
      };
      const flow = makeFlow('f1', 'Multi Flow', [gate1, gate2]);
      const ir = makeIR({ contexts: [ctx], flows: [flow] });

      const scenario = generateSimulationScenario(ir, flow, {
        branchSelections: { Gate1: 'b', Gate2: 'z' },
      });

      // Both deviations appear, not just the terminal one
      expect(scenario.scenarioLabel).toBe('Failure Path: Multi Flow [b, z]');
    });
  });

  describe('causation correctness', () => {
    it('attaches a triggered-by cause only to the consuming node', () => {
      const ctx = makeContext('ctx-1', 'Ordering');
      const m1 = makeMoment('fr1', 'Emit', 'ctx-1', 'X', 'event');
      const m2 = makeMoment('fr2', 'Middle', 'ctx-1', 'Mid', 'event');
      const m3 = makeMoment('fr3', 'Consume', 'ctx-1', 'N', 'event');
      const connections: ConnectionDefinition[] = [
        {
          id: 'conn-t1',
          sourceMomentId: 'fr3',
          targetContextId: 'ctx-1',
          eventId: 'evt-X',
          sourceNodeName: 'X',
          targetNodeName: 'N',
          connectionType: 'triggered-by',
        },
      ];
      const flow = makeFlow('f1', 'Flow', [m1, m2, m3], connections);
      const ir = makeIR({ contexts: [ctx], flows: [flow] });

      const scenario = generateSimulationScenario(ir, flow);

      // The consuming node N has exactly its declared cause X
      expect(scenario.events[2].causationEventIds).toEqual([scenario.events[0].eventId]);
      // The unrelated middle node falls back to previous-node causation,
      // not the triggered-by connection
      expect(scenario.events[1].causationEventIds).toEqual([scenario.events[0].eventId]);
      expect(scenario.events[0].causationEventIds).toEqual([]);
    });

    it('dedupes duplicate causation contributions', () => {
      const ctx = makeContext('ctx-1', 'Ordering');
      const m1 = makeMoment('fr1', 'Emit', 'ctx-1', 'X', 'event');
      const m2 = makeMoment('fr2', 'Consume', 'ctx-1', 'N', 'event');
      const duplicated: ConnectionDefinition = {
        id: 'conn-t1',
        sourceMomentId: 'fr2',
        targetContextId: 'ctx-1',
        eventId: 'evt-X',
        sourceNodeName: 'X',
        targetNodeName: 'N',
        connectionType: 'triggered-by',
      };
      const flow = makeFlow('f1', 'Flow', [m1, m2], [duplicated, { ...duplicated, id: 'conn-t2' }]);
      const ir = makeIR({ contexts: [ctx], flows: [flow] });

      const scenario = generateSimulationScenario(ir, flow);

      expect(scenario.events[1].causationEventIds).toEqual([scenario.events[0].eventId]);
    });

    it('resolves the most recent emission of the trigger after an unroll', () => {
      const ctx = makeContext('ctx-1', 'Ordering');
      const m1 = makeMoment('fr1', 'Emit', 'ctx-1', 'X', 'event');
      const gate: MomentDefinition = {
        id: 'fr2',
        name: 'Gate',
        contextEntries: [],
        branches: [
          { condition: 'ok', entries: [{ contextId: 'ctx-1', nodeName: 'Ok', nodeKind: 'event' }] },
          {
            condition: 'retry',
            entries: [{ contextId: 'ctx-1', nodeName: 'Reject', nodeKind: 'event' }],
          },
        ],
      };
      const m3 = makeMoment('fr3', 'Consume', 'ctx-1', 'N', 'event');
      const connections: ConnectionDefinition[] = [
        {
          id: 'conn-r1',
          sourceMomentId: 'fr2',
          targetContextId: 'ctx-1',
          eventId: 'evt-Reject',
          sourceNodeName: 'Reject',
          connectionType: 'returns-to',
          targetMomentId: 'fr1',
          branchCondition: 'retry',
        },
        {
          id: 'conn-t1',
          sourceMomentId: 'fr3',
          targetContextId: 'ctx-1',
          eventId: 'evt-X',
          sourceNodeName: 'X',
          targetNodeName: 'N',
          connectionType: 'triggered-by',
        },
      ];
      const flow = makeFlow('f1', 'Flow', [m1, gate, m3], connections);
      const ir = makeIR({ contexts: [ctx], flows: [flow] });

      const scenario = generateSimulationScenario(ir, flow, {
        branchSelections: { Gate: 'retry' },
      });

      // Path: X, Reject, X (unrolled), Ok, N — N's cause is the SECOND X
      const nIdx = scenario.expectedPath.findIndex((p) => p.includes('::N::'));
      const secondX = scenario.events[2];
      expect(scenario.expectedPath[2]).toContain('::X::');
      expect(scenario.events[nIdx].causationEventIds).toEqual([secondX.eventId]);
    });
  });

  describe('saga append-only ordering', () => {
    it('appends SimSaga events strictly after all path events, renumbered', () => {
      const ctx = makeContext('ctx-1', 'Ordering', {
        events: [
          { id: 'evt-1', name: 'OrderPlaced', fields: [] },
          { id: 'evt-2', name: 'OrderShipped', fields: [] },
        ],
        sagas: [
          {
            id: 'saga-1',
            name: 'Fulfillment',
            trigger: 'OrderPlaced',
            states: ['Pending', 'Processing'],
            compensation: 'CancelOrder',
            timeout: '30m',
          },
        ],
      });
      const m1 = makeMoment('fr1', 'Placed', 'ctx-1', 'OrderPlaced', 'event');
      const m2 = makeMoment('fr2', 'Shipped', 'ctx-1', 'OrderShipped', 'event');
      const flow = makeFlow('f1', 'Flow', [m1, m2]);
      const ir = makeIR({ contexts: [ctx], flows: [flow] });

      const scenario = generateSimulationScenario(ir, flow);

      // Path events first, aligned 1:1 with expectedPath
      expect(scenario.events).toHaveLength(3);
      expect(scenario.events[0].eventType).toBe('OrderPlaced');
      expect(scenario.events[1].eventType).toBe('OrderShipped');
      expect(scenario.events[2].eventType).toBe('SimSaga.Fulfillment.Pending');

      // evt-NNN order equals array order
      expect(scenario.events.map((e) => e.eventId)).toEqual(['evt-001', 'evt-002', 'evt-003']);

      // Saga timestamps come after the last path event
      const lastPathTime = new Date(scenario.events[1].timestamp).getTime();
      const sagaTime = new Date(scenario.events[2].timestamp).getTime();
      expect(sagaTime).toBeGreaterThan(lastPathTime);

      // Causation still references the trigger event
      expect(scenario.events[2].causationEventIds).toEqual([scenario.events[0].eventId]);
    });
  });

  describe('multiplicity expansion', () => {
    it('emits N sequential events for an entry with multiplicity N', () => {
      const ctx = makeContext('ctx-1', 'Ordering');
      const sendMoment: MomentDefinition = {
        id: 'fr1',
        name: 'Notify',
        contextEntries: [
          { contextId: 'ctx-1', nodeName: 'Send', nodeKind: 'event', multiplicity: 2 },
        ],
      };
      const after = makeMoment('fr2', 'After', 'ctx-1', 'Done', 'event');
      const flow = makeFlow('f1', 'Flow', [sendMoment, after]);
      const ir = makeIR({ contexts: [ctx], flows: [flow] });

      const scenario = generateSimulationScenario(ir, flow);

      expect(scenario.expectedPath).toEqual([
        'fr1::ctx-1::Send::main',
        'fr1::ctx-1::Send::main',
        'fr2::ctx-1::Done::main',
      ]);
      expect(scenario.events).toHaveLength(3);
      expect(new Set(scenario.events.map((e) => e.eventId)).size).toBe(3);
      expect(scenario.events[0].payload.nodeId).toBe(scenario.events[1].payload.nodeId);
    });

    it('treats non-numeric multiplicity as 1', () => {
      const ctx = makeContext('ctx-1', 'Ordering');
      const sendMoment: MomentDefinition = {
        id: 'fr1',
        name: 'Notify',
        contextEntries: [
          { contextId: 'ctx-1', nodeName: 'Send', nodeKind: 'event', multiplicity: 'n' },
        ],
      };
      const flow = makeFlow('f1', 'Flow', [sendMoment]);
      const ir = makeIR({ contexts: [ctx], flows: [flow] });

      const scenario = generateSimulationScenario(ir, flow);

      expect(scenario.expectedPath).toHaveLength(1);
    });
  });

  describe('branch payload outcome', () => {
    it('stamps payload.outcome on every event inside a selected branch', () => {
      const ctx = makeContext('ctx-1', 'Ordering');
      const gate: MomentDefinition = {
        id: 'fr1',
        name: 'Gate',
        contextEntries: [],
        branches: [
          {
            condition: 'approved',
            entries: [
              { contextId: 'ctx-1', nodeName: 'Confirm', nodeKind: 'event' },
              { contextId: 'ctx-1', nodeName: 'Confirmed', nodeKind: 'event' },
            ],
          },
          {
            condition: 'rejected',
            entries: [{ contextId: 'ctx-1', nodeName: 'Reject', nodeKind: 'event' }],
          },
        ],
      };
      const after = makeMoment('fr2', 'After', 'ctx-1', 'Done', 'event');
      const flow = makeFlow('f1', 'Flow', [gate, after]);
      const ir = makeIR({ contexts: [ctx], flows: [flow] });

      const happy = generateSimulationScenario(ir, flow);
      expect(happy.events[0].payload.outcome).toBe('approved');
      expect(happy.events[1].payload.outcome).toBe('approved');
      expect(happy.events[2].payload.outcome).toBeUndefined();

      const rejected = generateSimulationScenario(ir, flow, {
        branchSelections: { Gate: 'rejected' },
      });
      expect(rejected.events[0].payload.outcome).toBe('rejected');
    });
  });

  describe('payload synthesis for flow-only specs', () => {
    it('falls back to crosses-to schema contract fields', () => {
      const ctx = makeContext('ctx-1', 'Messaging');
      const moment = makeMoment('fr1', 'Send', 'ctx-1', 'MessageAccepted', 'event');
      const connections: ConnectionDefinition[] = [
        {
          id: 'conn-c1',
          sourceMomentId: 'fr1',
          targetContextId: 'ctx-2',
          eventId: 'evt-MessageAccepted',
          sourceNodeName: 'MessageAccepted',
          connectionType: 'crosses-to',
          schemaContract: {
            eventType: 'MessageAccepted',
            fields: [
              { name: 'conversationId', type: 'UUID', required: true },
              { name: 'body', type: 'string', required: false },
            ],
            relationshipType: 'CustomerSupplier',
          },
        },
      ];
      const flow = makeFlow('f1', 'Flow', [moment], connections);
      const ir = makeIR({ contexts: [ctx], flows: [flow] });

      const scenario = generateSimulationScenario(ir, flow);

      expect(scenario.events[0].payload.conversationId).toBe('conversationId-001');
      expect(scenario.events[0].payload.body).toBe('sample-body');
      expect(scenario.events[0].payload.nodeId).toBe('fr1::ctx-1::MessageAccepted::main');
    });
  });

  describe('payload synthesis unions crossing contracts with declared fields', () => {
    function makeCrossing(
      id: string,
      sourceMomentId: string,
      sourceNodeName: string,
      targetContextId: string,
      fields: { name: string; type: string }[],
    ): ConnectionDefinition {
      return {
        id,
        sourceMomentId,
        targetContextId,
        eventId: `evt-${sourceNodeName}`,
        sourceNodeName,
        connectionType: 'crosses-to',
        schemaContract: {
          eventType: sourceNodeName,
          fields: fields.map((f) => ({ ...f, required: true })),
          relationshipType: 'CustomerSupplier',
        },
      };
    }

    it('adds crossing contract fields on top of declared event fields', () => {
      const ctx = makeContext('ctx-1', 'Checkout', {
        events: [
          {
            id: 'evt-1',
            name: 'PaymentConfirmed',
            fields: [
              { name: 'paymentId', type: 'UUID', isArray: false, required: true },
              { name: 'confirmedAt', type: 'DateTime', isArray: false, required: true },
            ],
          },
        ],
      });
      const moment = makeMoment('fr1', 'Confirm', 'ctx-1', 'PaymentConfirmed', 'event');
      const flow = makeFlow(
        'f1',
        'Flow',
        [moment],
        [
          makeCrossing('conn-c1', 'fr1', 'PaymentConfirmed', 'ctx-2', [
            { name: 'holdId', type: 'UUID' },
            { name: 'paymentConfirmationId', type: 'UUID' },
          ]),
        ],
      );
      const ir = makeIR({ contexts: [ctx], flows: [flow] });

      const scenario = generateSimulationScenario(ir, flow);
      const payload = scenario.events[0].payload;

      // Declared fields as before, contract-only fields appended.
      expect(payload.paymentId).toBe('paymentId-001');
      expect(payload.confirmedAt).toBe('2026-01-01T10:00:00.000Z');
      expect(payload.holdId).toBe('holdId-001');
      expect(payload.paymentConfirmationId).toBe('paymentConfirmationId-001');
      // Deterministic key order: nodeId, declared fields, contract-only fields.
      expect(Object.keys(payload)).toEqual([
        'nodeId',
        'paymentId',
        'confirmedAt',
        'holdId',
        'paymentConfirmationId',
      ]);
    });

    it('keeps the declared field value on a name collision with a contract field', () => {
      const ctx = makeContext('ctx-1', 'Checkout', {
        events: [
          {
            id: 'evt-1',
            name: 'PaymentConfirmed',
            // Declared as Money -> placeholder 0; contract declares string.
            fields: [{ name: 'amount', type: 'Money', isArray: false, required: true }],
          },
        ],
      });
      const moment = makeMoment('fr1', 'Confirm', 'ctx-1', 'PaymentConfirmed', 'event');
      const flow = makeFlow(
        'f1',
        'Flow',
        [moment],
        [
          makeCrossing('conn-c1', 'fr1', 'PaymentConfirmed', 'ctx-2', [
            { name: 'amount', type: 'string' },
            { name: 'holdId', type: 'UUID' },
          ]),
        ],
      );
      const ir = makeIR({ contexts: [ctx], flows: [flow] });

      const scenario = generateSimulationScenario(ir, flow);
      const payload = scenario.events[0].payload;

      // Declared wins: Money placeholder (0), not the contract's 'sample-amount'.
      expect(payload.amount).toBe(0);
      expect(payload.holdId).toBe('holdId-001');
    });

    it('unions every crossing attached to the node name, across moments', () => {
      const ctx = makeContext('ctx-1', 'Checkout', {
        events: [
          {
            id: 'evt-1',
            name: 'PaymentConfirmed',
            fields: [{ name: 'paymentId', type: 'UUID', isArray: false, required: true }],
          },
        ],
      });
      // The same event node appears in three moments, each with its own
      // boundary crossing (ticketwave's PaymentConfirmed shape).
      const m1 = makeMoment('fr1', 'Processing', 'ctx-1', 'PaymentConfirmed', 'event');
      const m2 = makeMoment('fr2', 'Delivery trigger', 'ctx-1', 'PaymentConfirmed', 'event');
      const m3 = makeMoment('fr3', 'Notification trigger', 'ctx-1', 'PaymentConfirmed', 'event');
      const flow = makeFlow(
        'f1',
        'Flow',
        [m1, m2, m3],
        [
          makeCrossing('conn-c1', 'fr1', 'PaymentConfirmed', 'ctx-2', [
            { name: 'holdId', type: 'UUID' },
            { name: 'paymentConfirmationId', type: 'UUID' },
          ]),
          makeCrossing('conn-c2', 'fr2', 'PaymentConfirmed', 'ctx-3', [
            { name: 'orderId', type: 'UUID' },
            { name: 'customerId', type: 'UUID' },
            { name: 'eventId', type: 'UUID' },
            { name: 'holdId', type: 'UUID' },
          ]),
          makeCrossing('conn-c3', 'fr3', 'PaymentConfirmed', 'ctx-4', [
            { name: 'orderId', type: 'UUID' },
            { name: 'customerId', type: 'UUID' },
          ]),
        ],
      );
      const ir = makeIR({ contexts: [ctx], flows: [flow] });

      const scenario = generateSimulationScenario(ir, flow);
      expect(scenario.events).toHaveLength(3);

      // EVERY occurrence carries the union of all three contracts — Facet's
      // schema tier validates the event type against all crossing contracts
      // regardless of which moment declared the crossing.
      for (const event of scenario.events) {
        expect(Object.keys(event.payload)).toEqual([
          'nodeId',
          'paymentId',
          'holdId',
          'paymentConfirmationId',
          'orderId',
          'customerId',
          'eventId',
        ]);
      }
    });

    it('does not add fields from crossings of other node names', () => {
      const ctx = makeContext('ctx-1', 'Checkout', {
        events: [
          {
            id: 'evt-1',
            name: 'PaymentConfirmed',
            fields: [{ name: 'paymentId', type: 'UUID', isArray: false, required: true }],
          },
          {
            id: 'evt-2',
            name: 'PaymentFailed',
            fields: [{ name: 'failureReason', type: 'string', isArray: false, required: true }],
          },
        ],
      });
      const m1 = makeMoment('fr1', 'Confirm', 'ctx-1', 'PaymentConfirmed', 'event');
      const m2 = makeMoment('fr2', 'Fail', 'ctx-1', 'PaymentFailed', 'event');
      const flow = makeFlow(
        'f1',
        'Flow',
        [m1, m2],
        [
          makeCrossing('conn-c1', 'fr1', 'PaymentConfirmed', 'ctx-2', [
            { name: 'holdId', type: 'UUID' },
          ]),
        ],
      );
      const ir = makeIR({ contexts: [ctx], flows: [flow] });

      const scenario = generateSimulationScenario(ir, flow);
      expect(scenario.events[1].payload.holdId).toBeUndefined();
      expect(scenario.events[1].payload.failureReason).toBe('sample-failureReason');
    });
  });

  describe('terminal truncation on main entries', () => {
    it('stops emitting after a terminal main entry', () => {
      const ctx = makeContext('ctx-1', 'Ordering');
      const closing: MomentDefinition = {
        id: 'fr1',
        name: 'Close',
        contextEntries: [
          { contextId: 'ctx-1', nodeName: 'CloseConversation', nodeKind: 'event' },
          { contextId: 'ctx-1', nodeName: 'ConversationClosed', nodeKind: 'event', terminal: true },
          { contextId: 'ctx-1', nodeName: 'NeverEmitted', nodeKind: 'event' },
        ],
      };
      const after = makeMoment('fr2', 'After', 'ctx-1', 'AlsoNever', 'event');
      const flow = makeFlow('f1', 'Flow', [closing, after]);
      const ir = makeIR({ contexts: [ctx], flows: [flow] });

      const scenario = generateSimulationScenario(ir, flow);

      expect(scenario.expectedPath).toEqual([
        'fr1::ctx-1::CloseConversation::main',
        'fr1::ctx-1::ConversationClosed::main',
      ]);
    });

    it('stops at a terminal entry inside a selected branch without emitting later entries', () => {
      const ctx = makeContext('ctx-1', 'Ordering');
      const gate: MomentDefinition = {
        id: 'fr1',
        name: 'Gate',
        contextEntries: [{ contextId: 'ctx-1', nodeName: 'MainNever', nodeKind: 'event' }],
        branches: [
          {
            condition: 'ok',
            entries: [{ contextId: 'ctx-1', nodeName: 'Ok', nodeKind: 'event' }],
          },
          {
            condition: 'fail',
            entries: [
              { contextId: 'ctx-1', nodeName: 'RejectBooking', nodeKind: 'event' },
              { contextId: 'ctx-1', nodeName: 'RefusalSent', nodeKind: 'event', terminal: true },
              { contextId: 'ctx-1', nodeName: 'BranchNever', nodeKind: 'event' },
            ],
          },
        ],
      };
      const flow = makeFlow('f1', 'Flow', [gate]);
      const ir = makeIR({ contexts: [ctx], flows: [flow] });

      const scenario = generateSimulationScenario(ir, flow, {
        branchSelections: { Gate: 'fail' },
      });

      expect(scenario.expectedPath).toEqual([
        'fr1::ctx-1::RejectBooking::br1',
        'fr1::ctx-1::RefusalSent::br1',
      ]);
    });
  });

  describe('negative scenario fixes', () => {
    it('injects saga transitions into negative scenarios', () => {
      const agg = makeAggregate({
        commands: [
          {
            id: 'cmd-1',
            name: 'PlaceOrder',
            inputs: [],
            preconditions: [{ name: 'InStock', description: 'Items must be in stock' }],
            emitsEvent: 'OrderPlaced',
          },
        ],
      });
      const ctx = makeContext('ctx-1', 'Ordering', {
        aggregates: [agg],
        events: [{ id: 'evt-1', name: 'CartReady', fields: [] }],
        sagas: [
          {
            id: 'saga-1',
            name: 'Checkout',
            trigger: 'CartReady',
            states: ['Started'],
            compensation: 'AbandonCart',
            timeout: '30m',
          },
        ],
      });
      const m1 = makeMoment('fr1', 'Ready', 'ctx-1', 'CartReady', 'event');
      const m2 = makeMoment('fr2', 'Place', 'ctx-1', 'PlaceOrder', 'command');
      const flow = makeFlow('f1', 'Flow', [m1, m2]);
      const ir = makeIR({ contexts: [ctx], flows: [flow] });

      const scenarios = deriveNegativeScenarios(ir, flow);

      expect(scenarios).toHaveLength(1);
      const events = scenarios[0].events;
      const sagaEvents = events.filter((e) => e.eventType.startsWith('SimSaga.'));
      expect(sagaEvents).toHaveLength(1);
      // Saga events trail everything, including the failure event
      expect(events[events.length - 1].eventType).toBe('SimSaga.Checkout.Started');
    });

    it('suffixes the path index when the same command+precondition repeats', () => {
      const agg = makeAggregate({
        commands: [
          {
            id: 'cmd-1',
            name: 'PlaceOrder',
            inputs: [],
            preconditions: [{ name: 'InStock', description: 'Items must be in stock' }],
            emitsEvent: 'OrderPlaced',
          },
        ],
      });
      const ctx = makeContext('ctx-1', 'Ordering', { aggregates: [agg] });
      const repeated: MomentDefinition = {
        id: 'fr1',
        name: 'Place',
        contextEntries: [
          { contextId: 'ctx-1', nodeName: 'PlaceOrder', nodeKind: 'command', multiplicity: 2 },
        ],
      };
      const flow = makeFlow('f1', 'Flow', [repeated]);
      const ir = makeIR({ contexts: [ctx], flows: [flow] });

      const scenarios = deriveNegativeScenarios(ir, flow);

      expect(scenarios).toHaveLength(2);
      const ids = scenarios.map((s) => s.scenarioId);
      expect(new Set(ids).size).toBe(2);
      expect(ids[0]).toBe('scenario-f1-neg-PlaceOrder-InStock');
      expect(ids[1]).toBe('scenario-f1-neg-PlaceOrder-InStock-1');
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

  // -------------------------------------------------------------------------
  // M-S6: saga state progression driven by declared `on <Event>` mappings
  // -------------------------------------------------------------------------

  describe('saga state progression (M-S6)', () => {
    function eventMoments(...names: string[]): MomentDefinition[] {
      return names.map((n, i) => makeMoment(`fr${i + 1}`, `Step ${n}`, 'ctx-1', n, 'event'));
    }

    function fulfillmentSaga(overrides: Partial<SagaDefinition> = {}): SagaDefinition {
      return {
        id: 'saga-1',
        name: 'Fulfillment',
        trigger: 'OrderPlaced',
        states: ['Pending', 'Processing', 'Shipped'],
        transitions: [
          { from: 'Pending', to: 'Processing', onEvent: 'PaymentTaken' },
          { from: 'Processing', to: 'Shipped', onEvent: 'OrderShipped' },
        ],
        compensation: 'CancelOrder',
        timeout: '30m',
        ...overrides,
      };
    }

    function eventsCtx(sagas: SagaDefinition[], names: string[]): ContextDefinition {
      return makeContext('ctx-1', 'Ordering', {
        events: names.map((n, i) => ({ id: `evt-${i + 1}`, name: n, fields: [] })),
        sagas,
      });
    }

    it('progresses through every state whose transition onEvent occurs in path order', () => {
      const names = ['OrderPlaced', 'PaymentTaken', 'OrderShipped'];
      const ctx = eventsCtx([fulfillmentSaga()], names);
      const flow = makeFlow('f1', 'Flow', eventMoments(...names));
      const ir = makeIR({ contexts: [ctx], flows: [flow] });

      const scenario = generateSimulationScenario(ir, flow);
      const sagaEvents = scenario.events.filter((e) => e.eventType.startsWith('SimSaga.'));

      expect(sagaEvents.map((e) => e.eventType)).toEqual([
        'SimSaga.Fulfillment.Pending',
        'SimSaga.Fulfillment.Processing',
        'SimSaga.Fulfillment.Shipped',
      ]);
      // Strictly trailing and renumbered: evt-NNN order equals array order.
      expect(scenario.events.map((e) => e.eventId)).toEqual([
        'evt-001',
        'evt-002',
        'evt-003',
        'evt-004',
        'evt-005',
        'evt-006',
      ]);
      // Each marker is caused by the path event that fired it.
      expect(sagaEvents[0].causationEventIds).toEqual(['evt-001']);
      expect(sagaEvents[1].causationEventIds).toEqual(['evt-002']);
      expect(sagaEvents[2].causationEventIds).toEqual(['evt-003']);
      expect(sagaEvents[1].payload).toEqual({
        sagaName: 'Fulfillment',
        state: 'Processing',
        triggeredBy: 'PaymentTaken',
      });
      // Markers are timestamped after the last path event, monotonically.
      const lastPathTime = new Date(scenario.events[2].timestamp).getTime();
      const times = sagaEvents.map((e) => new Date(e.timestamp).getTime());
      expect(times[0]).toBeGreaterThan(lastPathTime);
      expect(times[1]).toBeGreaterThan(times[0]);
      expect(times[2]).toBeGreaterThan(times[1]);
    });

    it('stops at an unmapped transition — no invention past the mapping gap', () => {
      const saga = fulfillmentSaga({
        transitions: [
          { from: 'Pending', to: 'Processing' }, // unmapped
          { from: 'Processing', to: 'Shipped', onEvent: 'OrderShipped' },
        ],
      });
      const names = ['OrderPlaced', 'PaymentTaken', 'OrderShipped'];
      const ctx = eventsCtx([saga], names);
      const flow = makeFlow('f1', 'Flow', eventMoments(...names));
      const ir = makeIR({ contexts: [ctx], flows: [flow] });

      const scenario = generateSimulationScenario(ir, flow);
      const sagaEvents = scenario.events.filter((e) => e.eventType.startsWith('SimSaga.'));

      // OrderShipped IS in the path, but the gap before it stops progression.
      expect(sagaEvents.map((e) => e.eventType)).toEqual(['SimSaga.Fulfillment.Pending']);
    });

    it('ignores an onEvent that occurs before the trigger in path order', () => {
      const saga = fulfillmentSaga({
        states: ['Pending', 'Processing'],
        transitions: [{ from: 'Pending', to: 'Processing', onEvent: 'PaymentTaken' }],
      });
      // PaymentTaken occurs BEFORE the trigger — must not count.
      const names = ['PaymentTaken', 'OrderPlaced'];
      const ctx = eventsCtx([saga], names);
      const flow = makeFlow('f1', 'Flow', eventMoments(...names));
      const ir = makeIR({ contexts: [ctx], flows: [flow] });

      const scenario = generateSimulationScenario(ir, flow);
      const sagaEvents = scenario.events.filter((e) => e.eventType.startsWith('SimSaga.'));

      expect(sagaEvents.map((e) => e.eventType)).toEqual(['SimSaga.Fulfillment.Pending']);
    });

    it('requires each onEvent to occur after the previous milestone (path order)', () => {
      const saga = fulfillmentSaga({
        transitions: [
          { from: 'Pending', to: 'Processing', onEvent: 'OrderShipped' },
          { from: 'Processing', to: 'Shipped', onEvent: 'PaymentTaken' },
        ],
      });
      // Path: trigger, PaymentTaken, OrderShipped. First transition consumes
      // OrderShipped (index 2); PaymentTaken only exists EARLIER, so the
      // second transition never fires.
      const names = ['OrderPlaced', 'PaymentTaken', 'OrderShipped'];
      const ctx = eventsCtx([saga], names);
      const flow = makeFlow('f1', 'Flow', eventMoments(...names));
      const ir = makeIR({ contexts: [ctx], flows: [flow] });

      const scenario = generateSimulationScenario(ir, flow);
      const sagaEvents = scenario.events.filter((e) => e.eventType.startsWith('SimSaga.'));

      expect(sagaEvents.map((e) => e.eventType)).toEqual([
        'SimSaga.Fulfillment.Pending',
        'SimSaga.Fulfillment.Processing',
      ]);
    });

    it('progresses multiple sagas independently, markers grouped in declaration order', () => {
      const sagaA = fulfillmentSaga({
        id: 'saga-a',
        name: 'Fulfillment',
        states: ['Pending', 'Processing'],
        transitions: [{ from: 'Pending', to: 'Processing', onEvent: 'PaymentTaken' }],
      });
      const sagaB = fulfillmentSaga({
        id: 'saga-b',
        name: 'Billing',
        trigger: 'PaymentTaken',
        states: ['Open', 'Settled'],
        transitions: [{ from: 'Open', to: 'Settled', onEvent: 'OrderShipped' }],
      });
      const names = ['OrderPlaced', 'PaymentTaken', 'OrderShipped'];
      const ctx = eventsCtx([sagaA, sagaB], names);
      const flow = makeFlow('f1', 'Flow', eventMoments(...names));
      const ir = makeIR({ contexts: [ctx], flows: [flow] });

      const scenario = generateSimulationScenario(ir, flow);
      const sagaEvents = scenario.events.filter((e) => e.eventType.startsWith('SimSaga.'));

      expect(sagaEvents.map((e) => e.eventType)).toEqual([
        'SimSaga.Fulfillment.Pending',
        'SimSaga.Fulfillment.Processing',
        'SimSaga.Billing.Open',
        'SimSaga.Billing.Settled',
      ]);
      // All trailing, renumbered contiguously after the 3 path events.
      expect(sagaEvents.map((e) => e.eventId)).toEqual([
        'evt-004',
        'evt-005',
        'evt-006',
        'evt-007',
      ]);
    });

    it('emits no markers when the trigger never occurs in the path', () => {
      const ctx = eventsCtx([fulfillmentSaga()], ['SomethingElse']);
      const flow = makeFlow('f1', 'Flow', eventMoments('SomethingElse'));
      const ir = makeIR({ contexts: [ctx], flows: [flow] });

      const scenario = generateSimulationScenario(ir, flow);

      expect(scenario.events.filter((e) => e.eventType.startsWith('SimSaga.'))).toHaveLength(0);
    });

    it('does not advance states on repeated trigger occurrences (no invention)', () => {
      const saga = fulfillmentSaga({ transitions: undefined });
      const names = ['OrderPlaced', 'OrderPlaced'];
      const ctx = eventsCtx([saga], ['OrderPlaced']);
      const flow = makeFlow('f1', 'Flow', eventMoments(...names));
      const ir = makeIR({ contexts: [ctx], flows: [flow] });

      const scenario = generateSimulationScenario(ir, flow);
      const sagaEvents = scenario.events.filter((e) => e.eventType.startsWith('SimSaga.'));

      // Only the initial state — a second trigger occurrence is not a
      // transition, and without mapped transitions nothing else may fire.
      expect(sagaEvents.map((e) => e.eventType)).toEqual(['SimSaga.Fulfillment.Pending']);
    });
  });

  // -------------------------------------------------------------------------
  // M-S11: saga timeout scenario synthesis
  // -------------------------------------------------------------------------

  describe('deriveTimeoutScenarios', () => {
    function timeoutSaga(overrides: Partial<SagaDefinition> = {}): SagaDefinition {
      return {
        id: 'saga-1',
        name: 'Fulfillment',
        trigger: 'OrderPlaced',
        states: ['Pending', 'Processing'],
        transitions: [{ from: 'Pending', to: 'Processing', onEvent: 'OrderShipped' }],
        compensation: 'Cancel the order and refund',
        timeout: 'orderExpiry',
        ...overrides,
      };
    }

    function threeStepFlow(): { flow: FlowDefinition; ctx: ContextDefinition } {
      const ctx = makeContext('ctx-1', 'Ordering', {
        events: [
          { id: 'evt-1', name: 'OrderPlaced', fields: [] },
          { id: 'evt-2', name: 'OrderShipped', fields: [] },
        ],
        sagas: [timeoutSaga()],
      });
      // Trigger moment has a second entry after the trigger — truncation must
      // keep the whole moment.
      const m1 = makeMoment('fr1', 'Init', 'ctx-1', 'Init', 'event');
      const m2: MomentDefinition = {
        id: 'fr2',
        name: 'Order placement',
        contextEntries: [
          { contextId: 'ctx-1', nodeName: 'OrderPlaced', nodeKind: 'event' },
          { contextId: 'ctx-1', nodeName: 'OrderRecorded', nodeKind: 'event' },
        ],
      };
      const m3 = makeMoment('fr3', 'Shipping', 'ctx-1', 'OrderShipped', 'event');
      return { flow: makeFlow('f1', 'Flow', [m1, m2, m3]), ctx };
    }

    it('synthesizes a timeout scenario truncated after the trigger moment', () => {
      const { flow, ctx } = threeStepFlow();
      const ir = makeIR({ contexts: [ctx], flows: [flow] });

      const scenarios = deriveTimeoutScenarios(ir, flow);

      expect(scenarios).toHaveLength(1);
      const s = scenarios[0];
      expect(s.kind).toBe('timeout');
      expect(s.scenarioId).toBe('scenario-f1-timeout-Fulfillment');
      expect(s.scenarioLabel).toBe('Timeout: Flow [Fulfillment.orderExpiry]');

      // Path truncated AFTER the trigger moment: Init + both Order placement
      // nodes, nothing from Shipping.
      expect(s.expectedPath).toEqual([
        'fr1::ctx-1::Init::main',
        'fr2::ctx-1::OrderPlaced::main',
        'fr2::ctx-1::OrderRecorded::main',
      ]);

      // events[i] ↔ expectedPath[i] for path events; markers strictly after.
      expect(s.events).toHaveLength(6);
      expect(s.events.slice(0, 3).map((e) => e.eventType)).toEqual([
        'Init',
        'OrderPlaced',
        'OrderRecorded',
      ]);
      expect(s.events.slice(3).map((e) => e.eventType)).toEqual([
        'SimSaga.Fulfillment.Pending',
        'SimSaga.Fulfillment.TimedOut',
        'SimSaga.Fulfillment.Compensated',
      ]);
      expect(s.events.map((e) => e.eventId)).toEqual([
        'evt-001',
        'evt-002',
        'evt-003',
        'evt-004',
        'evt-005',
        'evt-006',
      ]);

      // Marker payloads per the Facet contract.
      expect(s.events[4].payload).toEqual({ timeoutName: 'orderExpiry' });
      expect(s.events[5].payload).toEqual({ description: 'Cancel the order and refund' });
      // Initial-state marker is caused by the trigger path event; the chain
      // continues through TimedOut into Compensated.
      expect(s.events[3].causationEventIds).toEqual(['evt-002']);
      expect(s.events[4].causationEventIds).toEqual(['evt-004']);
      expect(s.events[5].causationEventIds).toEqual(['evt-005']);

      // Markers timestamped after the last path event, monotonically.
      const lastPathTime = new Date(s.events[2].timestamp).getTime();
      const markerTimes = s.events.slice(3).map((e) => new Date(e.timestamp).getTime());
      expect(markerTimes[0]).toBeGreaterThan(lastPathTime);
      expect(markerTimes[1]).toBeGreaterThan(markerTimes[0]);
      expect(markerTimes[2]).toBeGreaterThan(markerTimes[1]);
    });

    it('omits the Compensated marker when compensation is none', () => {
      const { flow } = threeStepFlow();
      const ctx = makeContext('ctx-1', 'Ordering', {
        sagas: [timeoutSaga({ compensation: 'none' })],
      });
      const ir = makeIR({ contexts: [ctx], flows: [flow] });

      const scenarios = deriveTimeoutScenarios(ir, flow);

      expect(scenarios).toHaveLength(1);
      const markers = scenarios[0].events.filter((e) => e.eventType.startsWith('SimSaga.'));
      expect(markers.map((e) => e.eventType)).toEqual([
        'SimSaga.Fulfillment.Pending',
        'SimSaga.Fulfillment.TimedOut',
      ]);
    });

    it('synthesizes nothing for sagas without a declared timeout', () => {
      const { flow } = threeStepFlow();
      const ctx = makeContext('ctx-1', 'Ordering', {
        sagas: [timeoutSaga({ timeout: 'none' })],
      });
      const ir = makeIR({ contexts: [ctx], flows: [flow] });

      expect(deriveTimeoutScenarios(ir, flow)).toHaveLength(0);
    });

    it('honors the single-owner rule: only the first flow containing the trigger owns the scenario', () => {
      const { flow: flowA, ctx } = threeStepFlow();
      const flowB = makeFlow('f2', 'Other Flow', [
        makeMoment('frB1', 'Placed again', 'ctx-1', 'OrderPlaced', 'event'),
      ]);
      const ir = makeIR({ contexts: [ctx], flows: [flowA, flowB] });

      expect(deriveTimeoutScenarios(ir, flowA)).toHaveLength(1);
      expect(deriveTimeoutScenarios(ir, flowB)).toHaveLength(0);
    });

    it('skips synthesis when the owner flow never reaches the trigger on the happy walk', () => {
      // No flow contains the trigger: ownership falls back to the first flow,
      // whose happy walk has no trigger node — nothing truthful to truncate.
      const ctx = makeContext('ctx-1', 'Ordering', { sagas: [timeoutSaga()] });
      const flow = makeFlow('f1', 'Flow', [makeMoment('fr1', 'Step', 'ctx-1', 'Other', 'event')]);
      const ir = makeIR({ contexts: [ctx], flows: [flow] });

      expect(deriveTimeoutScenarios(ir, flow)).toHaveLength(0);
    });
  });
});
