import { describe, it, expect } from 'vitest';
import type { IntermediateRepresentation } from '@mmmnt/core';
import { renderContextMap } from '../renderers/context-map-renderer.js';

function makeIR(overrides: Partial<IntermediateRepresentation> = {}): IntermediateRepresentation {
  return {
    contexts: overrides.contexts ?? [],
    flows: overrides.flows ?? [],
    glossary: overrides.glossary ?? [],
    relationships: overrides.relationships ?? [],
    metadata: overrides.metadata ?? { name: 'test', version: '1.0.0' },
  };
}

function makeContext(
  id: string,
  name: string,
  classification?: 'Core' | 'Supporting' | 'Generic' | 'Terminal',
) {
  return {
    id,
    name,
    classification,
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

describe('ContextMapRenderer', () => {
  it('renders minimal IR — single context, no edges', () => {
    const ir = makeIR({
      contexts: [makeContext('ctx-ordering', 'Ordering', 'Core')],
    });

    const layout = renderContextMap(ir);

    expect(layout.nodes).toHaveLength(1);
    expect(layout.nodes[0].contextName).toBe('Ordering');
    expect(layout.nodes[0].classification).toBe('Core');
    expect(layout.nodes[0].isExternal).toBe(false);
    expect(layout.edges).toHaveLength(0);
    expect(layout.dimensions.width).toBeGreaterThan(0);
    expect(layout.dimensions.height).toBeGreaterThan(0);
  });

  it('renders multi-context with relationship edges', () => {
    const ir = makeIR({
      contexts: [
        makeContext('ctx-ordering', 'Ordering', 'Core'),
        makeContext('ctx-shipping', 'Shipping', 'Supporting'),
        makeContext('ctx-billing', 'Billing', 'Supporting'),
      ],
      relationships: [
        {
          sourceContextId: 'ctx-ordering',
          targetContextId: 'ctx-shipping',
          relationshipType: 'Customer-Supplier',
          contract: 'OrderPlaced',
        },
        {
          sourceContextId: 'ctx-ordering',
          targetContextId: 'ctx-billing',
          relationshipType: 'Customer-Supplier',
          contract: 'OrderConfirmed',
        },
      ],
    });

    const layout = renderContextMap(ir);

    expect(layout.nodes).toHaveLength(3);
    expect(layout.edges).toHaveLength(2);
    expect(layout.edges[0].sourceContext).toBe('ctx-ordering');
    expect(layout.edges[0].targetContext).toBe('ctx-shipping');
    expect(layout.edges[1].targetContext).toBe('ctx-billing');
  });

  it('carries correct relationship type labels on edges', () => {
    const ir = makeIR({
      contexts: [
        makeContext('ctx-a', 'A'),
        makeContext('ctx-b', 'B'),
        makeContext('ctx-c', 'C'),
        makeContext('ctx-d', 'D'),
      ],
      relationships: [
        {
          sourceContextId: 'ctx-a',
          targetContextId: 'ctx-b',
          relationshipType: 'Customer-Supplier',
          contract: 'evt1',
        },
        {
          sourceContextId: 'ctx-b',
          targetContextId: 'ctx-c',
          relationshipType: 'Partnership',
          contract: 'evt2',
        },
        {
          sourceContextId: 'ctx-c',
          targetContextId: 'ctx-d',
          relationshipType: 'Conformist',
          contract: 'evt3',
        },
      ],
    });

    const layout = renderContextMap(ir);

    expect(layout.edges[0].relationshipType).toBe('Customer-Supplier');
    expect(layout.edges[0].label).toBe('Customer-Supplier');
    expect(layout.edges[1].relationshipType).toBe('Partnership');
    expect(layout.edges[2].relationshipType).toBe('Conformist');
  });

  it('VZ-01: determinism — same IR produces identical ContextMapLayout', () => {
    const ir = makeIR({
      contexts: [
        makeContext('ctx-ordering', 'Ordering', 'Core'),
        makeContext('ctx-shipping', 'Shipping'),
      ],
      relationships: [
        {
          sourceContextId: 'ctx-ordering',
          targetContextId: 'ctx-shipping',
          relationshipType: 'Customer-Supplier',
          contract: 'OrderPlaced',
        },
      ],
    });

    const layout1 = renderContextMap(ir);
    const layout2 = renderContextMap(ir);

    expect(JSON.stringify(layout1)).toBe(JSON.stringify(layout2));
  });

  it('VZ-02: pure function — no mutations to input IR', () => {
    const ir = makeIR({
      contexts: [makeContext('ctx-ordering', 'Ordering')],
      relationships: [
        {
          sourceContextId: 'ctx-ordering',
          targetContextId: 'ctx-shipping',
          relationshipType: 'Partnership',
          contract: 'evt',
        },
      ],
    });
    const snapshot = JSON.stringify(ir);

    renderContextMap(ir);

    expect(JSON.stringify(ir)).toBe(snapshot);
  });

  it('handles empty IR — zero contexts, zero relationships', () => {
    const ir = makeIR();

    const layout = renderContextMap(ir);

    expect(layout.nodes).toHaveLength(0);
    expect(layout.edges).toHaveLength(0);
    expect(layout.dimensions.width).toBe(0);
    expect(layout.dimensions.height).toBe(0);
  });
});
