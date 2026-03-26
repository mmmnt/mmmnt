import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ManifestReader } from '../../src/manifest/index.js';

describe('ManifestReader', () => {
  let tmpDir: string;
  let reader: ManifestReader;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'manifest-reader-'));
    reader = new ManifestReader();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeManifest(yaml: string, filename = 'manifest.yaml'): string {
    const manifestPath = join(tmpDir, filename);
    writeFileSync(manifestPath, yaml, 'utf-8');
    return manifestPath;
  }

  function createFile(relativePath: string, content = ''): void {
    const fullPath = join(tmpDir, relativePath);
    const dir = fullPath.substring(0, fullPath.lastIndexOf('/'));
    mkdirSync(dir, { recursive: true });
    writeFileSync(fullPath, content, 'utf-8');
  }

  describe('valid manifest', () => {
    it('parses contexts and flows', () => {
      createFile('contexts/ordering.moment', 'context "Ordering"');
      createFile('flows/order-placed.moment', 'flow "OrderPlaced"');
      const manifestPath = writeManifest(`
name: TestProject
version: "1.0.0"
contexts:
  - name: Ordering
    path: contexts/ordering.moment
flows:
  - name: OrderPlaced
    path: flows/order-placed.moment
`);

      const result = reader.readManifest(manifestPath);

      expect(result.contexts).toEqual([{ name: 'Ordering', path: 'contexts/ordering.moment' }]);
      expect(result.flows).toEqual([{ name: 'OrderPlaced', path: 'flows/order-placed.moment' }]);
    });

    it('includes generator config', () => {
      const manifestPath = writeManifest(`
name: TestProject
version: "1.0.0"
generators:
  - format: typescript
    outputDir: ./generated
  - format: gherkin
    outputDir: ./features
`);

      const result = reader.readManifest(manifestPath);

      expect(result.generators).toEqual([
        { format: 'typescript', outputDir: './generated' },
        { format: 'gherkin', outputDir: './features' },
      ]);
    });

    it('includes watch configuration', () => {
      const manifestPath = writeManifest(`
name: TestProject
version: "1.0.0"
watch:
  enabled: true
  debounceMs: 500
  paths:
    - ./contexts
    - ./flows
`);

      const result = reader.readManifest(manifestPath);

      expect(result.watch).toEqual({
        enabled: true,
        debounceMs: 500,
        paths: ['./contexts', './flows'],
      });
    });
  });

  describe('missing manifest', () => {
    it('throws fatal error', () => {
      expect(() => reader.readManifest('/nonexistent/manifest.yaml')).toThrow(
        'Manifest not found: /nonexistent/manifest.yaml',
      );
    });
  });

  describe('invalid YAML', () => {
    it('throws parse error', () => {
      const manifestPath = writeManifest(`
name: TestProject
  bad indentation:
    - this is broken
  : also broken
`);

      expect(() => reader.readManifest(manifestPath)).toThrow();
    });
  });

  describe('SP-05', () => {
    it('rejects non-existent context file reference', () => {
      const manifestPath = writeManifest(`
name: TestProject
version: "1.0.0"
contexts:
  - name: Missing
    path: contexts/missing.moment
`);

      expect(() => reader.readManifest(manifestPath)).toThrow('SP-05');
    });

    it('rejects non-existent flow file reference', () => {
      const manifestPath = writeManifest(`
name: TestProject
version: "1.0.0"
flows:
  - name: Missing
    path: flows/missing.moment
`);

      expect(() => reader.readManifest(manifestPath)).toThrow('SP-05');
    });

    it('accepts valid file references', () => {
      createFile('contexts/ordering.moment', 'context "Ordering"');
      createFile('flows/order-placed.moment', 'flow "OrderPlaced"');
      const manifestPath = writeManifest(`
name: TestProject
version: "1.0.0"
contexts:
  - name: Ordering
    path: contexts/ordering.moment
flows:
  - name: OrderPlaced
    path: flows/order-placed.moment
`);

      const result = reader.readManifest(manifestPath);

      expect(result.contexts).toHaveLength(1);
      expect(result.flows).toHaveLength(1);
    });
  });

  describe('defaults', () => {
    it('applies default watch config when absent', () => {
      const manifestPath = writeManifest(`
name: TestProject
version: "1.0.0"
`);

      const result = reader.readManifest(manifestPath);

      expect(result.watch).toEqual({
        enabled: false,
        debounceMs: 300,
        paths: [],
      });
    });

    it('watch disabled by default', () => {
      const manifestPath = writeManifest(`
name: TestProject
version: "1.0.0"
watch:
  debounceMs: 500
`);

      const result = reader.readManifest(manifestPath);

      expect(result.watch.enabled).toBe(false);
    });
  });

  describe('export', () => {
    it('ManifestReader importable from @mmmnt/core', async () => {
      const mod = await import('../../src/index.js');
      expect(mod.ManifestReader).toBeDefined();
      expect(typeof mod.ManifestReader).toBe('function');
    });
  });

  describe('integration', () => {
    it('reads minimal sample manifest', () => {
      createFile('contexts/ordering.moment', 'context "Ordering"');
      createFile('contexts/fulfillment.moment', 'context "Fulfillment"');
      createFile('flows/order-placed.moment', 'flow "OrderPlaced"');
      const manifestPath = writeManifest(`
name: minimal-sample
version: "0.1.0"
description: A minimal manifest for integration testing
contexts:
  - name: Ordering
    path: contexts/ordering.moment
  - name: Fulfillment
    path: contexts/fulfillment.moment
flows:
  - name: OrderPlaced
    path: flows/order-placed.moment
generators:
  - format: typescript
    outputDir: ./generated
watch:
  enabled: false
  debounceMs: 300
  paths:
    - ./contexts
    - ./flows
`);

      const result = reader.readManifest(manifestPath);

      expect(result.name).toBe('minimal-sample');
      expect(result.version).toBe('0.1.0');
      expect(result.description).toBe('A minimal manifest for integration testing');
      expect(result.contexts).toHaveLength(2);
      expect(result.flows).toHaveLength(1);
      expect(result.generators).toHaveLength(1);
      expect(result.watch.enabled).toBe(false);
    });
  });
});
