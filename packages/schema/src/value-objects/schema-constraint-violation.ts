import type { RuleSeverity } from './codex-rule.js';

export interface SchemaConstraintViolation {
  readonly constraintId: string;
  readonly codexRuleId: string;
  readonly target: string;
  readonly description: string;
  readonly severity: RuleSeverity;
}
