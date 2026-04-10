import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { ProjectLoader } from '../../src/project/index.js';

const FIXTURES = resolve(import.meta.dirname, '../../../../fixtures');
const MINIMAL_CONTEXTS = resolve(FIXTURES, 'valid/minimal/contexts');
const MINIMAL_FLOWS = resolve(FIXTURES, 'valid/minimal/flows');
const MULTI_CONTEXT = resolve(FIXTURES, 'valid/multi-context');

describe('ProjectLoader', () => {
  const loader = new ProjectLoader();

  describe('multi-file loading', () => {
    it('merges contexts from multiple files into one IR', async () => {
      const result = await loader.loadProject([
        resolve(MINIMAL_CONTEXTS, 'ordering.moment'),
        resolve(MINIMAL_CONTEXTS, 'fulfillment.moment'),
      ]);

      expect(result.success).toBe(true);
      expect(result.ir.contexts).toHaveLength(2);
      expect(result.filesParsed).toBe(2);
      expect(result.filesErrored).toBe(0);

      const names = result.ir.contexts.map((c) => c.name).sort();
      expect(names).toEqual(['Fulfillment', 'Ordering']);
    });

    it('merges contexts + flows from separate files', async () => {
      const result = await loader.loadProject([
        resolve(MINIMAL_CONTEXTS, 'ordering.moment'),
        resolve(MINIMAL_CONTEXTS, 'fulfillment.moment'),
        resolve(MINIMAL_FLOWS, 'order-placed.moment'),
      ]);

      expect(result.success).toBe(true);
      expect(result.ir.contexts).toHaveLength(2);
      expect(result.ir.flows).toHaveLength(1);
      expect(result.ir.flows[0].name).toBe('order-placed');
    });

    it('sorts files lexicographically for deterministic merge order', async () => {
      // Pass files in reverse order — result should still be sorted.
      const result = await loader.loadProject([
        resolve(MINIMAL_CONTEXTS, 'ordering.moment'),
        resolve(MINIMAL_CONTEXTS, 'fulfillment.moment'),
      ]);

      const reversed = await loader.loadProject([
        resolve(MINIMAL_CONTEXTS, 'fulfillment.moment'),
        resolve(MINIMAL_CONTEXTS, 'ordering.moment'),
      ]);

      // Both should produce the same context order.
      expect(result.ir.contexts.map((c) => c.name)).toEqual(
        reversed.ir.contexts.map((c) => c.name),
      );
    });
  });

  describe('cross-file validation', () => {
    it('validates that flow lane contexts exist in the merged IR', async () => {
      const result = await loader.loadProject([
        resolve(MINIMAL_CONTEXTS, 'ordering.moment'),
        resolve(MINIMAL_CONTEXTS, 'fulfillment.moment'),
        resolve(MINIMAL_FLOWS, 'order-placed.moment'),
      ]);

      // The flow references both Ordering and Fulfillment contexts via
      // lanes. Both exist in the merged IR, so validation should pass.
      expect(result.success).toBe(true);
      const crossFileErrors = result.diagnostics.filter(
        (d) => d.ruleId?.startsWith('PM-') && d.severity === 'error',
      );
      expect(crossFileErrors).toHaveLength(0);
    });

    it('reports unresolved lane context references', async () => {
      // Load the flow WITHOUT the fulfillment context — the flow
      // references Fulfillment via a lane, which won't resolve.
      const result = await loader.loadProject([
        resolve(MINIMAL_CONTEXTS, 'ordering.moment'),
        resolve(MINIMAL_FLOWS, 'order-placed.moment'),
      ]);

      // The flow should parse successfully (per-file parsing is lenient
      // about cross-file refs), but cross-file validation should flag
      // the unresolved ctx-Fulfillment reference.
      const crossFileErrors = result.diagnostics.filter(
        (d) => d.ruleId === 'PM-02' || d.ruleId === 'PM-03' || d.ruleId === 'PM-05',
      );
      expect(crossFileErrors.length).toBeGreaterThan(0);
      expect(crossFileErrors.some((d) => d.message.includes('Fulfillment'))).toBe(true);
    });
  });

  describe('error handling', () => {
    it('reports file-read errors without blocking other files', async () => {
      const result = await loader.loadProject([
        resolve(MINIMAL_CONTEXTS, 'ordering.moment'),
        resolve(MINIMAL_CONTEXTS, 'nonexistent-file.moment'),
      ]);

      expect(result.filesErrored).toBe(1);
      expect(result.filesParsed).toBe(1);
      expect(result.ir.contexts.length).toBeGreaterThan(0);
      expect(result.diagnostics.some((d) => d.ruleId === 'PM-00')).toBe(true);
    });

    it('returns empty IR for empty file list', async () => {
      const result = await loader.loadProject([]);

      expect(result.success).toBe(true);
      expect(result.ir.contexts).toHaveLength(0);
      expect(result.ir.flows).toHaveLength(0);
      expect(result.filesParsed).toBe(0);
    });
  });

  describe('multi-context fixture (3 contexts + flow with crossings)', () => {
    it('loads the multi-context fixture end-to-end', async () => {
      const result = await loader.loadProject([
        resolve(MULTI_CONTEXT, 'contexts/ordering.moment'),
        resolve(MULTI_CONTEXT, 'contexts/fulfillment.moment'),
        resolve(MULTI_CONTEXT, 'contexts/shipping.moment'),
        resolve(MULTI_CONTEXT, 'flows/order-to-shipment.moment'),
      ]);

      expect(result.success).toBe(true);
      expect(result.ir.contexts).toHaveLength(3);
      expect(result.ir.flows).toHaveLength(1);
      expect(result.ir.flows[0].connections.length).toBeGreaterThan(0);
    });
  });
});
