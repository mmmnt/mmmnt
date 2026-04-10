import { describe, it, expect } from 'vitest';
import { validateCrossFileReferences } from '../../src/project/index.js';
import type { IntermediateRepresentation } from '../../src/ir/index.js';

function makeIr(overrides: Partial<IntermediateRepresentation> = {}): IntermediateRepresentation {
  return {
    contexts: [],
    flows: [],
    glossary: [],
    relationships: [],
    metadata: { name: 'test', version: '1.0.0' },
    ...overrides,
  };
}

describe('validateCrossFileReferences', () => {
  it('passes for an empty IR', () => {
    const result = validateCrossFileReferences(makeIr());
    expect(result.valid).toBe(true);
    expect(result.diagnostics).toHaveLength(0);
  });

  it('passes when all lane contextIds exist', () => {
    const ir = makeIr({
      contexts: [
        {
          id: 'ctx-Ordering',
          name: 'Ordering',
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
      flows: [
        {
          id: 'flow-test',
          name: 'test',
          lanes: [
            { id: 'ordering', label: 'Ordering', contextId: 'ctx-Ordering', isBranch: false },
          ],
          moments: [],
          connections: [],
        } as any,
      ],
    });
    const result = validateCrossFileReferences(ir);
    expect(result.valid).toBe(true);
  });

  it('flags unresolved lane contextIds (PM-02)', () => {
    const ir = makeIr({
      flows: [
        {
          id: 'flow-test',
          name: 'test',
          lanes: [{ id: 'unknown', label: 'Unknown', contextId: 'ctx-Unknown', isBranch: false }],
          moments: [],
          connections: [],
        } as any,
      ],
    });
    const result = validateCrossFileReferences(ir);
    expect(result.valid).toBe(false);
    expect(result.diagnostics[0].ruleId).toBe('PM-02');
  });

  it('skips branch-lanes for PM-02', () => {
    const ir = makeIr({
      flows: [
        {
          id: 'flow-test',
          name: 'test',
          lanes: [
            { id: 'branch', label: 'BranchLane', contextId: 'ctx-BranchLane', isBranch: true },
          ],
          moments: [],
          connections: [],
        } as any,
      ],
    });
    const result = validateCrossFileReferences(ir);
    expect(result.valid).toBe(true);
  });

  it('flags unresolved relationship endpoints (PM-06)', () => {
    const ir = makeIr({
      relationships: [
        {
          sourceContextId: 'ctx-Missing',
          targetContextId: 'ctx-AlsoMissing',
          relationshipType: 'CS',
          contract: '',
        },
      ],
    });
    const result = validateCrossFileReferences(ir);
    expect(result.valid).toBe(false);
    const pm06 = result.diagnostics.filter((d) => d.ruleId === 'PM-06');
    expect(pm06).toHaveLength(2); // both source and target missing
  });

  it('passes when relationship endpoints exist', () => {
    const ir = makeIr({
      contexts: [
        { id: 'ctx-A', name: 'A', aggregates: [] } as any,
        { id: 'ctx-B', name: 'B', aggregates: [] } as any,
      ],
      relationships: [
        {
          sourceContextId: 'ctx-A',
          targetContextId: 'ctx-B',
          relationshipType: 'CS',
          contract: '',
        },
      ],
    });
    const result = validateCrossFileReferences(ir);
    expect(result.valid).toBe(true);
  });

  it('flags unresolved crossing targetContextId (PM-03)', () => {
    const ir = makeIr({
      flows: [
        {
          id: 'flow-test',
          name: 'test',
          lanes: [],
          moments: [],
          connections: [
            {
              id: 'conn-1',
              sourceMomentId: 'm-1',
              targetContextId: 'ctx-Missing',
              eventId: 'evt-X',
              connectionType: 'crosses-to',
              schemaContract: { eventType: 'X', fields: [], relationshipType: 'CS' },
            },
          ],
        } as any,
      ],
    });
    const result = validateCrossFileReferences(ir);
    expect(result.valid).toBe(false);
    expect(result.diagnostics[0].ruleId).toBe('PM-03');
  });

  it('warns when crossing event is not in target context (PM-04)', () => {
    const ir = makeIr({
      contexts: [
        {
          id: 'ctx-Target',
          name: 'Target',
          aggregates: [{ events: [{ name: 'ExistingEvent' }] }],
        } as any,
      ],
      flows: [
        {
          id: 'flow-test',
          name: 'test',
          lanes: [],
          moments: [],
          connections: [
            {
              id: 'conn-1',
              sourceMomentId: 'm-1',
              targetContextId: 'ctx-Target',
              eventId: 'evt-NonExistent',
              connectionType: 'crosses-to',
              schemaContract: { eventType: 'NonExistent', fields: [], relationshipType: 'CS' },
            },
          ],
        } as any,
      ],
    });
    const result = validateCrossFileReferences(ir);
    // PM-04 is a warning, not an error — valid should still be true
    expect(result.valid).toBe(true);
    expect(result.diagnostics[0].ruleId).toBe('PM-04');
    expect(result.diagnostics[0].severity).toBe('warning');
  });

  it('flags unresolved moment entry contextIds (PM-05)', () => {
    const ir = makeIr({
      flows: [
        {
          id: 'flow-test',
          name: 'test',
          lanes: [{ id: 'x', label: 'X', contextId: 'ctx-X', isBranch: false }],
          moments: [
            {
              id: 'm-1',
              name: 'Moment 1',
              contextEntries: [{ contextId: 'ctx-Missing', nodeName: 'Cmd', nodeKind: 'command' }],
            },
          ],
          connections: [],
        } as any,
      ],
    });
    const result = validateCrossFileReferences(ir);
    expect(result.valid).toBe(false);
    expect(result.diagnostics.some((d) => d.ruleId === 'PM-05')).toBe(true);
  });
});
