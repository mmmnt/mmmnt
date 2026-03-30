/**
 * CodexRuleEvaluator — Anti-Corruption Layer
 *
 * Translates Codex rule pack definitions into Moment-native SchemaConstraint
 * evaluations. CLI mode: lazy fetch on first evaluation, in-memory cache for
 * session duration. Violations are advisory — they never block schema operations.
 *
 * Invariants:
 *   CRE-01: Rule pack evaluation never blocks schema operations
 *   CRE-02: Cached rule pack version is immutable for session duration
 *   CRE-03: Open-source mode (no Codex) produces empty evaluation results
 *   CRE-04: CDN unreachability produces warning diagnostic, not failure
 */

import type { CodexRulePack } from '../value-objects/codex-rule-pack.js';
import type { ConstraintTarget, SchemaConstraint } from '../value-objects/schema-constraint.js';
import type { SchemaConstraintViolation } from '../value-objects/schema-constraint-violation.js';
import type { RuleEvaluationResult } from '../value-objects/rule-evaluation-result.js';
import type { RulePackVersion } from '../value-objects/rule-pack-version.js';
import type { LazyFetchStrategy } from '../value-objects/lazy-fetch-strategy.js';
import type { FetchResult } from '../value-objects/fetch-result.js';
import type { RuleSeverity } from '../value-objects/codex-rule.js';

export interface SchemaEvaluationInput {
  readonly eventType: string;
  readonly version: string;
  readonly fieldNames: readonly string[];
}

export interface RulePackFetcher {
  fetch(endpoint: string): Promise<CodexRulePack>;
}

export interface CodexRuleEvaluatorConfig {
  readonly strategy: LazyFetchStrategy;
  readonly fetcher?: RulePackFetcher;
}

const FIELD_TARGETED_RULES = new Set(['field-sensitivity-classification', 'naming-convention']);

export class CodexRuleEvaluator {
  private cachedPack: CodexRulePack | null = null;
  private cachedVersion: RulePackVersion | null = null;
  private fetchAttempted = false;

  private readonly strategy: LazyFetchStrategy;
  private readonly fetcher: RulePackFetcher | undefined;

  constructor(config: CodexRuleEvaluatorConfig) {
    this.strategy = config.strategy;
    this.fetcher = config.fetcher;
  }

  async evaluate(input: SchemaEvaluationInput): Promise<RuleEvaluationResult> {
    const fetchResult = await this.ensureFetched();

    if (this.cachedPack === null || this.cachedVersion === null) {
      return this.makeEmptyResult();
    }

    const constraints = this.translateRules(this.cachedPack);
    const severityMap = this.buildSeverityMap(this.cachedPack);
    const violations: SchemaConstraintViolation[] = [];

    for (const constraint of constraints) {
      const found = this.evaluateConstraint(constraint, input, severityMap);
      violations.push(...found);
    }

    return {
      packVersion: this.cachedVersion,
      constraintsEvaluated: constraints.length,
      violations,
      passedAll: violations.length === 0,
    };
  }

  private async ensureFetched(): Promise<FetchResult> {
    if (this.cachedPack !== null && this.cachedVersion !== null) {
      return { status: 'cacheHit', packVersion: this.cachedVersion.version };
    }

    if (this.fetchAttempted) {
      return {
        status: 'unreachable',
        diagnostic: {
          level: 'warning',
          message: 'CRE-04: Previous fetch attempt failed; using empty results for session',
        },
      };
    }

    if (!this.strategy.cdnEndpoint || !this.fetcher) {
      return {
        status: 'unreachable',
        diagnostic: {
          level: 'warning',
          message: 'CRE-03: No Codex CDN configured — operating in open-source mode',
        },
      };
    }

    this.fetchAttempted = true;

    try {
      const pack = await this.fetcher.fetch(this.strategy.cdnEndpoint);
      this.cachedPack = pack;
      this.cachedVersion = {
        packId: pack.packId,
        version: pack.version,
        fetchedAt: new Date().toISOString(),
        source: 'cdn',
      };
      return { status: 'success', packVersion: pack.version };
    } catch {
      return {
        status: 'unreachable',
        diagnostic: {
          level: 'warning',
          message: 'CRE-04: CDN unreachable — evaluation proceeds with empty results',
        },
      };
    }
  }

