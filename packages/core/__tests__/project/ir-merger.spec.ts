import { describe, it, expect } from 'vitest';
import { mergeIrs } from '../../src/project/index.js';
import type { IntermediateRepresentation } from '../../src/ir/index.js';

function emptyIr(name = 'test'): IntermediateRepresentation {
  return {
    contexts: [],
    flows: [],
    glossary: [],
    relationships: [],
    metadata: { name, version: '1.0.0' },
  };
}

describe('mergeIrs', () => {
  it('returns empty IR for empty input', () => {
    const result = mergeIrs([]);
    expect(result.ir.contexts).toHaveLength(0);
    expect(result.ir.flows).toHaveLength(0);
    expect(result.ir.metadata.name).toBe('');
    expect(result.ir.metadata.version).toBe('0.0.0');
    expect(result.diagnostics).toHaveLength(0);
  });

  it('returns empty IR with metadata override for empty input', () => {
    const result = mergeIrs([], { name: 'custom', version: '2.0.0' });
    expect(result.ir.metadata.name).toBe('custom');
    expect(result.ir.metadata.version).toBe('2.0.0');
  });

  it('concatenates contexts from multiple IRs', () => {
    const ir1: IntermediateRepresentation = {
      ...emptyIr(),
      contexts: [
        {
          id: 'ctx-A',
          name: 'A',
          aggregates: [],
          commands: [],
          events: [],
          valueObjects: [],
          invariants: [],
          policies: [],
          sagas: [],
          domainServices: [],
        } as any,
      ],
    };
    const ir2: IntermediateRepresentation = {
      ...emptyIr(),
      contexts: [
        {
          id: 'ctx-B',
          name: 'B',
          aggregates: [],
          commands: [],
          events: [],
          valueObjects: [],
          invariants: [],
          policies: [],
          sagas: [],
          domainServices: [],
        } as any,
      ],
    };
    const result = mergeIrs([ir1, ir2]);
    expect(result.ir.contexts).toHaveLength(2);
    expect(result.ir.contexts[0].name).toBe('A');
    expect(result.ir.contexts[1].name).toBe('B');
  });

  it('detects duplicate context names', () => {
    const ir1: IntermediateRepresentation = {
      ...emptyIr(),
      contexts: [{ id: 'ctx-Dup', name: 'Dup', aggregates: [] } as any],
    };
    const ir2: IntermediateRepresentation = {
      ...emptyIr(),
      contexts: [{ id: 'ctx-Dup', name: 'Dup', aggregates: [] } as any],
    };
    const result = mergeIrs([ir1, ir2]);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].ruleId).toBe('PM-01');
    expect(result.diagnostics[0].message).toContain('Duplicate context name');
    expect(result.diagnostics[0].message).toContain('IR #');
  });

  it('uses first IR metadata when no override', () => {
    const ir1 = emptyIr('first');
    const ir2 = emptyIr('second');
    const result = mergeIrs([ir1, ir2]);
    expect(result.ir.metadata.name).toBe('first');
  });

  it('applies metadata override over first IR', () => {
    const ir1 = emptyIr('first');
    const result = mergeIrs([ir1], { name: 'overridden', description: 'desc' });
    expect(result.ir.metadata.name).toBe('overridden');
    expect(result.ir.metadata.description).toBe('desc');
  });

  it('concatenates glossary and relationships', () => {
    const ir1: IntermediateRepresentation = {
      ...emptyIr(),
      glossary: [{ term: 'A', definition: 'def A' }],
      relationships: [
        {
          sourceContextId: 'ctx-X',
          targetContextId: 'ctx-Y',
          relationshipType: 'CS',
          contract: '',
        },
      ],
    };
    const ir2: IntermediateRepresentation = {
      ...emptyIr(),
      glossary: [{ term: 'B', definition: 'def B' }],
      relationships: [],
    };
    const result = mergeIrs([ir1, ir2]);
    expect(result.ir.glossary).toHaveLength(2);
    expect(result.ir.relationships).toHaveLength(1);
  });
});
