import type { RulePackVersion } from './rule-pack-version.js';
import type { SchemaConstraintViolation } from './schema-constraint-violation.js';

export interface RuleEvaluationResult {
  readonly packVersion: RulePackVersion;
  readonly constraintsEvaluated: number;
  readonly violations: readonly SchemaConstraintViolation[];
  readonly passedAll: boolean;
}
