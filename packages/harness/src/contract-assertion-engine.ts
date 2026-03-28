import type { SchemaContract, SchemaFieldDefinition } from '@mmmnt/core';
import type { ContractValidationResult, ContractViolation } from './types/index.js';

/**
 * ContractAssertionEngine validates event payloads against IR schema contracts.
 * Covers all required fields (TE-02) and returns ContractValidationResult with violation details.
 *
 * Infrastructure-agnostic (Design Principle #6).
 */
export class ContractAssertionEngine {
  validate(
    crossingId: string,
    payload: Readonly<Record<string, unknown>>,
    contract: SchemaContract,
  ): ContractValidationResult {
    const violations: ContractViolation[] = [];

    for (const field of contract.fields) {
      const value = payload[field.name];

      if (value === undefined || value === null) {
        if (field.required) {
          violations.push({
            fieldName: field.name,
            expected: field.type,
            actual: 'missing',
            constraintViolated: 'required field missing',
          });
        }
        continue;
      }

      const actualType = this.resolveType(value);
      if (!this.typesMatch(actualType, field.type)) {
        violations.push({
          fieldName: field.name,
          expected: field.type,
          actual: actualType,
          constraintViolated: 'type mismatch',
        });
      }
    }

    return {
      crossingId,
      valid: violations.length === 0,
      violations,
    };
  }

  validateAll(
    crossingId: string,
    payload: Readonly<Record<string, unknown>>,
    contract: SchemaContract,
  ): ContractValidationResult {
    return this.validate(crossingId, payload, contract);
  }

  coversAllRequiredFields(
    payload: Readonly<Record<string, unknown>>,
    fields: readonly SchemaFieldDefinition[],
  ): boolean {
    const requiredFields = fields.filter((f) => f.required);
    return requiredFields.every((f) => payload[f.name] !== undefined && payload[f.name] !== null);
  }

  private resolveType(value: unknown): string {
    if (Array.isArray(value)) {
      return 'array';
    }
    return typeof value;
  }

  private typesMatch(actual: string, expected: string): boolean {
    return actual === expected.toLowerCase();
  }
}
