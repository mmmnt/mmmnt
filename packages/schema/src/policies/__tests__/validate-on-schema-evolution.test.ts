import { describe, it, expect, vi } from 'vitest';
import { validateOnSchemaEvolution } from '../validate-on-schema-evolution.js';
import { CodexRuleEvaluator, type RulePackFetcher } from '../../services/codex-rule-evaluator.js';
import type { CodexRulePack } from '../../value-objects/codex-rule-pack.js';
import type { LazyFetchStrategy } from '../../value-objects/lazy-fetch-strategy.js';
import type { SchemaRegistryEvent } from '../../events/schema-registry-events.js';

function makeStrategy(overrides?: Partial<LazyFetchStrategy>): LazyFetchStrategy {
  return {
    mode: 'lazy',
    cdnEndpoint: 'https://cdn.codex.example.com/packs/latest',
    ttlSeconds: 3600,
    ...overrides,
  };
}

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

function makeRegistrationEvent(
  eventType: string,
  version: string,
  fieldNames: string[],
): SchemaRegistryEvent {
  return {
    type: 'EventSchemaRegistered',
    eventType,
    version,
    fieldDefinitions: fieldNames.map((fn) => ({
      fieldName: fn,
      fieldType: 'string',
      required: true,
    })),
    registeredBy: 'admin',
    timestamp: new Date().toISOString(),
  };
}

describe('ValidateOnSchemaEvolution', () => {
  it('empty event stream returns zero diagnostics', async () => {
    const evaluator = new CodexRuleEvaluator({
      strategy: makeStrategy({ cdnEndpoint: undefined }),
    });

    const result = await validateOnSchemaEvolution([], evaluator);

    expect(result.diagnostics).toEqual([]);
    expect(result.totalViolations).toBe(0);
    expect(result.evaluatedEventTypes).toBe(0);
  });

  it('single schema with no violations returns passedAll true', async () => {
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
      strategy: makeStrategy(),
      fetcher: makeStubFetcher(pack),
    });

    const events: SchemaRegistryEvent[] = [
      makeRegistrationEvent('UserCreated', '1.0.0', ['userId', 'email']),
    ];

    const result = await validateOnSchemaEvolution(events, evaluator);

    expect(result.evaluatedEventTypes).toBe(1);
    expect(result.totalViolations).toBe(0);
    expect(result.diagnostics[0].eventType).toBe('UserCreated');
    expect(result.diagnostics[0].evaluationResult.passedAll).toBe(true);
  });

  it('schema with naming violation surfaces diagnostics without throwing', async () => {
    const pack = makePack({
      rules: [
        {
          ruleId: 'NC-001',
          ruleType: 'naming-convention',
          parameters: { pattern: '^[a-z][a-zA-Z]*$' },
          severity: 'error',
        },
      ],
    });
    const evaluator = new CodexRuleEvaluator({
      strategy: makeStrategy(),
      fetcher: makeStubFetcher(pack),
    });

    const events: SchemaRegistryEvent[] = [
      makeRegistrationEvent('UserCreated', '1.0.0', ['userId', 'UserName']),
    ];

    const result = await validateOnSchemaEvolution(events, evaluator);

    expect(result.totalViolations).toBe(1);
    expect(result.diagnostics[0].evaluationResult.passedAll).toBe(false);
    expect(result.diagnostics[0].evaluationResult.violations[0].target).toBe('UserName');
  });

  it('multiple event types are all evaluated', async () => {
    const pack = makePack({
      rules: [
        {
          ruleId: 'NC-001',
          ruleType: 'naming-convention',
          parameters: { pattern: '^[a-z]' },
          severity: 'warning',
        },
      ],
    });
    const evaluator = new CodexRuleEvaluator({
      strategy: makeStrategy(),
      fetcher: makeStubFetcher(pack),
    });

    const events: SchemaRegistryEvent[] = [
      makeRegistrationEvent('UserCreated', '1.0.0', ['userId', 'email']),
      makeRegistrationEvent('OrderPlaced', '1.0.0', ['orderId', 'total']),
    ];

    const result = await validateOnSchemaEvolution(events, evaluator);

    expect(result.evaluatedEventTypes).toBe(2);
    expect(result.diagnostics).toHaveLength(2);
    expect(result.diagnostics[0].eventType).toBe('UserCreated');
    expect(result.diagnostics[1].eventType).toBe('OrderPlaced');
  });

  it('non-registration events do not produce extra evaluation inputs', async () => {
    const pack = makePack({ rules: [] });
    const evaluator = new CodexRuleEvaluator({
      strategy: makeStrategy(),
      fetcher: makeStubFetcher(pack),
    });

    const events: SchemaRegistryEvent[] = [
      makeRegistrationEvent('UserCreated', '1.0.0', ['userId', 'email']),
      {
        type: 'EventFieldDeprecated',
        eventType: 'UserCreated',
        fieldName: 'email',
        deprecatedSince: '2026-03-01',
        reason: 'Use contactEmail instead',
        replacement: 'contactEmail',
        timestamp: new Date().toISOString(),
      },
    ];

    const result = await validateOnSchemaEvolution(events, evaluator);

    expect(result.evaluatedEventTypes).toBe(1);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].eventType).toBe('UserCreated');
  });

  it('open-source mode evaluator returns clean diagnostics', async () => {
    const evaluator = new CodexRuleEvaluator({
      strategy: makeStrategy({ cdnEndpoint: undefined }),
    });

    const events: SchemaRegistryEvent[] = [
      makeRegistrationEvent('UserCreated', '1.0.0', ['userId', 'email']),
    ];

    const result = await validateOnSchemaEvolution(events, evaluator);

    expect(result.evaluatedEventTypes).toBe(1);
    expect(result.totalViolations).toBe(0);
    expect(result.diagnostics[0].evaluationResult.passedAll).toBe(true);
  });
});
