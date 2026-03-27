import type { FieldConstraint } from './field-constraint.js';

export interface PayloadValidationStep {
  readonly eventType: string;
  readonly expectedFields: FieldConstraint[];
  readonly versionConstraint?: string;
}
