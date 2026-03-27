import { describe, it, expect, vi } from 'vitest';
import type {
  IntermediateRepresentation,
  FlowDefinition,
  FrameDefinition,
  ConnectionDefinition,
  ContextDefinition,
  SchemaFieldDefinition,
} from '@mmmnt/core';
import type { TestSuiteTopology } from '../../types/index.js';
import {
  DeriveOnSpecificationParsed,
  type TopologyDerivedHook,
} from '../../policies/derive-on-specification-parsed.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMetadata(): IntermediateRepresentation['metadata'] {
  return {
    name: 'test-spec',
    version: '1.0.0',
    description: 'Test specification',
    generatedAt: '2026-01-01T00:00:00Z',
  };
}

function makeContext(id: string, name: string): ContextDefinition {
  return {
    id,
    name,
    classification: 'Core',
    aggregates: [],
    domainServices: [],
    commands: [],
    events: [],
    policies: [],
    sagas: [],
    valueObjects: [],
    invariants: [],
  };
}

function makeFrame(id: string, name: string, contextId: string, nodeName: string): FrameDefinition {
  return {
    id,
    name,
    contextEntries: [{ contextId, nodeName, nodeKind: 'command' }],
  };
}

function makeCrossingConnection(
  id: string,
  sourceFrameId: string,
  targetContextId: string,
  eventType: string,
  fields: SchemaFieldDefinition[] = [{ name: 'id', type: 'string', required: true }],
): ConnectionDefinition {
  return {
    id,
    sourceFrameId,
    targetContextId,
    eventId: `${eventType}-event`,
    connectionType: 'crosses-to',
    schemaContract: {
      eventType,
      fields,
      relationshipType: 'Partnership',
    },
  };
}

