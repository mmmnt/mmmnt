export interface ContractViolation {
  readonly fieldName: string;
  readonly expected: string;
  readonly actual: string;
  readonly constraintViolated: string;
}

export interface ContractValidationResult {
  readonly crossingId: string;
  readonly valid: boolean;
  readonly violations: readonly ContractViolation[];
}
