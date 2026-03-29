import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ASTDiffEngine } from '../../services/ast-diff-engine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.resolve(__dirname, '..', 'fixtures');

function readFixture(relativePath: string): string {
  return fs.readFileSync(path.join(fixturesDir, relativePath), 'utf-8');
}

describe('ASTDiffEngine.detectDrift', () => {
  const engine = new ASTDiffEngine();

  // -----------------------------------------------------------------------
  // 1. Returns empty DriftReport for identical files
  // -----------------------------------------------------------------------
  it('returns empty DriftReport for identical files', () => {
    const source = readFixture('expected/order.types.ts');
    const expected = new Map([['order.types.ts', source]]);
    const actual = new Map([['order.types.ts', source]]);

    const report = engine.detectDrift({ expected, actual });

    expect(report.driftPoints).toHaveLength(0);
    expect(report.totalDrifted).toBe(0);
    expect(report.totalAligned).toBe(1);
  });

  // -----------------------------------------------------------------------
  // 2. Detects added field in interface
  // -----------------------------------------------------------------------
  it('detects added field in interface', () => {
    const expectedSource = readFixture('expected/order.types.ts');
    const actualSource = readFixture('actual/order-drifted.types.ts');
    const expected = new Map([['order.types.ts', expectedSource]]);
    const actual = new Map([['order.types.ts', actualSource]]);

    const report = engine.detectDrift({ expected, actual });

    const addedField = report.driftPoints.find(
      (p) => p.description.includes("'notes'") && p.description.includes('added'),
    );
    expect(addedField).toBeDefined();
  });

  // -----------------------------------------------------------------------
  // 3. Detects removed field from interface
  // -----------------------------------------------------------------------
  it('detects removed field from interface', () => {
    // Flip: actual is the "original" (fewer fields), expected has more
    const actualSource = readFixture('expected/order.types.ts');
    const expectedSource = readFixture('actual/order-drifted.types.ts');
    const expected = new Map([['order.types.ts', expectedSource]]);
    const actual = new Map([['order.types.ts', actualSource]]);

    const report = engine.detectDrift({ expected, actual });

    const removedField = report.driftPoints.find(
      (p) => p.description.includes("'notes'") && p.description.includes('removed'),
    );
    expect(removedField).toBeDefined();
  });

  // -----------------------------------------------------------------------
  // 4. Detects changed field type
  // -----------------------------------------------------------------------
  it('detects changed field type', () => {
    const expectedSource = readFixture('expected/order.types.ts');
    const actualSource = readFixture('actual/order-drifted.types.ts');
    const expected = new Map([['order.types.ts', expectedSource]]);
    const actual = new Map([['order.types.ts', actualSource]]);

    const report = engine.detectDrift({ expected, actual });

    const changedType = report.driftPoints.find(
      (p) => p.description.includes("'amount'") && p.description.includes('changed'),
    );
    expect(changedType).toBeDefined();
    expect(changedType!.description).toContain('number');
    expect(changedType!.description).toContain('string');
  });

  // -----------------------------------------------------------------------
  // 5. Detects new interface in actual (implementation-added)
  // -----------------------------------------------------------------------
  it('detects new interface in actual (implementation-added)', () => {
    const expectedSource = `export interface Order { readonly id: string; }`;
    const actualSource = `export interface Order { readonly id: string; }\nexport interface Extra { readonly value: string; }`;
    const expected = new Map([['types.ts', expectedSource]]);
    const actual = new Map([['types.ts', actualSource]]);

    const report = engine.detectDrift({ expected, actual });

    const newIface = report.driftPoints.find((p) => p.aggregateName === 'Extra');
    expect(newIface).toBeDefined();
    expect(newIface!.driftDirection).toBe('implementation-added');
  });

  // -----------------------------------------------------------------------
  // 6. Detects missing file in actual (specification-added)
  // -----------------------------------------------------------------------
  it('detects missing file in actual (specification-added)', () => {
    const expectedSource = readFixture('expected/shipping.types.ts');
    const expected = new Map([['shipping.types.ts', expectedSource]]);
    const actual = new Map<string, string>();

    const report = engine.detectDrift({ expected, actual });

    expect(report.driftPoints).toHaveLength(1);
    expect(report.driftPoints[0].driftDirection).toBe('specification-added');
    expect(report.driftPoints[0].filePath).toBe('shipping.types.ts');
  });

  // -----------------------------------------------------------------------
  // 7. Detects extra file in actual (implementation-added)
  // -----------------------------------------------------------------------
  it('detects extra file in actual (implementation-added)', () => {
    const actualSource = readFixture('actual/extra.types.ts');
    const expected = new Map<string, string>();
    const actual = new Map([['extra.types.ts', actualSource]]);

    const report = engine.detectDrift({ expected, actual });

    expect(report.driftPoints).toHaveLength(1);
    expect(report.driftPoints[0].driftDirection).toBe('implementation-added');
    expect(report.driftPoints[0].filePath).toBe('extra.types.ts');
  });

  // -----------------------------------------------------------------------
  // 8. DriftDirection is correct for each case
  // -----------------------------------------------------------------------
  it('has correct DriftDirection for each drift case', () => {
    const expectedSource = readFixture('expected/order.types.ts');
    const actualSource = readFixture('actual/order-drifted.types.ts');
    const shippingSource = readFixture('expected/shipping.types.ts');
    const extraSource = readFixture('actual/extra.types.ts');

    const expected = new Map([
      ['order.types.ts', expectedSource],
      ['shipping.types.ts', shippingSource],
    ]);
    const actual = new Map([
      ['order.types.ts', actualSource],
      ['extra.types.ts', extraSource],
    ]);

    const report = engine.detectDrift({ expected, actual });

    // Missing file should be specification-added
    const missingFile = report.driftPoints.find((p) => p.filePath === 'shipping.types.ts');
    expect(missingFile!.driftDirection).toBe('specification-added');

    // Extra file should be implementation-added
    const extraFile = report.driftPoints.find((p) => p.filePath === 'extra.types.ts');
    expect(extraFile!.driftDirection).toBe('implementation-added');

    // Added field should be implementation-added
    const addedField = report.driftPoints.find((p) => p.description.includes("'notes'"));
    expect(addedField!.driftDirection).toBe('implementation-added');

    // Changed type should be specification-added
    const changedType = report.driftPoints.find(
      (p) => p.description.includes("'amount'") && p.description.includes('changed'),
    );
    expect(changedType!.driftDirection).toBe('specification-added');
  });

  // -----------------------------------------------------------------------
  // 9. IS-02: implementation-level changes don't appear in report
  // -----------------------------------------------------------------------
  it('ignores implementation-level code (functions, private methods)', () => {
    const actualSource = readFixture('actual/implementation-only.ts');
    const expected = new Map([['impl.ts', '']]);
    const actual = new Map([['impl.ts', actualSource]]);

    const report = engine.detectDrift({ expected, actual });

    // No exported type-level symbols in implementation-only.ts,
    // so no drift points should be generated for type differences
    const typePoints = report.driftPoints.filter(
      (p) => p.description.includes('processOrder') || p.description.includes('OrderProcessor'),
    );
    expect(typePoints).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // 10. Handles empty input (no files)
  // -----------------------------------------------------------------------
  it('handles empty input with no files', () => {
    const expected = new Map<string, string>();
    const actual = new Map<string, string>();

    const report = engine.detectDrift({ expected, actual });

    expect(report.driftPoints).toHaveLength(0);
    expect(report.totalDrifted).toBe(0);
    expect(report.totalAligned).toBe(0);
  });

  // -----------------------------------------------------------------------
  // 11. totalDrifted and totalAligned counts are correct
  // -----------------------------------------------------------------------
  it('has correct totalDrifted and totalAligned counts', () => {
    const matchingSource = readFixture('expected/order.types.ts');
    const driftedActual = readFixture('actual/order-drifted.types.ts');
    const shippingSource = readFixture('expected/shipping.types.ts');

    const expected = new Map([
      ['order.types.ts', matchingSource],
      ['shipping.types.ts', shippingSource],
      ['aligned.types.ts', 'export interface Foo { readonly x: number; }'],
    ]);
    const actual = new Map([
      ['order.types.ts', driftedActual],
      // shipping.types.ts missing
      ['aligned.types.ts', 'export interface Foo { readonly x: number; }'],
    ]);

    const report = engine.detectDrift({ expected, actual });

    // order.types.ts has drift, shipping.types.ts is missing, aligned.types.ts matches
    expect(report.totalDrifted).toBe(2);
    expect(report.totalAligned).toBe(1);
  });

  // -----------------------------------------------------------------------
  // 12. Handles type alias differences
  // -----------------------------------------------------------------------
  it('detects type alias differences', () => {
    const expectedSource = readFixture('expected/order.types.ts');
    const actualSource = readFixture('actual/order-drifted.types.ts');
    const expected = new Map([['order.types.ts', expectedSource]]);
    const actual = new Map([['order.types.ts', actualSource]]);

    const report = engine.detectDrift({ expected, actual });

    const typeAliasDiff = report.driftPoints.find((p) => p.aggregateName === 'OrderStatus');
    expect(typeAliasDiff).toBeDefined();
    expect(typeAliasDiff!.description).toContain('OrderStatus');
  });

  // -----------------------------------------------------------------------
  // 13. Timestamp is present in report
  // -----------------------------------------------------------------------
  it('includes a valid timestamp in the report', () => {
    const expected = new Map<string, string>();
    const actual = new Map<string, string>();

    const report = engine.detectDrift({ expected, actual });

    expect(report.timestamp).toBeDefined();
    expect(typeof report.timestamp).toBe('string');
    // Should be a valid ISO date string
    const parsed = Date.parse(report.timestamp);
    expect(Number.isNaN(parsed)).toBe(false);
  });

  // -----------------------------------------------------------------------
  // 14. Uses scope from input
  // -----------------------------------------------------------------------
  it('uses provided scope in the report', () => {
    const expected = new Map<string, string>();
    const actual = new Map<string, string>();

    const report = engine.detectDrift({ expected, actual, scope: 'orders' });

    expect(report.scope).toBe('orders');
  });
});
