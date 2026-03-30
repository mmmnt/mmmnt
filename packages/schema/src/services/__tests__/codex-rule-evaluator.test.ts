import { describe, it, expect, vi } from 'vitest';
import {
  CodexRuleEvaluator,
  type RulePackFetcher,
  type SchemaEvaluationInput,
} from '../codex-rule-evaluator.js';
import type { CodexRulePack } from '../../value-objects/codex-rule-pack.js';
import type { LazyFetchStrategy } from '../../value-objects/lazy-fetch-strategy.js';

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

function makeInput(overrides?: Partial<SchemaEvaluationInput>): SchemaEvaluationInput {
  return {
    eventType: 'UserCreated',
    version: '1.0.0',
    fieldNames: ['userId', 'email'],
    ...overrides,
  };
}

function makeStubFetcher(pack: CodexRulePack): RulePackFetcher {
  return { fetch: vi.fn().mockResolvedValue(pack) };
}

function makeFailingFetcher(): RulePackFetcher {
  return { fetch: vi.fn().mockRejectedValue(new Error('Network error')) };
}

describe('CodexRuleEvaluator', () => {
  describe('CRE-03: open-source mode', () => {
    it('returns empty result when no cdnEndpoint configured', async () => {
      const evaluator = new CodexRuleEvaluator({
        strategy: makeStrategy({ cdnEndpoint: undefined }),
      });

      const result = await evaluator.evaluate(makeInput());

      expect(result.passedAll).toBe(true);
      expect(result.violations).toEqual([]);
      expect(result.constraintsEvaluated).toBe(0);
    });

    it('returns empty result when no fetcher provided', async () => {
      const evaluator = new CodexRuleEvaluator({
        strategy: makeStrategy(),
      });

      const result = await evaluator.evaluate(makeInput());

      expect(result.passedAll).toBe(true);
      expect(result.violations).toEqual([]);
      expect(result.constraintsEvaluated).toBe(0);
    });
  });

  describe('lazy fetch behavior', () => {
    it('does not fetch on construction', () => {
      const fetcher = makeStubFetcher(makePack());

      new CodexRuleEvaluator({
        strategy: makeStrategy(),
        fetcher,
      });

      expect(fetcher.fetch).not.toHaveBeenCalled();
    });

    it('fetches on first evaluate call', async () => {
      const fetcher = makeStubFetcher(makePack());
      const evaluator = new CodexRuleEvaluator({
        strategy: makeStrategy(),
        fetcher,
      });

      await evaluator.evaluate(makeInput());

      expect(fetcher.fetch).toHaveBeenCalledOnce();
    });

    it('uses cached pack on subsequent evaluate calls without re-fetching', async () => {
      const fetcher = makeStubFetcher(makePack());
      const evaluator = new CodexRuleEvaluator({
        strategy: makeStrategy(),
        fetcher,
      });

      await evaluator.evaluate(makeInput());
      await evaluator.evaluate(makeInput());
      await evaluator.evaluate(makeInput());

      expect(fetcher.fetch).toHaveBeenCalledOnce();
    });
  });

  describe('CRE-04: CDN unreachability', () => {
    it('returns empty result with passedAll true when CDN is unreachable', async () => {
      const fetcher = makeFailingFetcher();
      const evaluator = new CodexRuleEvaluator({
        strategy: makeStrategy(),
        fetcher,
      });

      const result = await evaluator.evaluate(makeInput());

      expect(result.passedAll).toBe(true);
      expect(result.violations).toEqual([]);
      expect(result.constraintsEvaluated).toBe(0);
    });

    it('does not retry after CDN failure', async () => {
      const fetcher = makeFailingFetcher();
      const evaluator = new CodexRuleEvaluator({
        strategy: makeStrategy(),
        fetcher,
      });

      await evaluator.evaluate(makeInput());
      await evaluator.evaluate(makeInput());

      expect(fetcher.fetch).toHaveBeenCalledOnce();
    });
  });

  describe('CRE-02: cache immutability', () => {
    it('returns same pack version across multiple evaluations', async () => {
      const fetcher = makeStubFetcher(makePack({ packId: 'pack-1', version: '2.0.0' }));
      const evaluator = new CodexRuleEvaluator({
        strategy: makeStrategy(),
        fetcher,
      });

      const r1 = await evaluator.evaluate(makeInput());
      const r2 = await evaluator.evaluate(makeInput());

      expect(r1.packVersion.packId).toBe('pack-1');
      expect(r1.packVersion.version).toBe('2.0.0');
      expect(r1.packVersion.source).toBe('cdn');
      expect(r1.packVersion.packId).toBe(r2.packVersion.packId);
      expect(r1.packVersion.version).toBe(r2.packVersion.version);
    });
  });

  describe('rule translation and evaluation', () => {
    it('detects naming-convention violations', async () => {
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
      const fetcher = makeStubFetcher(pack);
      const evaluator = new CodexRuleEvaluator({
        strategy: makeStrategy(),
        fetcher,
      });

      const result = await evaluator.evaluate(
        makeInput({ fieldNames: ['userId', 'UserName', 'email'] }),
      );

      expect(result.passedAll).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].target).toBe('UserName');
      expect(result.violations[0].ruleId).toBe('NC-001');
      expect(result.violations[0].severity).toBe('warning');
      expect(result.constraintsEvaluated).toBe(1);
    });

    it('passes naming-convention when all fields comply', async () => {
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
      const fetcher = makeStubFetcher(pack);
      const evaluator = new CodexRuleEvaluator({
        strategy: makeStrategy(),
        fetcher,
      });

      const result = await evaluator.evaluate(
        makeInput({ fieldNames: ['userId', 'email', 'createdAt'] }),
      );

      expect(result.passedAll).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('detects field-sensitivity-classification violations', async () => {
      const pack = makePack({
        rules: [
          {
            ruleId: 'SC-001',
            ruleType: 'field-sensitivity-classification',
            parameters: { sensitivePatterns: ['ssn', 'password', 'secret'] },
            severity: 'error',
          },
        ],
      });
      const fetcher = makeStubFetcher(pack);
      const evaluator = new CodexRuleEvaluator({
        strategy: makeStrategy(),
        fetcher,
      });

      const result = await evaluator.evaluate(
        makeInput({ fieldNames: ['userId', 'password', 'email'] }),
      );

      expect(result.passedAll).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].target).toBe('password');
      expect(result.violations[0].severity).toBe('error');
    });

    it('skips unknown rule types without error', async () => {
      const pack = makePack({
        rules: [
          {
            ruleId: 'FUTURE-001',
            ruleType: 'future-rule-type',
            parameters: {},
            severity: 'error',
          },
        ],
      });
      const fetcher = makeStubFetcher(pack);
      const evaluator = new CodexRuleEvaluator({
        strategy: makeStrategy(),
        fetcher,
      });

      const result = await evaluator.evaluate(makeInput());

      expect(result.passedAll).toBe(true);
      expect(result.violations).toHaveLength(0);
      expect(result.constraintsEvaluated).toBe(1);
    });
  });

  describe('CRE-01: violations are advisory', () => {
    it('returns result with violations, never throws', async () => {
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
      const fetcher = makeStubFetcher(pack);
      const evaluator = new CodexRuleEvaluator({
        strategy: makeStrategy(),
        fetcher,
      });

      const result = await evaluator.evaluate(makeInput({ fieldNames: ['VeryLongFieldName'] }));

      expect(result.passedAll).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.constraintsEvaluated).toBe(1);
    });

    it('counts all translated constraints in constraintsEvaluated', async () => {
      const pack = makePack({
        rules: [
          {
            ruleId: 'NC-001',
            ruleType: 'naming-convention',
            parameters: { pattern: '^[a-z]' },
            severity: 'warning',
          },
          {
            ruleId: 'SC-001',
            ruleType: 'field-sensitivity-classification',
            parameters: { sensitivePatterns: ['ssn'] },
            severity: 'error',
          },
          {
            ruleId: 'RT-001',
            ruleType: 'retention-period-minimum',
            parameters: { minimumDays: 90 },
            severity: 'warning',
          },
        ],
      });
      const fetcher = makeStubFetcher(pack);
      const evaluator = new CodexRuleEvaluator({
        strategy: makeStrategy(),
        fetcher,
      });

      const result = await evaluator.evaluate(makeInput());

      expect(result.constraintsEvaluated).toBe(3);
    });
  });
});
