import { describe, it, expect } from 'vitest';
import type { SchemaContract } from '@mmmnt/core';
import { ContractAssertionEngine } from '../contract-assertion-engine.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeContract(overrides: Partial<SchemaContract> = {}): SchemaContract {
  return {
    eventType: overrides.eventType ?? 'OrderPlaced',
    relationshipType: overrides.relationshipType ?? 'customer-supplier',
    fields: overrides.fields ?? [
      { name: 'orderId', type: 'string', required: true },
      { name: 'amount', type: 'number', required: true },
      { name: 'notes', type: 'string', required: false },
    ],
  };
}

// ---------------------------------------------------------------------------
// Tests — MMNT-228: ContractAssertionEngine
// ---------------------------------------------------------------------------

describe('ContractAssertionEngine', () => {
  const engine = new ContractAssertionEngine();

  it('validates valid contract — no violations', () => {
    const contract = makeContract();
    const payload = { orderId: 'ord-123', amount: 99.99, notes: 'Rush delivery' };

    const result = engine.validate('crossing-1', payload, contract);

    expect(result.crossingId).toBe('crossing-1');
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('detects missing required field', () => {
    const contract = makeContract();
    // Missing 'amount' which is required
    const payload = { orderId: 'ord-123' };

    const result = engine.validate('crossing-1', payload, contract);

    expect(result.valid).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].fieldName).toBe('amount');
    expect(result.violations[0].actual).toBe('missing');
    expect(result.violations[0].constraintViolated).toBe('required field missing');
  });

  it('detects type mismatch', () => {
    const contract = makeContract();
    // 'amount' should be number but is string
    const payload = { orderId: 'ord-123', amount: 'not-a-number' };

    const result = engine.validate('crossing-1', payload, contract);

    expect(result.valid).toBe(false);
    const typeMismatch = result.violations.find((v) => v.constraintViolated === 'type mismatch');
    expect(typeMismatch).toBeDefined();
    expect(typeMismatch!.fieldName).toBe('amount');
    expect(typeMismatch!.expected).toBe('number');
    expect(typeMismatch!.actual).toBe('string');
  });

  it('reports multiple violations', () => {
    const contract = makeContract();
    // Missing orderId (required) and amount is wrong type
    const payload = { amount: 'wrong-type' };

    const result = engine.validate('crossing-1', payload, contract);

    expect(result.valid).toBe(false);
    expect(result.violations.length).toBeGreaterThanOrEqual(2);

    const fieldNames = result.violations.map((v) => v.fieldName);
    expect(fieldNames).toContain('orderId');
    expect(fieldNames).toContain('amount');
  });

  it('validates array type fields correctly', () => {
    const contract = makeContract({
      fields: [{ name: 'items', type: 'array', required: true }],
    });

    const validPayload = { items: ['a', 'b'] };
    const invalidPayload = { items: 'not-an-array' };

    expect(engine.validate('c1', validPayload, contract).valid).toBe(true);
    expect(engine.validate('c1', invalidPayload, contract).valid).toBe(false);
  });

  it('validateAll delegates to validate', () => {
    const contract = makeContract();
    const payload = { orderId: 'ord-1', amount: 10 };

    const result = engine.validateAll('crossing-1', payload, contract);

    expect(result.crossingId).toBe('crossing-1');
    expect(result.valid).toBe(true);
  });

  it('TE-02: contract assertion covers all required fields in schema', () => {
    const contract = makeContract();
    const validPayload = { orderId: 'ord-123', amount: 50 };
    const incompletePayload = { orderId: 'ord-123' };

    // coversAllRequiredFields returns true when all required fields present
    expect(engine.coversAllRequiredFields(validPayload, contract.fields)).toBe(true);

    // coversAllRequiredFields returns false when required field missing
    expect(engine.coversAllRequiredFields(incompletePayload, contract.fields)).toBe(false);

    // Optional field 'notes' doesn't affect coverage
    const payloadWithoutOptional = { orderId: 'ord-123', amount: 50 };
    expect(engine.coversAllRequiredFields(payloadWithoutOptional, contract.fields)).toBe(true);
  });
});