  private translateRules(pack: CodexRulePack): readonly SchemaConstraint[] {
    return pack.rules.map((rule) => ({
      constraintType: rule.ruleType,
      target: this.resolveTarget(rule.ruleType),
      parameters: rule.parameters,
      ruleId: rule.ruleId,
    }));
  }

  private buildSeverityMap(pack: CodexRulePack): ReadonlyMap<string, RuleSeverity> {
    const map = new Map<string, RuleSeverity>();
    for (const rule of pack.rules) {
      map.set(rule.ruleId, rule.severity);
    }
    return map;
  }

  private resolveTarget(ruleType: string): ConstraintTarget {
    return FIELD_TARGETED_RULES.has(ruleType) ? 'fieldName' : 'eventType';
  }

  private evaluateConstraint(
    constraint: SchemaConstraint,
    input: SchemaEvaluationInput,
    severityMap: ReadonlyMap<string, RuleSeverity>,
  ): readonly SchemaConstraintViolation[] {
    const severity = severityMap.get(constraint.ruleId) ?? 'warning';

    switch (constraint.constraintType) {
      case 'naming-convention':
        return this.evaluateNamingConvention(constraint, input, severity);
      case 'field-sensitivity-classification':
        return this.evaluateSensitivityClassification(constraint, input, severity);
      case 'retention-period-minimum':
      case 'deprecation-timeline-minimum':
        // Recognized but not evaluable in CLI mode — requires runtime metadata
        // not available in SchemaEvaluationInput. Counted in constraintsEvaluated.
        return [];
      default:
        return [];
    }
  }

  private evaluateNamingConvention(
    constraint: SchemaConstraint,
    input: SchemaEvaluationInput,
    severity: RuleSeverity,
  ): readonly SchemaConstraintViolation[] {
    const pattern = constraint.parameters['pattern'];
    if (typeof pattern !== 'string') {
      return [];
    }

    let regex: RegExp;
    try {
      regex = new RegExp(pattern);
    } catch {
      return [];
    }

    const violations: SchemaConstraintViolation[] = [];
    for (const fieldName of input.fieldNames) {
      if (!regex.test(fieldName)) {
        violations.push({
          constraintType: constraint.constraintType,
          ruleId: constraint.ruleId,
          target: fieldName,
          description: `Field '${fieldName}' does not match naming convention pattern '${pattern}'`,
          severity,
        });
      }
    }
    return violations;
  }

  private evaluateSensitivityClassification(
    constraint: SchemaConstraint,
    input: SchemaEvaluationInput,
    severity: RuleSeverity,
  ): readonly SchemaConstraintViolation[] {
    const sensitivePatterns = constraint.parameters['sensitivePatterns'];
    if (!Array.isArray(sensitivePatterns)) {
      return [];
    }

    const regexes: RegExp[] = [];
    for (const p of sensitivePatterns) {
      if (typeof p === 'string') {
        try {
          regexes.push(new RegExp(p, 'i'));
        } catch {
          // skip invalid patterns
        }
      }
    }

    const violations: SchemaConstraintViolation[] = [];
    for (const fieldName of input.fieldNames) {
      for (const regex of regexes) {
        if (regex.test(fieldName)) {
          violations.push({
            constraintType: constraint.constraintType,
            ruleId: constraint.ruleId,
            target: fieldName,
            description: `Field '${fieldName}' matches sensitive data pattern and requires classification`,
            severity,
          });
          break;
        }
      }
    }
    return violations;
  }

  private makeEmptyResult(): RuleEvaluationResult {
    return {
      packVersion: {
        packId: '',
        version: '',
        fetchedAt: new Date().toISOString(),
        source: 'cdn',
      },
      constraintsEvaluated: 0,
      violations: [],
      passedAll: true,
    };
  }
}
