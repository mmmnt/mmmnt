import type { RuleSeverity } from './codex-rule.js';

export interface SchemaConstraintViolation {
  readonly constraintType: string;
  readonly ruleId: string;
  readonly target: string;
  readonly description: string;
  readonly severity: RuleSeverity;
}
