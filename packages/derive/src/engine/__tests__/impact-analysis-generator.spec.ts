import { describe, it, expect } from 'vitest';
import type {
  IntermediateRepresentation,
  ContextDefinition,
  AggregateDefinition,
  FlowDefinition,
  MomentDefinition,
  ConnectionDefinition,
} from '@mmmnt/core';
import { generateImpactAnalysis } from '../impact-analysis-generator.js';

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
    commands: [],
    events: overrides.events ?? [],
    policies: overrides.policies ?? [],
    sagas: overrides.sagas ?? [],
    valueObjects: [],
    invariants: [],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ImpactAnalysisGenerator', () => {
  it('creates command → event nodes with triggers/dependsOn edges', () => {
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
      events: [{ id: 'evt-1', name: 'OrderPlaced', fields: [] }],
    });
    const ctx = makeContext('ctx-1', 'Sales', { aggregates: [agg] });
    const ir = makeIR({ contexts: [ctx] });

    const analysis = generateImpactAnalysis(ir);

    const cmdNode = analysis.nodes.find((n) => n.type === 'command' && n.name === 'PlaceOrder');
    const evtNode = analysis.nodes.find((n) => n.type === 'event' && n.name === 'OrderPlaced');

    expect(cmdNode).toBeDefined();
    expect(evtNode).toBeDefined();
    expect(cmdNode!.triggers).toContain('event:Sales:OrderPlaced');
    expect(evtNode!.dependsOn).toContain('command:Sales:PlaceOrder');
  });

  it('creates event nodes for aggregate events without commands', () => {
    const agg = makeAggregate({
      events: [{ id: 'evt-1', name: 'OrderPlaced', fields: [] }],
    });
    const ctx = makeContext('ctx-1', 'Sales', { aggregates: [agg] });
    const ir = makeIR({ contexts: [ctx] });

    const analysis = generateImpactAnalysis(ir);

    const evtNode = analysis.nodes.find((n) => n.type === 'event' && n.name === 'OrderPlaced');
    expect(evtNode).toBeDefined();
    expect(evtNode!.context).toBe('Sales');
  });

  it('creates policy nodes with trigger and chainsTo edges', () => {
    const ctx = makeContext('ctx-1', 'Sales', {
      policies: [
        {
          id: 'pol-1',
          name: 'AutoApprove',
          trigger: 'OrderPlaced',
          action: 'Approve',
          chainsTo: 'SendConfirmation',
        },
      ],
    });
    const ir = makeIR({ contexts: [ctx] });

    const analysis = generateImpactAnalysis(ir);

    const policyNode = analysis.nodes.find((n) => n.type === 'policy' && n.name === 'AutoApprove');
    expect(policyNode).toBeDefined();
    expect(policyNode!.dependsOn).toContain('event:Sales:OrderPlaced');
    expect(policyNode!.triggers).toContain('command:Sales:SendConfirmation');

    // The trigger event should also point to the policy
    const evtNode = analysis.nodes.find((n) => n.type === 'event' && n.name === 'OrderPlaced');
    expect(evtNode).toBeDefined();
    expect(evtNode!.triggers).toContain('policy:Sales:AutoApprove');

    // The chained command should depend on the policy
    const cmdNode = analysis.nodes.find(
      (n) => n.type === 'command' && n.name === 'SendConfirmation',
    );
    expect(cmdNode).toBeDefined();
    expect(cmdNode!.dependsOn).toContain('policy:Sales:AutoApprove');
  });

  it('creates saga nodes with trigger edges', () => {
    const ctx = makeContext('ctx-1', 'Sales', {
      sagas: [
        {
          id: 'saga-1',
          name: 'OrderFulfillment',
          trigger: 'OrderPlaced',
          states: ['Pending', 'Processing', 'Done'],
          compensation: 'CancelOrder',
          timeout: '30m',
        },
      ],
    });
    const ir = makeIR({ contexts: [ctx] });

    const analysis = generateImpactAnalysis(ir);

    const sagaNode = analysis.nodes.find((n) => n.type === 'saga' && n.name === 'OrderFulfillment');
    expect(sagaNode).toBeDefined();
    expect(sagaNode!.dependsOn).toContain('event:Sales:OrderPlaced');

    const evtNode = analysis.nodes.find((n) => n.type === 'event' && n.name === 'OrderPlaced');
    expect(evtNode).toBeDefined();
    expect(evtNode!.triggers).toContain('saga:Sales:OrderFulfillment');
  });

  it('creates crossing nodes from flow connections', () => {
    const agg = makeAggregate({
      events: [{ id: 'evt-1', name: 'OrderPlaced', fields: [] }],
    });
    const ctx1 = makeContext('ctx-1', 'Sales', { aggregates: [agg] });
    const ctx2 = makeContext('ctx-2', 'Shipping');

    const conn: ConnectionDefinition = {
      id: 'c1',
      sourceMomentId: 'fr1',
      targetContextId: 'ctx-2',
      eventId: 'evt-1',
      connectionType: 'crosses-to',
      schemaContract: { eventType: 'OrderPlaced', fields: [], relationshipType: 'Partnership' },
    };
    const moment: MomentDefinition = {
      id: 'fr1',
      name: 'M1',
      contextEntries: [{ contextId: 'ctx-1', nodeName: 'PlaceOrder', nodeKind: 'command' }],
    };
    const flow: FlowDefinition = {
      id: 'f1',
      name: 'Flow',
      lanes: [],
      moments: [moment],
      connections: [conn],
    };
    const ir = makeIR({ contexts: [ctx1, ctx2], flows: [flow] });

    const analysis = generateImpactAnalysis(ir);

    const crossingNode = analysis.nodes.find((n) => n.type === 'crossing');
    expect(crossingNode).toBeDefined();
    expect(crossingNode!.name).toBe('OrderPlaced->Shipping');
    expect(crossingNode!.context).toBe('Sales');
    expect(crossingNode!.dependsOn).toContain('event:Sales:OrderPlaced');
  });

  it('skips crossing when source context cannot be found', () => {
    const ctx2 = makeContext('ctx-2', 'Shipping');
    const conn: ConnectionDefinition = {
      id: 'c1',
      sourceMomentId: 'fr1',
      targetContextId: 'ctx-2',
      eventId: 'evt-missing',
      connectionType: 'crosses-to',
      schemaContract: { eventType: 'Unknown', fields: [], relationshipType: 'Partnership' },
    };
    const moment: MomentDefinition = {
      id: 'fr1',
      name: 'M1',
      contextEntries: [{ contextId: 'ctx-2', nodeName: 'Ship', nodeKind: 'command' }],
    };
    const flow: FlowDefinition = {
      id: 'f1',
      name: 'Flow',
      lanes: [],
      moments: [moment],
      connections: [conn],
    };
    const ir = makeIR({ contexts: [ctx2], flows: [flow] });

    const analysis = generateImpactAnalysis(ir);

    const crossingNodes = analysis.nodes.filter((n) => n.type === 'crossing');
    expect(crossingNodes).toHaveLength(0);
  });

  it('empty IR produces empty analysis', () => {
    const ir = makeIR();

    const analysis = generateImpactAnalysis(ir);

    expect(analysis.nodes).toHaveLength(0);
    expect(analysis.metadata.generatedAt).toBeDefined();
  });

  it('finds source context from top-level events', () => {
    const ctx1 = makeContext('ctx-1', 'Sales', {
      events: [{ id: 'evt-1', name: 'OrderPlaced', fields: [] }],
    });
    const ctx2 = makeContext('ctx-2', 'Shipping');
    const conn: ConnectionDefinition = {
      id: 'c1',
      sourceMomentId: 'fr1',
      targetContextId: 'ctx-2',
      eventId: 'evt-1',
      connectionType: 'crosses-to',
      schemaContract: { eventType: 'OrderPlaced', fields: [], relationshipType: 'Partnership' },
    };
    const moment: MomentDefinition = {
      id: 'fr1',
      name: 'M1',
      contextEntries: [{ contextId: 'ctx-1', nodeName: 'PlaceOrder', nodeKind: 'command' }],
    };
    const flow: FlowDefinition = {
      id: 'f1',
      name: 'Flow',
      lanes: [],
      moments: [moment],
      connections: [conn],
    };
    const ir = makeIR({ contexts: [ctx1, ctx2], flows: [flow] });

    const analysis = generateImpactAnalysis(ir);

    const crossingNode = analysis.nodes.find((n) => n.type === 'crossing');
    expect(crossingNode).toBeDefined();
    expect(crossingNode!.context).toBe('Sales');
  });
});
