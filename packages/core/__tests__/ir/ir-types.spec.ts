/**
 * MMNT-29 IR Types — Structural Compilation Tests
 *
 * These tests verify that all IR type interfaces compile correctly
 * and can be instantiated as pure data objects with no class instances,
 * methods, or side effects.
 */
import { describe, it, expect } from 'vitest';
import type {
  IntermediateRepresentation,
  SpecificationMetadata,
  GlossaryEntry,
  ContextRelationship,
  ContextDefinition,
  AggregateDefinition,
  CommandDefinition,
  PreconditionDefinition,
  EventDefinition,
  ValueObjectDefinition,
  FieldDefinition,
  InvariantDefinition,
  DomainServiceDefinition,
  PolicyDefinition,
  SagaDefinition,
  FlowDefinition,
  FrameDefinition,
  FrameEntry,
  BranchDefinition,
  ConnectionDefinition,
  SchemaContract,
  SchemaFieldDefinition,
  ManifestConfiguration,
  WatchConfiguration,
  FileRef,
  GeneratorConfig,
  ParseResult,
  ValidationResult,
  Diagnostic,
  SourceLocation,
  ImportResult,
  UpstreamFingerprint,
} from '../../src/ir/index.js';

describe('IR Types', () => {
  describe('IntermediateRepresentation', () => {
    it('has contexts, flows, glossary, relationships, metadata fields', () => {
      const ir: IntermediateRepresentation = {
        contexts: [],
        flows: [],
        glossary: [],
        relationships: [],
        metadata: { name: 'test', version: '1.0.0' },
      };

      expect(ir.contexts).toEqual([]);
      expect(ir.flows).toEqual([]);
      expect(ir.glossary).toEqual([]);
      expect(ir.relationships).toEqual([]);
      expect(ir.metadata).toEqual({ name: 'test', version: '1.0.0' });
    });
  });

  describe('SpecificationMetadata', () => {
    it('has name, version and optional description, generatedAt', () => {
      const meta: SpecificationMetadata = {
        name: 'TestSpec',
        version: '1.0.0',
        description: 'A test specification',
        generatedAt: '2026-01-01T00:00:00Z',
      };

      expect(meta.name).toBe('TestSpec');
      expect(meta.version).toBe('1.0.0');
      expect(meta.description).toBe('A test specification');
      expect(meta.generatedAt).toBe('2026-01-01T00:00:00Z');
    });
  });

  describe('GlossaryEntry', () => {
    it('has term, definition, and optional context', () => {
      const entry: GlossaryEntry = {
        term: 'Aggregate',
        definition: 'A cluster of domain objects',
        context: 'OrderManagement',
      };

      expect(entry.term).toBe('Aggregate');
      expect(entry.definition).toBe('A cluster of domain objects');
      expect(entry.context).toBe('OrderManagement');
    });
  });

  describe('ContextRelationship', () => {
    it('has sourceContextId, targetContextId, relationshipType, and optional contract', () => {
      const rel: ContextRelationship = {
        sourceContextId: 'ctx-1',
        targetContextId: 'ctx-2',
        relationshipType: 'CustomerSupplier',
        contract: 'OrderPlaced schema',
      };

      expect(rel.sourceContextId).toBe('ctx-1');
      expect(rel.targetContextId).toBe('ctx-2');
      expect(rel.relationshipType).toBe('CustomerSupplier');
      expect(rel.contract).toBe('OrderPlaced schema');
    });
  });

  describe('ContextDefinition', () => {
    it('has id, name, aggregates, domainServices, commands, events, policies, valueObjects, invariants', () => {
      const ctx: ContextDefinition = {
        id: 'ctx-1',
        name: 'OrderManagement',
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

      expect(ctx.id).toBe('ctx-1');
      expect(ctx.name).toBe('OrderManagement');
      expect(ctx.classification).toBe('Core');
      expect(ctx.aggregates).toEqual([]);
      expect(ctx.domainServices).toEqual([]);
      expect(ctx.commands).toEqual([]);
      expect(ctx.events).toEqual([]);
      expect(ctx.policies).toEqual([]);
      expect(ctx.sagas).toEqual([]);
      expect(ctx.valueObjects).toEqual([]);
      expect(ctx.invariants).toEqual([]);
    });
  });

  describe('AggregateDefinition', () => {
    it('has id, name, identityField, commands, events, valueObjects, invariants', () => {
      const agg: AggregateDefinition = {
        id: 'agg-1',
        name: 'Order',
        identityField: { name: 'orderId', type: 'string', isArray: false, required: true },
        commands: [],
        events: [],
        valueObjects: [],
        invariants: [],
      };

      expect(agg.id).toBe('agg-1');
      expect(agg.name).toBe('Order');
      expect(agg.identityField.name).toBe('orderId');
      expect(agg.commands).toEqual([]);
    });
  });

  describe('CommandDefinition', () => {
    it('has id, name, inputs, preconditions, emitsEvent', () => {
      const cmd: CommandDefinition = {
        id: 'cmd-1',
        name: 'PlaceOrder',
        inputs: [{ name: 'customerId', type: 'string', isArray: false, required: true }],
        preconditions: [{ name: 'CustomerExists', description: 'Customer must exist' }],
        emitsEvent: 'OrderPlaced',
      };

      expect(cmd.id).toBe('cmd-1');
      expect(cmd.name).toBe('PlaceOrder');
      expect(cmd.inputs).toHaveLength(1);
      expect(cmd.preconditions).toHaveLength(1);
      expect(cmd.emitsEvent).toBe('OrderPlaced');
    });
  });

  describe('PreconditionDefinition', () => {
    it('has name and description', () => {
      const pre: PreconditionDefinition = {
        name: 'CustomerExists',
        description: 'The customer must exist in the system',
      };

      expect(pre.name).toBe('CustomerExists');
      expect(pre.description).toBe('The customer must exist in the system');
    });
  });

  describe('EventDefinition', () => {
    it('has id, name, fields', () => {
      const evt: EventDefinition = {
        id: 'evt-1',
        name: 'OrderPlaced',
        fields: [{ name: 'orderId', type: 'string', isArray: false, required: true }],
      };

      expect(evt.id).toBe('evt-1');
      expect(evt.name).toBe('OrderPlaced');
      expect(evt.fields).toHaveLength(1);
    });
  });

  describe('ValueObjectDefinition', () => {
    it('has id, name, fields', () => {
      const vo: ValueObjectDefinition = {
        id: 'vo-1',
        name: 'Address',
        fields: [
          { name: 'street', type: 'string', isArray: false, required: true },
          { name: 'city', type: 'string', isArray: false, required: true },
        ],
      };

      expect(vo.id).toBe('vo-1');
      expect(vo.name).toBe('Address');
      expect(vo.fields).toHaveLength(2);
    });
  });

  describe('FieldDefinition', () => {
    it('has name, type, isArray, required', () => {
      const field: FieldDefinition = {
        name: 'tags',
        type: 'string',
        isArray: true,
        required: false,
      };

      expect(field.name).toBe('tags');
      expect(field.type).toBe('string');
      expect(field.isArray).toBe(true);
      expect(field.required).toBe(false);
    });
  });

  describe('InvariantDefinition', () => {
    it('has id, description, scope', () => {
      const inv: InvariantDefinition = {
        id: 'inv-1',
        description: 'Order total must be positive',
        scope: 'Order',
      };

      expect(inv.id).toBe('inv-1');
      expect(inv.description).toBe('Order total must be positive');
      expect(inv.scope).toBe('Order');
    });
  });

  describe('DomainServiceDefinition', () => {
    it('has id, name, consumes, produces, description', () => {
      const svc: DomainServiceDefinition = {
        id: 'svc-1',
        name: 'PricingService',
        consumes: 'PriceRequest',
        produces: 'PriceCalculated',
        description: 'Calculates order prices',
      };

      expect(svc.id).toBe('svc-1');
      expect(svc.name).toBe('PricingService');
      expect(svc.consumes).toBe('PriceRequest');
      expect(svc.produces).toBe('PriceCalculated');
    });
  });

  describe('PolicyDefinition', () => {
    it('has id, name, trigger, action, and optional chainsTo', () => {
      const pol: PolicyDefinition = {
        id: 'pol-1',
        name: 'FraudCheckPolicy',
        trigger: 'OrderPlaced',
        action: 'CheckFraud',
        chainsTo: 'FraudChecked',
      };

      expect(pol.id).toBe('pol-1');
      expect(pol.name).toBe('FraudCheckPolicy');
      expect(pol.trigger).toBe('OrderPlaced');
      expect(pol.action).toBe('CheckFraud');
      expect(pol.chainsTo).toBe('FraudChecked');
    });
  });

  describe('FlowDefinition', () => {
    it('has id, name, optional description, frames, connections', () => {
      const flow: FlowDefinition = {
        id: 'flow-1',
        name: 'OrderFlow',
        description: 'The main order processing flow',
        frames: [],
        connections: [],
      };

      expect(flow.id).toBe('flow-1');
      expect(flow.name).toBe('OrderFlow');
      expect(flow.description).toBe('The main order processing flow');
      expect(flow.frames).toEqual([]);
      expect(flow.connections).toEqual([]);
    });
  });

  describe('FrameDefinition', () => {
    it('has id, name, contextEntries, optional branches and terminal', () => {
      const frame: FrameDefinition = {
        id: 'frame-1',
        name: 'InitiateOrder',
        contextEntries: [
          {
            contextId: 'ctx-1',
            nodeName: 'PlaceOrder',
            nodeKind: 'command',
          },
        ],
        branches: [
          {
            condition: 'order.isValid',
            entries: [{ contextId: 'ctx-1', nodeName: 'OrderPlaced', nodeKind: 'event' }],
          },
        ],
        terminal: false,
      };

      expect(frame.id).toBe('frame-1');
      expect(frame.name).toBe('InitiateOrder');
      expect(frame.contextEntries).toHaveLength(1);
      expect(frame.contextEntries[0].nodeKind).toBe('command');
      expect(frame.branches).toHaveLength(1);
      expect(frame.terminal).toBe(false);
    });
  });

  describe('FrameEntry', () => {
    it('has contextId, nodeName, nodeKind, and optional multiplicity, optional, terminal', () => {
      const entry: FrameEntry = {
        contextId: 'ctx-1',
        nodeName: 'ProcessPayment',
        nodeKind: 'saga',
        multiplicity: 3,
        optional: true,
        terminal: false,
      };

      expect(entry.contextId).toBe('ctx-1');
      expect(entry.nodeName).toBe('ProcessPayment');
      expect(entry.nodeKind).toBe('saga');
      expect(entry.multiplicity).toBe(3);
      expect(entry.optional).toBe(true);
      expect(entry.terminal).toBe(false);
    });
  });

  describe('BranchDefinition', () => {
    it('has condition and entries', () => {
      const branch: BranchDefinition = {
        condition: 'payment.approved',
        entries: [{ contextId: 'ctx-1', nodeName: 'PaymentConfirmed', nodeKind: 'event' }],
      };

      expect(branch.condition).toBe('payment.approved');
      expect(branch.entries).toHaveLength(1);
    });
  });

  describe('ConnectionDefinition', () => {
    it('has crossing connection with required schemaContract', () => {
      const conn: ConnectionDefinition = {
        id: 'conn-1',
        sourceFrameId: 'frame-1',
        targetContextId: 'ctx-2',
        eventId: 'evt-1',
        connectionType: 'crosses-to',
        schemaContract: {
          eventType: 'OrderPlaced',
          version: '1.0',
          fields: [{ name: 'orderId', type: 'string', required: true }],
          relationshipType: 'CustomerSupplier',
        },
      };

      expect(conn.id).toBe('conn-1');
      expect(conn.connectionType).toBe('crosses-to');
      if (conn.connectionType === 'crosses-to') {
        expect(conn.schemaContract).toBeDefined();
        expect(conn.schemaContract.eventType).toBe('OrderPlaced');
      }
    });

    it('has non-crossing connection without schemaContract', () => {
      const conn: ConnectionDefinition = {
        id: 'conn-2',
        sourceFrameId: 'frame-1',
        targetContextId: 'ctx-1',
        eventId: 'evt-2',
        connectionType: 'triggered-by',
      };

      expect(conn.connectionType).toBe('triggered-by');
    });
  });

  describe('SchemaContract', () => {
    it('has eventType, optional version, fields, relationshipType', () => {
      const contract: SchemaContract = {
        eventType: 'OrderPlaced',
        version: '2.0',
        fields: [
          { name: 'orderId', type: 'string', required: true },
          { name: 'items', type: 'array', required: false },
        ],
        relationshipType: 'Partnership',
      };

      expect(contract.eventType).toBe('OrderPlaced');
      expect(contract.version).toBe('2.0');
      expect(contract.fields).toHaveLength(2);
      expect(contract.relationshipType).toBe('Partnership');
    });
  });

  describe('SchemaFieldDefinition', () => {
    it('has name, type, required', () => {
      const field: SchemaFieldDefinition = {
        name: 'orderId',
        type: 'string',
        required: true,
      };

      expect(field.name).toBe('orderId');
      expect(field.type).toBe('string');
      expect(field.required).toBe(true);
    });
  });

  describe('ManifestConfiguration', () => {
    it('has name, version, contexts, flows, generators, watch', () => {
      const manifest: ManifestConfiguration = {
        name: 'MyProject',
        version: '1.0.0',
        description: 'My project description',
        contexts: [{ name: 'Orders', path: './contexts/orders.moment' }],
        flows: [{ name: 'OrderFlow', path: './flows/order-flow.moment' }],
        generators: [{ format: 'typescript', outputDir: './generated' }],
        watch: { enabled: true, debounceMs: 300, paths: ['./contexts', './flows'] },
      };

      expect(manifest.name).toBe('MyProject');
      expect(manifest.version).toBe('1.0.0');
      expect(manifest.contexts).toHaveLength(1);
      expect(manifest.flows).toHaveLength(1);
      expect(manifest.generators).toHaveLength(1);
      expect(manifest.watch.enabled).toBe(true);
    });
  });

  describe('FileRef', () => {
    it('has name and path', () => {
      const ref: FileRef = { name: 'Orders', path: './contexts/orders.moment' };

      expect(ref.name).toBe('Orders');
      expect(ref.path).toBe('./contexts/orders.moment');
    });
  });

  describe('GeneratorConfig', () => {
    it('has format and outputDir', () => {
      const gen: GeneratorConfig = { format: 'gherkin', outputDir: './features' };

      expect(gen.format).toBe('gherkin');
      expect(gen.outputDir).toBe('./features');
    });
  });

  describe('WatchConfiguration', () => {
    it('has enabled, debounceMs, paths', () => {
      const watch: WatchConfiguration = {
        enabled: false,
        debounceMs: 500,
        paths: ['./src'],
      };

      expect(watch.enabled).toBe(false);
      expect(watch.debounceMs).toBe(500);
      expect(watch.paths).toEqual(['./src']);
    });
  });

  describe('ParseResult', () => {
    it('has optional ir, diagnostics, success', () => {
      const result: ParseResult = {
        diagnostics: [],
        success: true,
      };

      expect(result.ir).toBeUndefined();
      expect(result.diagnostics).toEqual([]);
      expect(result.success).toBe(true);
    });
  });

  describe('ValidationResult', () => {
    it('has valid and diagnostics', () => {
      const result: ValidationResult = {
        valid: false,
        diagnostics: [{ severity: 'error', message: 'Missing aggregate identity' }],
      };

      expect(result.valid).toBe(false);
      expect(result.diagnostics).toHaveLength(1);
      expect(result.diagnostics[0].severity).toBe('error');
    });
  });

  describe('Diagnostic', () => {
    it('has severity, message, optional source and ruleId', () => {
      const diag: Diagnostic = {
        severity: 'warning',
        message: 'Unused event',
        source: { file: 'orders.moment', line: 10, column: 5 },
        ruleId: 'no-unused-events',
      };

      expect(diag.severity).toBe('warning');
      expect(diag.message).toBe('Unused event');
      expect(diag.source?.file).toBe('orders.moment');
      expect(diag.ruleId).toBe('no-unused-events');
    });
  });

  describe('SourceLocation', () => {
    it('has file, line, column, optional endLine and endColumn', () => {
      const loc: SourceLocation = {
        file: 'orders.moment',
        line: 10,
        column: 5,
        endLine: 10,
        endColumn: 20,
      };

      expect(loc.file).toBe('orders.moment');
      expect(loc.line).toBe(10);
      expect(loc.column).toBe(5);
      expect(loc.endLine).toBe(10);
      expect(loc.endColumn).toBe(20);
    });
  });

  describe('ImportResult', () => {
    it('has contextFiles, flowFiles, manifestEntries, fingerprint, diagnostics', () => {
      const result: ImportResult = {
        contextFiles: [{ name: 'Orders', path: './orders.moment' }],
        flowFiles: [],
        manifestEntries: [],
        fingerprint: {
          source: 'upstream-repo',
          version: '2.0.0',
          hash: 'abc123',
          importedAt: '2026-01-01T00:00:00Z',
        },
        diagnostics: [],
      };

      expect(result.contextFiles).toHaveLength(1);
      expect(result.flowFiles).toEqual([]);
      expect(result.fingerprint.source).toBe('upstream-repo');
      expect(result.fingerprint.hash).toBe('abc123');
      expect(result.diagnostics).toEqual([]);
    });
  });

  describe('UpstreamFingerprint', () => {
    it('has source, version, hash, importedAt', () => {
      const fp: UpstreamFingerprint = {
        source: 'github.com/org/repo',
        version: '1.0.0',
        hash: 'sha256:deadbeef',
        importedAt: '2026-03-26T12:00:00Z',
      };

      expect(fp.source).toBe('github.com/org/repo');
      expect(fp.version).toBe('1.0.0');
      expect(fp.hash).toBe('sha256:deadbeef');
      expect(fp.importedAt).toBe('2026-03-26T12:00:00Z');
    });
  });

  describe('barrel export', () => {
    it('all types exportable from @mmmnt/core', async () => {
      // Dynamically import the root barrel to verify the full re-export chain
      const barrel = await import('../../src/index.js');
      // Barrel re-exports only types, so the module object should exist at runtime
      expect(barrel).toBeDefined();
    });
  });

  describe('pure data', () => {
    it('no class instances, methods, or side effects', () => {
      const ir: IntermediateRepresentation = {
        contexts: [],
        flows: [],
        glossary: [],
        relationships: [],
        metadata: { name: 'test', version: '0.1.0' },
      };

      // Verify it is a plain object, not a class instance
      expect(ir.constructor).toBe(Object);
      expect(Object.getPrototypeOf(ir)).toBe(Object.prototype);

      // Verify no methods on the object
      const methods = Object.values(ir).filter((v) => typeof v === 'function');
      expect(methods).toHaveLength(0);
    });
  });
});
