import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  isDirectory,
  loadSpecification,
  specificationFiles,
} from '../../src/project/load-specification.js';

const MINIMAL = resolve(import.meta.dirname, '../../../../fixtures/valid/minimal');

describe('loadSpecification', () => {
  let root: string;
  let contexts: string;
  let flow: string;

  beforeAll(() => {
    // root/
    //   contexts/fulfillment.moment, contexts/ordering.moment
    //   flows/order-placed.moment
    //   notes.txt              (ignored: not a .moment file)
    root = mkdtempSync(join(tmpdir(), 'moment-load-spec-'));
    contexts = join(root, 'contexts');
    mkdirSync(contexts);
    mkdirSync(join(root, 'flows'));
    copyFileSync(join(MINIMAL, 'contexts/ordering.moment'), join(contexts, 'ordering.moment'));
    copyFileSync(
      join(MINIMAL, 'contexts/fulfillment.moment'),
      join(contexts, 'fulfillment.moment'),
    );
    flow = join(root, 'flows', 'order-placed.moment');
    copyFileSync(join(MINIMAL, 'flows/order-placed.moment'), flow);
    writeFileSync(join(root, 'notes.txt'), 'not a model');
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  describe('isDirectory', () => {
    it('is true for an existing directory', () => {
      expect(isDirectory(root)).toBe(true);
    });

    it('is false for a file', () => {
      expect(isDirectory(flow)).toBe(false);
    });

    it('is false for a path that does not exist', () => {
      expect(isDirectory(join(root, 'missing'))).toBe(false);
    });
  });

  describe('specificationFiles', () => {
    it('lists every .moment file beneath a directory, recursively and sorted', () => {
      expect(specificationFiles(root)).toEqual([
        join(contexts, 'fulfillment.moment'),
        join(contexts, 'ordering.moment'),
        flow,
      ]);
    });

    it('returns a file path as itself', () => {
      expect(specificationFiles(flow)).toEqual([flow]);
    });
  });

  it('loads a directory as one merged project', async () => {
    const result = await loadSpecification(root);

    expect(result.isProject).toBe(true);
    expect(result.success).toBe(true);
    expect(result.files).toEqual(specificationFiles(root));
    expect(result.ir!.contexts.map((c) => c.name).sort()).toEqual(['Fulfillment', 'Ordering']);
    expect(result.ir!.flows.map((f) => f.name)).toEqual(['order-placed']);
  });

  it('loads a single file through the parser', async () => {
    const file = join(contexts, 'ordering.moment');
    const result = await loadSpecification(file);

    expect(result.isProject).toBe(false);
    expect(result.success).toBe(true);
    expect(result.files).toEqual([file]);
    expect(result.ir!.contexts.map((c) => c.name)).toEqual(['Ordering']);
  });
});
