/**
 * MMNT-37 Integration Test — Parse sample files to IR (M2 partial gate)
 *
 * Verifies the MomentParser public API against the existing fixture
 * files from MMNT-26, ensuring .moment source files parse to valid IR.
 */
import { MomentParser } from '../../src/index.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const FIXTURES = resolve(import.meta.dirname, '../../../..', 'fixtures');

function readFixture(path: string): string {
  return readFileSync(resolve(FIXTURES, path), 'utf-8');
}

describe('Parse Pipeline Integration', () => {
  let parser: MomentParser;

  beforeAll(() => {
    parser = new MomentParser();
  });

  describe('minimal sample', () => {
    it('parses context file to IR with correct structure', async () => {
      const content = readFixture('valid/minimal/contexts/ordering.moment');
      const result = await parser.parseContent(content);
      expect(result.success).toBe(true);
      expect(result.ir).toBeDefined();
      expect(result.ir!.contexts).toHaveLength(1);
      expect(result.ir!.contexts[0].name).toBe('Ordering');
      expect(result.ir!.contexts[0].aggregates).toHaveLength(1);
    });

    it('parses flow file to IR with connections', async () => {
      const content = readFixture('valid/minimal/flows/order-placed.moment');
      const result = await parser.parseContent(content);
      expect(result.success).toBe(true);
      expect(result.ir).toBeDefined();
      expect(result.ir!.flows).toHaveLength(1);
      expect(result.ir!.flows[0].connections.length).toBeGreaterThan(0);
    });
  });

  describe('multi-context sample', () => {
    it('parses all context files', async () => {
      for (const file of ['ordering', 'fulfillment', 'shipping']) {
        const content = readFixture(`valid/multi-context/contexts/${file}.moment`);
        const result = await parser.parseContent(content);
        expect(result.success).toBe(true);
        expect(result.ir!.contexts).toHaveLength(1);
      }
    });

    it('parses flow with crossings and branches', async () => {
      const content = readFixture('valid/multi-context/flows/order-to-shipment.moment');
      const result = await parser.parseContent(content);
      expect(result.success).toBe(true);
      const flow = result.ir!.flows[0];
      expect(flow.frames.length).toBeGreaterThanOrEqual(4);
      // Should have crossing connections
      const crossings = flow.connections.filter((c) => c.connectionType === 'crosses-to');
      expect(crossings.length).toBeGreaterThan(0);
      // Should have branch frames
      const branchFrames = flow.frames.filter((f) => f.branches && f.branches.length > 0);
      expect(branchFrames.length).toBeGreaterThan(0);
    });
  });

  describe('round-trip', () => {
    it('IR serializes to JSON and deserializes losslessly', async () => {
      const content = readFixture('valid/minimal/contexts/ordering.moment');
      const result = await parser.parseContent(content);
      expect(result.success).toBe(true);
      expect(result.ir).toBeDefined();
      const ir = result.ir!;
      const json = JSON.stringify(ir);
      const deserialized = JSON.parse(json);
      expect(deserialized).toEqual(ir);
    });
  });

  describe('error scenarios', () => {
    it('malformed input produces diagnostics', async () => {
      const result = await parser.parseContent('this is not valid moment syntax');
      expect(result.success).toBe(false);
      expect(result.diagnostics.length).toBeGreaterThan(0);
    });

    it('returns success false for syntax errors', async () => {
      const result = await parser.parseContent(
        'context "Test" [Core]\n  aggregate missing identity',
      );
      expect(result.success).toBe(false);
      expect(result.diagnostics.some((d) => d.severity === 'error')).toBe(true);
    });

    it('valid input with warnings still produces IR', async () => {
      // Flow with an unused branch-lane triggers V16 warning but still parses
      const content = `
        flow "test-warnings"
          lane a "A" [Core]
          branch-lane unused "Unused" [Terminal]
          frame "Step"
            a: SomeEvent
      `;
      const result = await parser.parseContent(content);
      expect(result.success).toBe(true);
      expect(result.ir).toBeDefined();
      expect(result.diagnostics.some((d) => d.severity === 'warning')).toBe(true);
    });
  });
});
