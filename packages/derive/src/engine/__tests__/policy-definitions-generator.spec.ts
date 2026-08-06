import { describe, it, expect } from 'vitest';
import type { IntermediateRepresentation, ContextDefinition, PolicyDefinition } from '@mmmnt/core';
import { generatePolicyDefinitions } from '../policy-definitions-generator.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeIR(contexts: ContextDefinition[]): IntermediateRepresentation {
  return {
    contexts,
    flows: [],
    glossary: [],
    relationships: [],
    metadata: {
      name: 'test-spec',
      version: '1.0.0',
      description: 'Test specification',
      generatedAt: '2026-01-01T00:00:00Z',
    },
  };
}

function makeContext(
  id: string,
  name: string,
  policies: PolicyDefinition[] = [],
): ContextDefinition {
  return {
    id,
    name,
    classification: 'Core',
    aggregates: [],
    domainServices: [],
    commands: [],
    events: [],
    policies,
    sagas: [],
    valueObjects: [],
    invariants: [],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('generatePolicyDefinitions', () => {
  it('emits [] for a spec with zero policies (truthful, not missing)', () => {
    const ir = makeIR([makeContext('ctx-A', 'Alpha'), makeContext('ctx-B', 'Beta')]);

    expect(generatePolicyDefinitions(ir)).toEqual([]);
  });

  it('emits one entry per policy with the declaring contextId', () => {
    const ir = makeIR([
      makeContext('ctx-Inventory', 'Inventory', [
        {
          id: 'pol-1',
          name: 'ReplenishOnHoldRelease',
          trigger: 'HoldReleased',
          action: 'Return released quantity back to the ticket pool',
          chainsTo: 'AdjustPoolCapacity',
        },
      ]),
      makeContext('ctx-Checkout', 'Checkout', [
        {
          id: 'pol-2',
          name: 'ConvertHoldOnPayment',
          trigger: 'PaymentConfirmed',
          action: 'Convert seat hold to permanent reservation after payment clears',
          chainsTo: 'ConvertHoldToReservation',
        },
      ]),
    ]);

    const defs = generatePolicyDefinitions(ir);

    expect(defs).toEqual([
      {
        name: 'ReplenishOnHoldRelease',
        contextId: 'ctx-Inventory',
        trigger: 'HoldReleased',
        actionDescription: 'Return released quantity back to the ticket pool',
        chainsTo: ['AdjustPoolCapacity'],
      },
      {
        name: 'ConvertHoldOnPayment',
        contextId: 'ctx-Checkout',
        trigger: 'PaymentConfirmed',
        actionDescription: 'Convert seat hold to permanent reservation after payment clears',
        chainsTo: ['ConvertHoldToReservation'],
      },
    ]);
  });

  it('normalizes chainsTo to an array: absent → [], string → [string]', () => {
    const ir = makeIR([
      makeContext('ctx-A', 'Alpha', [
        { id: 'pol-1', name: 'NoChain', trigger: 'Evt', action: 'observe only' },
        { id: 'pol-2', name: 'OneChain', trigger: 'Evt', action: 'act', chainsTo: 'DoThing' },
      ]),
    ]);

    const defs = generatePolicyDefinitions(ir);

    expect(defs[0].chainsTo).toEqual([]);
    expect(defs[1].chainsTo).toEqual(['DoThing']);
  });

  it('omits actionDescription when the policy declares no action text', () => {
    const ir = makeIR([
      makeContext('ctx-A', 'Alpha', [
        { id: 'pol-1', name: 'Silent', trigger: 'Evt', action: '', chainsTo: 'Cmd' },
      ]),
    ]);

    const [def] = generatePolicyDefinitions(ir);

    expect('actionDescription' in def).toBe(false);
    expect(def.chainsTo).toEqual(['Cmd']);
  });
});