function makeFlow(
  id: string,
  name: string,
  frames: FrameDefinition[],
  connections: ConnectionDefinition[],
): FlowDefinition {
  return { id, name, frames, connections };
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DeriveOnSpecificationParsed', () => {
  // Test 1: IR triggers derivation and produces TestSuiteTopology
  it('produces a TestSuiteTopology from a valid IR', async () => {
    const ctx = makeContext('ctx-ordering', 'Ordering');
    const frame = makeFrame('fr-place', 'Place Order', 'ctx-ordering', 'PlaceOrder');
    const flow = makeFlow('flow-order', 'Order Flow', [frame], []);
    const ir = makeIR({ contexts: [ctx], flows: [flow] });

    const policy = new DeriveOnSpecificationParsed();
    const topology = await policy.execute(ir);

    expect(topology).toBeDefined();
    expect(topology.suites).toHaveLength(1);
    expect(topology.suites[0].flowId).toBe('flow-order');
    expect(topology.suites[0].flowName).toBe('Order Flow');
    expect(topology.metadata.sourceIrHash).toBeDefined();
    expect(topology.metadata.derivedAt).toBeDefined();
  });

  // Test 2: Fresh topology produced on each invocation (different IR -> different topology)
  it('produces different topologies for different IRs', async () => {
    const ctxA = makeContext('ctx-a', 'Context A');
    const frameA = makeFrame('fr-a', 'Frame A', 'ctx-a', 'CommandA');
    const flowA = makeFlow('flow-a', 'Flow A', [frameA], []);
    const irA = makeIR({ contexts: [ctxA], flows: [flowA] });

    const ctxB = makeContext('ctx-b', 'Context B');
    const frameB = makeFrame('fr-b', 'Frame B', 'ctx-b', 'CommandB');
    const flowB = makeFlow('flow-b', 'Flow B', [frameB], []);
    const irB = makeIR({ contexts: [ctxB], flows: [flowB] });

    const policy = new DeriveOnSpecificationParsed();
    const topologyA = await policy.execute(irA);
    const topologyB = await policy.execute(irB);

    expect(topologyA.suites[0].flowId).toBe('flow-a');
    expect(topologyB.suites[0].flowId).toBe('flow-b');
    expect(topologyA.metadata.sourceIrHash).not.toBe(topologyB.metadata.sourceIrHash);
  });

  // Test 3: onTopologyDerived hook is called with topology and IR
  it('calls onTopologyDerived hook with correct topology and IR', async () => {
    const ctx = makeContext('ctx-ordering', 'Ordering');
    const frame = makeFrame('fr-place', 'Place Order', 'ctx-ordering', 'PlaceOrder');
    const flow = makeFlow('flow-order', 'Order Flow', [frame], []);
    const ir = makeIR({ contexts: [ctx], flows: [flow] });

    let receivedTopology: TestSuiteTopology | undefined;
    let receivedIr: IntermediateRepresentation | undefined;

    const hook: TopologyDerivedHook = (topology, irArg) => {
      receivedTopology = topology;
      receivedIr = irArg;
    };

    const policy = new DeriveOnSpecificationParsed({
      onTopologyDerived: [hook],
    });

    const topology = await policy.execute(ir);

    expect(receivedTopology).toBe(topology);
    expect(receivedIr).toBe(ir);
  });

  // Test 4: Multiple hooks fire in parallel (Promise.all)
  it('fires multiple hooks in parallel', async () => {
    const ctx = makeContext('ctx-ordering', 'Ordering');
    const frame = makeFrame('fr-place', 'Place Order', 'ctx-ordering', 'PlaceOrder');
    const flow = makeFlow('flow-order', 'Order Flow', [frame], []);
    const ir = makeIR({ contexts: [ctx], flows: [flow] });

    const callOrder: number[] = [];

    const hook1: TopologyDerivedHook = async () => {
      // Simulate async work
      await new Promise<void>((resolve) => {
        setTimeout(() => {
          callOrder.push(1);
          resolve();
        }, 10);
      });
    };

    const hook2: TopologyDerivedHook = async () => {
      callOrder.push(2);
    };

    const hook3: TopologyDerivedHook = async () => {
      callOrder.push(3);
    };

    const policy = new DeriveOnSpecificationParsed({
      onTopologyDerived: [hook1, hook2, hook3],
    });

    await policy.execute(ir);

    // All three hooks should have been called
    expect(callOrder).toHaveLength(3);
    expect(callOrder).toContain(1);
    expect(callOrder).toContain(2);
    expect(callOrder).toContain(3);

    // hook2 and hook3 resolve before hook1 (parallel execution)
    // hook2 and hook3 are synchronous-like, hook1 has a delay
    expect(callOrder.indexOf(2)).toBeLessThan(callOrder.indexOf(1));
    expect(callOrder.indexOf(3)).toBeLessThan(callOrder.indexOf(1));
  });

  // Test 5: Failed derivation (invalid IR) surfaces error
  it('surfaces error when derivation fails with invalid IR', async () => {
    // IR with a flow missing the frames property will cause deriveTopology to throw
    const brokenFlow = { id: 'flow-broken', name: 'Broken' } as unknown as FlowDefinition;
    const brokenIr: IntermediateRepresentation = {
      contexts: [],
      flows: [brokenFlow],
      glossary: [],
      relationships: [],
      metadata: makeMetadata(),
    };

    const policy = new DeriveOnSpecificationParsed();

    await expect(policy.execute(brokenIr)).rejects.toThrow();
  });

  // Test 6: Policy works with no hooks configured
  it('works correctly with no hooks configured', async () => {
    const ctx = makeContext('ctx-ordering', 'Ordering');
    const frame = makeFrame('fr-place', 'Place Order', 'ctx-ordering', 'PlaceOrder');
    const crossing = makeCrossingConnection('conn-ship', 'fr-place', 'ctx-shipping', 'OrderPlaced');
    const flow = makeFlow('flow-order', 'Order Flow', [frame], [crossing]);
    const ir = makeIR({ contexts: [ctx], flows: [flow] });

    const policy = new DeriveOnSpecificationParsed();
    const topology = await policy.execute(ir);

    expect(topology.suites).toHaveLength(1);
    expect(topology.suites[0].testCases).toHaveLength(1);
    expect(topology.suites[0].testCases[0].assertions).toHaveLength(1);
  });

  // Test 7: Policy works with empty hooks array
  it('works correctly with empty hooks array', async () => {
    const ctx = makeContext('ctx-ordering', 'Ordering');
    const frame = makeFrame('fr-place', 'Place Order', 'ctx-ordering', 'PlaceOrder');
    const flow = makeFlow('flow-order', 'Order Flow', [frame], []);
    const ir = makeIR({ contexts: [ctx], flows: [flow] });

    const policy = new DeriveOnSpecificationParsed({
      onTopologyDerived: [],
    });

    const topology = await policy.execute(ir);

    expect(topology.suites).toHaveLength(1);
    expect(topology.suites[0].flowId).toBe('flow-order');
  });

  // Test 8: Hook errors propagate to caller
  it('propagates hook errors to the caller', async () => {
    const ctx = makeContext('ctx-ordering', 'Ordering');
    const frame = makeFrame('fr-place', 'Place Order', 'ctx-ordering', 'PlaceOrder');
    const flow = makeFlow('flow-order', 'Order Flow', [frame], []);
    const ir = makeIR({ contexts: [ctx], flows: [flow] });

    const failingHook: TopologyDerivedHook = async () => {
      throw new Error('Hook failed');
    };

    const policy = new DeriveOnSpecificationParsed({
      onTopologyDerived: [failingHook],
    });

    await expect(policy.execute(ir)).rejects.toThrow('Hook failed');
  });
});
