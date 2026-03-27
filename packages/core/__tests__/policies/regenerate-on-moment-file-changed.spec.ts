/**
 * MMNT-216 RegenerateOnMomentFileChanged — Unit Tests
 *
 * Verifies that the policy reads .moment files and delegates parsing to MomentParser.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MomentParser } from '../../src/parser/moment-parser.js';
import { RegenerateOnMomentFileChanged } from '../../src/policies/regenerate-on-moment-file-changed.js';

const VALID_MOMENT = `context "Ordering" [Core]

  aggregate "Order"
    identity orderId: UUID

    command PlaceOrder
      input customerId: UUID, items: OrderItem[]
      precondition orderNotPlaced: "Order has not already been placed"
      emits OrderPlaced

    event OrderPlaced
      orderId: UUID
      customerId: UUID
      items: OrderItem[]
      placedAt: DateTime

  value-object OrderItem
    productId: UUID
    quantity: number
    unitPrice: Money

  invariant ORD-01 "Order must contain at least one item"
    scope Order
`;

const INVALID_MOMENT = 'this is not valid moment syntax @#$';

let tmpDir: string;
let parser: MomentParser;
let policy: RegenerateOnMomentFileChanged;

beforeAll(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'mmnt-216-'));
  parser = new MomentParser();
  policy = new RegenerateOnMomentFileChanged(parser);
});

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('RegenerateOnMomentFileChanged', () => {
  it('produces fresh IR when valid .moment file changes', async () => {
    const filePath = join(tmpDir, 'valid.moment');
    writeFileSync(filePath, VALID_MOMENT, 'utf-8');

    const result = await policy.onFileChanged(filePath);

    expect(result.parseResult.success).toBe(true);
    expect(result.parseResult.ir).toBeDefined();
    expect(result.parseResult.ir!.contexts).toHaveLength(1);
    expect(result.parseResult.ir!.contexts[0].name).toBe('Ordering');
  });

  it('returns diagnostics when file has parse errors', async () => {
    const filePath = join(tmpDir, 'errors.moment');
    writeFileSync(filePath, INVALID_MOMENT, 'utf-8');

    const result = await policy.onFileChanged(filePath);

    expect(result.parseResult.diagnostics.length).toBeGreaterThan(0);
    expect(result.parseResult.diagnostics[0].severity).toBe('error');
  });

  it('returns success false for invalid syntax', async () => {
    const filePath = join(tmpDir, 'invalid.moment');
    writeFileSync(filePath, INVALID_MOMENT, 'utf-8');

    const result = await policy.onFileChanged(filePath);

    expect(result.parseResult.success).toBe(false);
    expect(result.parseResult.ir).toBeUndefined();
  });

  it('includes filePath in result', async () => {
    const filePath = join(tmpDir, 'filepath-check.moment');
    writeFileSync(filePath, VALID_MOMENT, 'utf-8');

    const result = await policy.onFileChanged(filePath);

    expect(result.filePath).toBe(filePath);
  });

  it('produces identical IR for same input (deterministic)', async () => {
    const filePath = join(tmpDir, 'deterministic.moment');
    writeFileSync(filePath, VALID_MOMENT, 'utf-8');

    const result1 = await policy.onFileChanged(filePath);
    const result2 = await policy.onFileChanged(filePath);

    expect(result1.parseResult.success).toBe(true);
    expect(result2.parseResult.success).toBe(true);
    expect(result1.parseResult.ir).toEqual(result2.parseResult.ir);
  });

  it('constructs with default parser when none provided', async () => {
    const defaultPolicy = new RegenerateOnMomentFileChanged();

    const filePath = join(tmpDir, 'default-parser.moment');
    writeFileSync(filePath, VALID_MOMENT, 'utf-8');

    const result = await defaultPolicy.onFileChanged(filePath);

    expect(result.parseResult.success).toBe(true);
    expect(result.parseResult.ir).toBeDefined();
  });

  it('accepts injected MomentParser instance', async () => {
    const injectedParser = new MomentParser();
    const customPolicy = new RegenerateOnMomentFileChanged(injectedParser);

    const filePath = join(tmpDir, 'injected.moment');
    writeFileSync(filePath, VALID_MOMENT, 'utf-8');

    const result = await customPolicy.onFileChanged(filePath);

    expect(result.parseResult.success).toBe(true);
    expect(result.parseResult.ir).toBeDefined();
  });
});
