import { describe, it, expect } from 'vitest';
import type { IntermediateRepresentation, FlowDefinition } from '@mmmnt/core';
import { EventReplayEngine } from '../event-replay-engine.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeIR(overrides: Partial<IntermediateRepresentation> = {}): IntermediateRepresentation {
  return {
    contexts: overrides.contexts ?? [
      {
        id: 'ctx-ordering',
        name: 'Ordering',
        aggregates: [],
        domainServices: [],
        commands: [],
        events: [],
        policies: [],
        sagas: [],
        valueObjects: [],
        invariants: [],
      },
      {
        id: 'ctx-shipping',
        name: 'Shipping',
        aggregates: [],
        domainServices: [],
        commands: [],
        events: [],
        policies: [],
        sagas: [],
        valueObjects: [],
        invariants: [],
      },
    ],
    flows: overrides.flows ?? [],
    glossary: overrides.glossary ?? [],
    relationships: overrides.relationships ?? [],
    metadata: overrides.metadata ?? {
      name: 'test-spec',
      version: '1.0.0',
    },
  };
}

function makeFlow(overrides: Partial<FlowDefinition> = {}): FlowDefinition {
  return {
    id: overrides.id ?? 'flow-1',
    name: overrides.name ?? 'Place Order',
    moments: overrides.moments ?? [
      {
        id: 'moment-1',
        name: 'Accept Order',
        contextEntries: [
          { contextId: 'ctx-ordering', nodeName: 'PlaceOrder', nodeKind: 'command' as const },
        ],
      },
      {
        id: 'moment-2',
        name: 'Ship Order',
        contextEntries: [
          { contextId: 'ctx-shipping', nodeName: 'ShipOrder', nodeKind: 'command' as const },
        ],
      },
    ],
    connections: overrides.connections ?? [],
  };
}

// ---------------------------------------------------------------------------
// Tests — MMNT-227: EventReplayEngine
// ---------------------------------------------------------------------------

describe('EventReplayEngine', () => {
  const engine = new EventReplayEngine();

  it('replays flow and produces ReplayResult', () => {
    const ir = makeIR();
    const flow = makeFlow();

    const result = engine.replay(flow, ir);

    expect(result.flowId).toBe('flow-1');
    expect(result.stepsReplayed).toBe(2);
    expect(result.divergencePoints).toHaveLength(0);
    expect(result.finalStateMatch).toBe(true);
  });

  it('detects divergence points', () => {
    const ir = makeIR();
    // Frame references a context that doesn't exist in the IR
    const flow = makeFlow({
      moments: [
        {
          id: 'moment-1',
          name: 'Ghost Frame',
          contextEntries: [
            {
              contextId: 'ctx-nonexistent',
              nodeName: 'DoSomething',
              nodeKind: 'command' as const,
            },
          ],
        },
      ],
    });

    const result = engine.replay(flow, ir);

    expect(result.divergencePoints).toHaveLength(1);
    expect(result.divergencePoints[0].momentIndex).toBe(0);
    expect(result.divergencePoints[0].expectedState).toContain('ctx-nonexistent');
    expect(result.divergencePoints[0].actualState).toContain('not found');
    expect(result.divergencePoints[0].eventThatCaused).toBe('DoSomething');
  });

  it('reports finalStateMatch correctly', () => {
    const ir = makeIR();
    const flowValid = makeFlow();
    const flowInvalid = makeFlow({
      moments: [
        {
          id: 'moment-bad',
          name: 'Bad Frame',
          contextEntries: [
            { contextId: 'ctx-missing', nodeName: 'BadCmd', nodeKind: 'command' as const },
          ],
        },
      ],
    });

    const resultValid = engine.replay(flowValid, ir);
    const resultInvalid = engine.replay(flowInvalid, ir);

    expect(resultValid.finalStateMatch).toBe(true);
    expect(resultInvalid.finalStateMatch).toBe(false);
  });

  it('detects divergence in branch entries', () => {
    const ir = makeIR();
    const flow = makeFlow({
      moments: [
        {
          id: 'moment-1',
          name: 'Branched Frame',
          contextEntries: [
            { contextId: 'ctx-ordering', nodeName: 'PlaceOrder', nodeKind: 'command' as const },
          ],
          branches: [
            {
              condition: 'amount > 100',
              entries: [
                {
                  contextId: 'ctx-nonexistent',
                  nodeName: 'HighValueOrder',
                  nodeKind: 'command' as const,
                },
              ],
            },
          ],
        },
      ],
    });

    const result = engine.replay(flow, ir);

    expect(result.divergencePoints).toHaveLength(1);
    expect(result.divergencePoints[0].eventThatCaused).toBe('HighValueOrder');
  });

  it('handles empty flow (zero steps)', () => {
    const ir = makeIR();
    const flow = makeFlow({ moments: [] });

    const result = engine.replay(flow, ir);

    expect(result.flowId).toBe('flow-1');
    expect(result.stepsReplayed).toBe(0);
    expect(result.divergencePoints).toHaveLength(0);
    expect(result.finalStateMatch).toBe(true);
  });
});
