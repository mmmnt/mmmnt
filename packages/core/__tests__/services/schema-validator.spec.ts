import { describe, it, expect } from 'vitest';
import { SchemaValidator } from '../../src/services/schema-validator.js';
import type {
  IntermediateRepresentation,
  ValidationResult,
  ContextDefinition,
  FlowDefinition,
  ConnectionDefinition,
  MomentDefinition,
} from '../../src/ir/index.js';

function makeMinimalContext(overrides: Partial<ContextDefinition> = {}): ContextDefinition {
  return {
    id: 'ctx-1',
    name: 'TestContext',
    aggregates: [],
    domainServices: [],
    commands: [],
    events: [],
    policies: [],
    sagas: [],
    valueObjects: [],
    invariants: [],
    ...overrides,
  };
}

function makeMinimalIR(
  overrides: Partial<IntermediateRepresentation> = {},
): IntermediateRepresentation {
  return {
    contexts: [],
    flows: [],
    glossary: [],
    relationships: [],
    metadata: { name: 'test', version: '1.0.0' },
    ...overrides,
  };
}

function makeMoment(overrides: Partial<MomentDefinition> = {}): MomentDefinition {
  return {
    id: 'moment-1',
    name: 'Frame 1',
    contextEntries: [],
    ...overrides,
  };
}

