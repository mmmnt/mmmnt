export interface FieldConstraint {
  readonly fieldName: string;
  readonly expectedType: string;
  readonly required: boolean;
  readonly constraints?: string;
}
