import { describe, it, expect, vi } from 'vitest';
import { SchemaRegistry } from '../../aggregates/schema-registry.js';
import { ConsumptionManifest } from '../../aggregates/consumption-manifest.js';
import { CodexRuleEvaluator, type RulePackFetcher } from '../../services/codex-rule-evaluator.js';
import { validateOnSchemaEvolution } from '../../policies/validate-on-schema-evolution.js';
import type { CodexRulePack } from '../../value-objects/codex-rule-pack.js';
import type { SchemaRegistryEvent } from '../../events/schema-registry-events.js';

function makePack(overrides?: Partial<CodexRulePack>): CodexRulePack {
  return {
    packId: 'pack-1',
    version: '1.0.0',
    framework: 'moment',
    effectiveDate: '2026-03-01',
    rules: [],
    ...overrides,
  };
}

function makeStubFetcher(pack: CodexRulePack): RulePackFetcher {
  return { fetch: vi.fn().mockResolvedValue(pack) };
}

describe('Schema Governance E2E', () => {
  it('full lifecycle: register, deprecate, confirm EOL, remove field', () => {
    const registry = new SchemaRegistry();
    const manifest = new ConsumptionManifest();

    // Register
    const registered = registry.registerEventSchema({
      eventType: 'UserCreated',
      version: '1.0.0',
      fieldDefinitions: [
        { fieldName: 'userId', fieldType: 'string', required: true },
        { fieldName: 'legacyId', fieldType: 'string', required: false },
      ],
      registeredBy: 'admin',
    });
    expect(registered.type).toBe('EventSchemaRegistered');
    expect(registry.getFieldPhase('UserCreated', 'legacyId')).toBe('active');

    // Deprecate
    const deprecated = registry.deprecateField({
      eventType: 'UserCreated',
      fieldName: 'legacyId',
      deprecatedSince: '2026-03-15',
      reason: 'Migrated to UUID-based identity',
      replacement: 'userId',
    });
    expect(deprecated.type).toBe('EventFieldDeprecated');
    expect(registry.getFieldPhase('UserCreated', 'legacyId')).toBe('deprecated');

    // Confirm EOL (no consumers)
    const eol = registry.confirmEndOfLife({
      eventType: 'UserCreated',
      fieldName: 'legacyId',
      confirmedBy: 'admin',
      hasActiveConsumers: !manifest.hasZeroConsumers('UserCreated', 'legacyId'),
    });
    expect(eol.type).toBe('EventFieldEndOfLife');
    expect(registry.getFieldPhase('UserCreated', 'legacyId')).toBe('end-of-life');

    // Remove
    const removed = registry.removeField({
      eventType: 'UserCreated',
      fieldName: 'legacyId',
      removedBy: 'admin',
      rationale: 'Zero consumers confirmed',
      hasActiveConsumers: !manifest.hasZeroConsumers('UserCreated', 'legacyId'),
    });
    expect(removed.type).toBe('EventFieldRemoved');
    expect(registry.getFieldPhase('UserCreated', 'legacyId')).toBe('removed');
  });

  it('SR-02: removal rejected when ConsumptionManifest shows active consumers', () => {
    const registry = new SchemaRegistry();
    const manifest = new ConsumptionManifest();

    registry.registerEventSchema({
      eventType: 'OrderPlaced',
      version: '1.0.0',
      fieldDefinitions: [
        { fieldName: 'orderId', fieldType: 'string', required: true },
        { fieldName: 'legacyRef', fieldType: 'string', required: false },
      ],
      registeredBy: 'admin',
    });

    // Declare consumption of legacyRef
    manifest.declareConsumption(
      {
        projectionId: 'order-dashboard',
        projectionName: 'OrderDashboard',
        product: 'moment',
        consumedEvents: [{ eventType: 'OrderPlaced', fields: ['legacyRef'] }],
      },
      registry,
    );

    // Deprecate and confirm EOL
    registry.deprecateField({
      eventType: 'OrderPlaced',
      fieldName: 'legacyRef',
      deprecatedSince: '2026-03-15',
      reason: 'Migrating to new reference format',
      replacement: 'orderId',
    });

    // Attempt confirm EOL with active consumers — should be rejected (SR-02)
    expect(() =>
      registry.confirmEndOfLife({
        eventType: 'OrderPlaced',
        fieldName: 'legacyRef',
        confirmedBy: 'admin',
        hasActiveConsumers: !manifest.hasZeroConsumers('OrderPlaced', 'legacyRef'),
      }),
    ).toThrow('SR-02');

    // Attempt removal from deprecated phase — rejected by SR-04 (must be end-of-life first)
    expect(() =>
      registry.removeField({
        eventType: 'OrderPlaced',
        fieldName: 'legacyRef',
        removedBy: 'admin',
        rationale: 'Clean up legacy field',
        hasActiveConsumers: !manifest.hasZeroConsumers('OrderPlaced', 'legacyRef'),
      }),
    ).toThrow('SR-04');
  });

  it('SR-04: lifecycle phase skipping rejected', () => {
    const registry = new SchemaRegistry();

    registry.registerEventSchema({
      eventType: 'PaymentProcessed',
      version: '1.0.0',
      fieldDefinitions: [
        { fieldName: 'paymentId', fieldType: 'string', required: true },
        { fieldName: 'legacyCode', fieldType: 'string', required: false },
      ],
      registeredBy: 'admin',
    });

    // Attempt to remove directly from active (skip deprecated + EOL)
    expect(() =>
      registry.removeField({
        eventType: 'PaymentProcessed',
        fieldName: 'legacyCode',
        removedBy: 'admin',
        rationale: 'Skip lifecycle',
        hasActiveConsumers: false,
      }),
    ).toThrow('SR-04');

    // Attempt to confirm EOL directly from active (skip deprecated)
    expect(() =>
      registry.confirmEndOfLife({
        eventType: 'PaymentProcessed',
        fieldName: 'legacyCode',
        confirmedBy: 'admin',
        hasActiveConsumers: false,
      }),
    ).toThrow('SR-04');
  });

  it('CodexRuleEvaluator invoked during schema evolution returns diagnostics', async () => {
    const pack = makePack({
      rules: [
        {
          ruleId: 'NC-001',
          ruleType: 'naming-convention',
          parameters: { pattern: '^[a-z][a-zA-Z]*$' },
          severity: 'warning',
        },
      ],
    });
    const evaluator = new CodexRuleEvaluator({
      strategy: { mode: 'lazy', cdnEndpoint: 'https://cdn.example.com' },
      fetcher: makeStubFetcher(pack),
    });

    const events: SchemaRegistryEvent[] = [
      {
        type: 'EventSchemaRegistered',
        eventType: 'UserCreated',
        version: '1.0.0',
        fieldDefinitions: [
          { fieldName: 'userId', fieldType: 'string', required: true },
          { fieldName: 'email', fieldType: 'string', required: true },
        ],
        registeredBy: 'admin',
        timestamp: new Date().toISOString(),
      },
    ];

    const result = await validateOnSchemaEvolution(events, evaluator);

    expect(result.evaluatedSchemas).toBe(1);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].eventType).toBe('UserCreated');
    expect(result.diagnostics[0].evaluationResult.passedAll).toBe(true);
  });

  it('CRE-01: Codex violations do not block lifecycle transitions', async () => {
    const pack = makePack({
      rules: [
        {
          ruleId: 'NC-001',
          ruleType: 'naming-convention',
          parameters: { pattern: '^[a-z]$' },
          severity: 'error',
        },
      ],
    });
    const evaluator = new CodexRuleEvaluator({
      strategy: { mode: 'lazy', cdnEndpoint: 'https://cdn.example.com' },
      fetcher: makeStubFetcher(pack),
    });

    // Register with fields that violate the naming rule
    const registry = new SchemaRegistry();
    const registered = registry.registerEventSchema({
      eventType: 'UserCreated',
      version: '1.0.0',
      fieldDefinitions: [
        { fieldName: 'userId', fieldType: 'string', required: true },
        { fieldName: 'BadFieldName', fieldType: 'string', required: false },
      ],
      registeredBy: 'admin',
    });

    // Evaluate — should have violations
    const events: SchemaRegistryEvent[] = [registered];
    const policyResult = await validateOnSchemaEvolution(events, evaluator);
    expect(policyResult.totalViolations).toBeGreaterThan(0);

    // Despite violations, lifecycle operations still work (CRE-01)
    const deprecated = registry.deprecateField({
      eventType: 'UserCreated',
      fieldName: 'BadFieldName',
      deprecatedSince: '2026-03-15',
      reason: 'Bad naming',
      replacement: 'betterFieldName',
    });
    expect(deprecated.type).toBe('EventFieldDeprecated');
    expect(registry.getFieldPhase('UserCreated', 'BadFieldName')).toBe('deprecated');
  });

  it('SR-02: removal succeeds after consumption declaration superseded', () => {
    const registry = new SchemaRegistry();
    const manifest = new ConsumptionManifest();

    registry.registerEventSchema({
      eventType: 'InvoiceCreated',
      version: '1.0.0',
      fieldDefinitions: [
        { fieldName: 'invoiceId', fieldType: 'string', required: true },
        { fieldName: 'legacyRef', fieldType: 'string', required: false },
      ],
      registeredBy: 'admin',
    });

    // Declare consumption of legacyRef
    manifest.declareConsumption(
      {
        projectionId: 'invoice-view',
        projectionName: 'InvoiceView',
        product: 'moment',
        consumedEvents: [{ eventType: 'InvoiceCreated', fields: ['legacyRef'] }],
      },
      registry,
    );

    // Supersede consumption — remove legacyRef from consumed fields (CM-02)
    manifest.declareConsumption(
      {
        projectionId: 'invoice-view',
        projectionName: 'InvoiceView v2',
        product: 'moment',
        consumedEvents: [{ eventType: 'InvoiceCreated', fields: ['invoiceId'] }],
      },
      registry,
    );

    // Now zero consumers — full lifecycle should succeed
    expect(manifest.hasZeroConsumers('InvoiceCreated', 'legacyRef')).toBe(true);

    registry.deprecateField({
      eventType: 'InvoiceCreated',
      fieldName: 'legacyRef',
      deprecatedSince: '2026-03-20',
      reason: 'Migrated to invoiceId',
      replacement: 'invoiceId',
    });

    registry.confirmEndOfLife({
      eventType: 'InvoiceCreated',
      fieldName: 'legacyRef',
      confirmedBy: 'admin',
      hasActiveConsumers: !manifest.hasZeroConsumers('InvoiceCreated', 'legacyRef'),
    });

    const removed = registry.removeField({
      eventType: 'InvoiceCreated',
      fieldName: 'legacyRef',
      removedBy: 'admin',
      rationale: 'Zero consumers after superseded declaration',
      hasActiveConsumers: !manifest.hasZeroConsumers('InvoiceCreated', 'legacyRef'),
    });

    expect(removed.type).toBe('EventFieldRemoved');
    expect(registry.getFieldPhase('InvoiceCreated', 'legacyRef')).toBe('removed');
  });
});
