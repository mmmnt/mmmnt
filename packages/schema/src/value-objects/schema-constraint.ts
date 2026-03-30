export type ConstraintTarget = 'eventType' | 'fieldName';

export interface SchemaConstraint {
  readonly constraintType: string;
  readonly target: ConstraintTarget;
  readonly parameters: Readonly<Record<string, unknown>>;
  readonly ruleId: string;
}
