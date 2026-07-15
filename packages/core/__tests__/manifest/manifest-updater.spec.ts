import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { stringify as stringifyYaml, parse as parseYaml } from 'yaml';
import { ManifestUpdater } from '../../src/manifest/manifest-updater.js';

function createManifest(dir: string, overrides: Record<string, unknown> = {}): void {
  const manifest = {
    name: 'test-project',
    version: '0.0.0',
    contexts: [],
    flows: [],
    generators: [],
    watch: { enabled: false, debounceMs: 300, paths: [] },
    ...overrides,
  };
  writeFileSync(join(dir, '.manifest.yaml'), stringifyYaml(manifest));
}

function readManifest(dir: string): Record<string, unknown> {
  return parseYaml(readFileSync(join(dir, '.manifest.yaml'), 'utf-8')) as Record<string, unknown>;
}

describe('ManifestUpdater', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'manifest-updater-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('updateFromParsedFile', () => {
    it('adds context and flow entries from parsed IR', () => {
      createManifest(tmpDir);

      const updater = new ManifestUpdater();
      const result = updater.updateFromParsedFile(
        tmpDir,
        join(tmpDir, 'ordering.moment'),
        ['Ordering', 'Fulfillment'],
        ['order-placed'],
      );

      expect(result.updated).toBe(true);
      expect(result.contextsAdded).toBe(2);
      expect(result.flowsAdded).toBe(1);

      const manifest = readManifest(tmpDir);
      const contexts = manifest.contexts as { name: string; path: string }[];
      const flows = manifest.flows as { name: string; path: string }[];
      expect(contexts).toHaveLength(2);
      expect(flows).toHaveLength(1);
      expect(contexts[0].name).toBe('Ordering');
      expect(flows[0].name).toBe('order-placed');
    });

    it('is idempotent — no duplicates on repeated calls', () => {
      createManifest(tmpDir);
      const updater = new ManifestUpdater();
      const filePath = join(tmpDir, 'ordering.moment');

      updater.updateFromParsedFile(tmpDir, filePath, ['Ordering'], ['order-placed']);
      const result = updater.updateFromParsedFile(tmpDir, filePath, ['Ordering'], ['order-placed']);

      expect(result.updated).toBe(false);
      expect(result.contextsAdded).toBe(0);
      expect(result.flowsAdded).toBe(0);
    });

    it('returns not updated when no manifest exists', () => {
      const updater = new ManifestUpdater();
      const result = updater.updateFromParsedFile(tmpDir, 'file.moment', ['X'], ['Y']);

      expect(result.updated).toBe(false);
    });

    it('preserves existing manifest entries', () => {
      createManifest(tmpDir, {
        contexts: [{ name: 'Existing', path: 'existing.moment' }],
      });

      const updater = new ManifestUpdater();
      updater.updateFromParsedFile(tmpDir, join(tmpDir, 'new.moment'), ['New'], []);

      const manifest = readManifest(tmpDir);
      const contexts = manifest.contexts as { name: string }[];
      expect(contexts).toHaveLength(2);
      expect(contexts[0].name).toBe('Existing');
      expect(contexts[1].name).toBe('New');
    });
  });

  describe('updateFromDirectory', () => {
    it('discovers .moment files in contexts and flows directories', () => {
      createManifest(tmpDir);
      mkdirSync(join(tmpDir, '.moment', 'contexts'), { recursive: true });
      mkdirSync(join(tmpDir, '.moment', 'flows'), { recursive: true });
      writeFileSync(join(tmpDir, '.moment', 'contexts', 'ordering.moment'), 'context "Ordering"');
      writeFileSync(join(tmpDir, '.moment', 'flows', 'order-placed.moment'), 'flow "order-placed"');

      const updater = new ManifestUpdater();
      const result = updater.updateFromDirectory(tmpDir);

      expect(result.updated).toBe(true);
      expect(result.contextsAdded).toBe(1);
      expect(result.flowsAdded).toBe(1);
    });

    it('returns not updated when no manifest exists', () => {
      const updater = new ManifestUpdater();
      const result = updater.updateFromDirectory(tmpDir);

      expect(result.updated).toBe(false);
    });

    it('returns not updated when no new files found', () => {
      createManifest(tmpDir);

      const updater = new ManifestUpdater();
      const result = updater.updateFromDirectory(tmpDir);

      expect(result.updated).toBe(false);
    });

    it('skips non-.moment files and recurses into nested directories', () => {
      createManifest(tmpDir);
      mkdirSync(join(tmpDir, '.moment', 'contexts', 'nested'), { recursive: true });
      writeFileSync(join(tmpDir, '.moment', 'contexts', 'notes.txt'), 'not a spec');
      writeFileSync(
        join(tmpDir, '.moment', 'contexts', 'nested', 'billing.moment'),
        'context "Billing"',
      );

      const updater = new ManifestUpdater();
      const result = updater.updateFromDirectory(tmpDir);

      expect(result.updated).toBe(true);
      expect(result.contextsAdded).toBe(1);

      const manifest = readManifest(tmpDir);
      const contexts = manifest.contexts as { name: string; path: string }[];
      expect(contexts[0].name).toBe('billing');
      expect(contexts[0].path).toBe(join('.moment', 'contexts', 'nested', 'billing.moment'));
    });

    it('discovers unified files in .moment/ root', () => {
      createManifest(tmpDir);
      mkdirSync(join(tmpDir, '.moment'), { recursive: true });
      writeFileSync(join(tmpDir, '.moment', 'unified.moment'), 'context "X"');

      const updater = new ManifestUpdater();
      const result = updater.updateFromDirectory(tmpDir);

      expect(result.updated).toBe(true);
      expect(result.contextsAdded).toBe(1);
    });

    it('handles non-array contexts/flows in manifest gracefully', () => {
      createManifest(tmpDir, { contexts: 'not-an-array', flows: null });
      mkdirSync(join(tmpDir, '.moment', 'contexts'), { recursive: true });
      writeFileSync(join(tmpDir, '.moment', 'contexts', 'test.moment'), 'context "Test"');

      const updater = new ManifestUpdater();
      const result = updater.updateFromDirectory(tmpDir);

      expect(result.updated).toBe(true);
    });
  });
});