describe('SchemaValidator', () => {
  const validator = new SchemaValidator();

  describe('SP-01', () => {
    it('rejects unresolved context reference in flow', () => {
      const ir = makeMinimalIR({
        contexts: [makeMinimalContext({ id: 'ctx-1' })],
        flows: [
          {
            id: 'flow-1',
            name: 'Test Flow',
            lanes: [],
            moments: [],
            connections: [
              {
                id: 'conn-1',
                sourceMomentId: 'moment-1',
                targetContextId: 'ctx-nonexistent',
                eventId: 'evt-1',
                connectionType: 'crosses-to',
                schemaContract: {
                  eventType: 'SomeEvent',
                  fields: [{ name: 'id', type: 'string', required: true }],
                  relationshipType: 'partnership',
                },
              },
            ],
          },
        ],
      });

      const result = validator.validate(ir);
      expect(result.valid).toBe(false);
      expect(result.diagnostics).toHaveLength(1);
      expect(result.diagnostics[0].ruleId).toBe('SP-01');
      expect(result.diagnostics[0].message).toContain('ctx-nonexistent');
    });

    it('accepts resolved context reference', () => {
      const ir = makeMinimalIR({
        contexts: [
          makeMinimalContext({
            id: 'ctx-target',
            events: [{ id: 'evt-1', name: 'SomeEvent', fields: [] }],
          }),
        ],
        flows: [
          {
            id: 'flow-1',
            name: 'Test Flow',
            lanes: [],
            moments: [],
            connections: [
              {
                id: 'conn-1',
                sourceMomentId: 'moment-1',
                targetContextId: 'ctx-target',
                eventId: 'evt-1',
                connectionType: 'crosses-to',
                schemaContract: {
                  eventType: 'SomeEvent',
                  fields: [{ name: 'id', type: 'string', required: true }],
                  relationshipType: 'partnership',
                },
              },
            ],
          },
        ],
      });

      const result = validator.validate(ir);
      const sp01Diagnostics = result.diagnostics.filter((d) => d.ruleId === 'SP-01');
      expect(sp01Diagnostics).toHaveLength(0);
    });
  });

  describe('SP-02', () => {
    it('rejects unresolved event in crossing', () => {
      const ir = makeMinimalIR({
        contexts: [
          makeMinimalContext({
            id: 'ctx-target',
            events: [{ id: 'evt-real', name: 'RealEvent', fields: [] }],
          }),
        ],
        flows: [
          {
            id: 'flow-1',
            name: 'Test Flow',
            lanes: [],
            moments: [],
            connections: [
              {
                id: 'conn-1',
                sourceMomentId: 'moment-1',
                targetContextId: 'ctx-target',
                eventId: 'evt-nonexistent',
                connectionType: 'crosses-to',
                schemaContract: {
                  eventType: 'SomeEvent',
                  fields: [{ name: 'id', type: 'string', required: true }],
                  relationshipType: 'partnership',
                },
              },
            ],
          },
        ],
      });

      const result = validator.validate(ir);
      const sp02Diagnostics = result.diagnostics.filter((d) => d.ruleId === 'SP-02');
      expect(sp02Diagnostics).toHaveLength(1);
      expect(sp02Diagnostics[0].message).toContain('evt-nonexistent');
    });

    it('accepts resolved event in crossing', () => {
      const ir = makeMinimalIR({
        contexts: [
          makeMinimalContext({
            id: 'ctx-target',
            events: [{ id: 'evt-1', name: 'SomeEvent', fields: [] }],
          }),
        ],
        flows: [
          {
            id: 'flow-1',
            name: 'Test Flow',
            lanes: [],
            moments: [],
            connections: [
              {
                id: 'conn-1',
                sourceMomentId: 'moment-1',
                targetContextId: 'ctx-target',
                eventId: 'evt-1',
                connectionType: 'crosses-to',
                schemaContract: {
                  eventType: 'SomeEvent',
                  fields: [{ name: 'id', type: 'string', required: true }],
                  relationshipType: 'partnership',
                },
              },
            ],
          },
        ],
      });

      const result = validator.validate(ir);
      const sp02Diagnostics = result.diagnostics.filter((d) => d.ruleId === 'SP-02');
      expect(sp02Diagnostics).toHaveLength(0);
    });
  });

  describe('SP-03', () => {
    it('rejects crossing with empty contract', () => {
      const ir = makeMinimalIR({
        contexts: [
          makeMinimalContext({
            id: 'ctx-target',
            events: [{ id: 'evt-1', name: 'SomeEvent', fields: [] }],
          }),
        ],
        flows: [
          {
            id: 'flow-1',
            name: 'Test Flow',
            lanes: [],
            moments: [],
            connections: [
              {
                id: 'conn-1',
                sourceMomentId: 'moment-1',
                targetContextId: 'ctx-target',
                eventId: 'evt-1',
                connectionType: 'crosses-to',
                schemaContract: {
                  eventType: 'SomeEvent',
                  fields: [],
                  relationshipType: 'partnership',
                },
              },
            ],
          },
        ],
      });

      const result = validator.validate(ir);
      const sp03Diagnostics = result.diagnostics.filter((d) => d.ruleId === 'SP-03');
      expect(sp03Diagnostics).toHaveLength(1);
      expect(sp03Diagnostics[0].message).toContain('empty schema contract');
    });

    it('accepts crossing with populated contract', () => {
      const ir = makeMinimalIR({
        contexts: [
          makeMinimalContext({
            id: 'ctx-target',
            events: [{ id: 'evt-1', name: 'SomeEvent', fields: [] }],
          }),
        ],
        flows: [
          {
            id: 'flow-1',
            name: 'Test Flow',
            lanes: [],
            moments: [],
            connections: [
              {
                id: 'conn-1',
                sourceMomentId: 'moment-1',
                targetContextId: 'ctx-target',
                eventId: 'evt-1',
                connectionType: 'crosses-to',
                schemaContract: {
                  eventType: 'SomeEvent',
                  fields: [{ name: 'orderId', type: 'string', required: true }],
                  relationshipType: 'partnership',
                },
              },
            ],
          },
        ],
      });

      const result = validator.validate(ir);
      const sp03Diagnostics = result.diagnostics.filter((d) => d.ruleId === 'SP-03');
      expect(sp03Diagnostics).toHaveLength(0);
    });
  });

  describe('SP-04', () => {
    it('rejects out-of-order frame references', () => {
      const ir = makeMinimalIR({
        contexts: [makeMinimalContext({ id: 'ctx-a' }), makeMinimalContext({ id: 'ctx-b' })],
        flows: [
          {
            id: 'flow-1',
            name: 'Test Flow',
            lanes: [],
            moments: [
              makeMoment({
                id: 'moment-0',
                name: 'Frame 0',
                contextEntries: [{ contextId: 'ctx-a', nodeName: 'Cmd', nodeKind: 'command' }],
              }),
              makeMoment({
                id: 'moment-1',
                name: 'Frame 1',
                contextEntries: [{ contextId: 'ctx-b', nodeName: 'Evt', nodeKind: 'event' }],
              }),
            ],
            connections: [
              {
                id: 'conn-1',
                sourceMomentId: 'moment-0',
                targetContextId: 'ctx-b',
                eventId: 'evt-1',
                connectionType: 'returns-to',
              } as ConnectionDefinition,
            ],
          },
        ],
      });

      const result = validator.validate(ir);
      const sp04Diagnostics = result.diagnostics.filter((d) => d.ruleId === 'SP-04');
      expect(sp04Diagnostics).toHaveLength(1);
      expect(sp04Diagnostics[0].message).toContain('not prior');
    });

    it('accepts temporally ordered frames', () => {
      const ir = makeMinimalIR({
        contexts: [makeMinimalContext({ id: 'ctx-a' }), makeMinimalContext({ id: 'ctx-b' })],
        flows: [
          {
            id: 'flow-1',
            name: 'Test Flow',
            lanes: [],
            moments: [
              makeMoment({
                id: 'moment-0',
                name: 'Frame 0',
                contextEntries: [{ contextId: 'ctx-a', nodeName: 'Cmd', nodeKind: 'command' }],
              }),
              makeMoment({
                id: 'moment-1',
                name: 'Frame 1',
                contextEntries: [{ contextId: 'ctx-b', nodeName: 'Evt', nodeKind: 'event' }],
              }),
            ],
            connections: [
              {
                id: 'conn-1',
                sourceMomentId: 'moment-1',
                targetContextId: 'ctx-a',
                eventId: 'evt-1',
                connectionType: 'returns-to',
              } as ConnectionDefinition,
            ],
          },
        ],
      });

      const result = validator.validate(ir);
      const sp04Diagnostics = result.diagnostics.filter((d) => d.ruleId === 'SP-04');
      expect(sp04Diagnostics).toHaveLength(0);
    });

    it('rejects returns-to with unresolvable source moment', () => {
      const ir = makeMinimalIR({
        contexts: [makeMinimalContext({ id: 'ctx-a' })],
        flows: [
          {
            id: 'flow-1',
            name: 'Test Flow',
            lanes: [],
            moments: [
              makeMoment({
                id: 'moment-0',
                name: 'Frame 0',
                contextEntries: [{ contextId: 'ctx-a', nodeName: 'Cmd', nodeKind: 'command' }],
              }),
            ],
            connections: [
              {
                id: 'conn-1',
                sourceMomentId: 'moment-nonexistent',
                targetContextId: 'ctx-a',
                eventId: 'evt-1',
                connectionType: 'returns-to',
              } as ConnectionDefinition,
            ],
          },
        ],
      });

      const result = validator.validate(ir);
      const sp04Diagnostics = result.diagnostics.filter((d) => d.ruleId === 'SP-04');
      expect(sp04Diagnostics).toHaveLength(1);
      expect(sp04Diagnostics[0].message).toContain('unresolvable source moment');
    });

    it('rejects returns-to with target context not in any frame', () => {
      const ir = makeMinimalIR({
        contexts: [makeMinimalContext({ id: 'ctx-a' }), makeMinimalContext({ id: 'ctx-b' })],
        flows: [
          {
            id: 'flow-1',
            name: 'Test Flow',
            lanes: [],
            moments: [
              makeMoment({
                id: 'moment-0',
                name: 'Frame 0',
                contextEntries: [{ contextId: 'ctx-a', nodeName: 'Cmd', nodeKind: 'command' }],
              }),
            ],
            connections: [
              {
                id: 'conn-1',
                sourceMomentId: 'moment-0',
                targetContextId: 'ctx-missing',
                eventId: 'evt-1',
                connectionType: 'returns-to',
              } as ConnectionDefinition,
            ],
          },
        ],
      });

      const result = validator.validate(ir);
      const sp04Diagnostics = result.diagnostics.filter((d) => d.ruleId === 'SP-04');
      expect(sp04Diagnostics).toHaveLength(1);
      expect(sp04Diagnostics[0].message).toContain('does not appear in any moment');
    });
  });

  describe('SP-05', () => {
    it('rejects non-existent manifest file reference', () => {
      const files = [
        { name: 'context-a', path: './contexts/a.moment' },
        { name: 'context-b', path: './contexts/b.moment' },
      ];
      const fileExists = (path: string) => path !== './contexts/b.moment';

      const result = validator.validateManifestFiles(files, fileExists);
      expect(result.valid).toBe(false);
      expect(result.diagnostics).toHaveLength(1);
      expect(result.diagnostics[0].ruleId).toBe('SP-05');
      expect(result.diagnostics[0].message).toContain('./contexts/b.moment');
    });

    it('accepts valid manifest file references', () => {
      const files = [
        { name: 'context-a', path: './contexts/a.moment' },
        { name: 'context-b', path: './contexts/b.moment' },
      ];
      const fileExists = () => true;

      const result = validator.validateManifestFiles(files, fileExists);
      expect(result.valid).toBe(true);
      expect(result.diagnostics).toHaveLength(0);
    });
  });

  describe('Integration', () => {
    it('valid spec produces zero diagnostics', () => {
      const ir = makeMinimalIR({
        contexts: [
          makeMinimalContext({
            id: 'ctx-ordering',
            events: [
              {
                id: 'evt-placed',
                name: 'OrderPlaced',
                fields: [{ name: 'orderId', type: 'string', isArray: false, required: true }],
              },
            ],
          }),
          makeMinimalContext({
            id: 'ctx-shipping',
            events: [
              {
                id: 'evt-shipped',
                name: 'OrderShipped',
                fields: [{ name: 'orderId', type: 'string', isArray: false, required: true }],
              },
            ],
          }),
        ],
        flows: [
          {
            id: 'flow-order',
            name: 'Order Flow',
            lanes: [],
            moments: [
              makeMoment({
                id: 'moment-0',
                name: 'Place Order',
                contextEntries: [
                  { contextId: 'ctx-ordering', nodeName: 'PlaceOrder', nodeKind: 'command' },
                ],
              }),
              makeMoment({
                id: 'moment-1',
                name: 'Ship Order',
                contextEntries: [
                  { contextId: 'ctx-shipping', nodeName: 'ShipOrder', nodeKind: 'command' },
                ],
              }),
            ],
            connections: [
              {
                id: 'conn-cross',
                sourceMomentId: 'moment-0',
                targetContextId: 'ctx-shipping',
                eventId: 'evt-shipped',
                connectionType: 'crosses-to',
                schemaContract: {
                  eventType: 'OrderShipped',
                  fields: [{ name: 'orderId', type: 'string', required: true }],
                  relationshipType: 'partnership',
                },
              },
            ],
          },
        ],
        glossary: [{ term: 'Order', definition: 'A purchase request' }],
        relationships: [],
        metadata: { name: 'ecommerce', version: '1.0.0' },
      });

      const result = validator.validate(ir);
      expect(result.valid).toBe(true);
      expect(result.diagnostics).toHaveLength(0);
    });

    it('returns typed ValidationResult', () => {
      const ir = makeMinimalIR();
      const result: ValidationResult = validator.validate(ir);
      expect(result).toHaveProperty('valid');
      expect(result).toHaveProperty('diagnostics');
      expect(typeof result.valid).toBe('boolean');
      expect(Array.isArray(result.diagnostics)).toBe(true);
    });
  });
});
