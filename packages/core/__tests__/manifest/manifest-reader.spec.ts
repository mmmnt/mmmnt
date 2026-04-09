import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
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
    const dir = dirname(fullPath);
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

    it('throws when root is not an object', () => {
      const manifestPath = writeManifest('just a string');
      expect(() => reader.readManifest(manifestPath)).toThrow('expected a YAML object');
    });

    it('throws when contexts is not an array', () => {
      const manifestPath = writeManifest(`
name: Test
contexts: not-an-array
`);
      expect(() => reader.readManifest(manifestPath)).toThrow('file references must be an array');
    });

    it('throws when generators has invalid format', () => {
      const manifestPath = writeManifest(`
name: Test
generators:
  - format: invalid
    outputDir: ./out
`);
      expect(() => reader.readManifest(manifestPath)).toThrow('invalid generator format');
    });

    it('throws when generator entry is null', () => {
      const manifestPath = writeManifest(`
name: Test
generators:
  - null
`);
      expect(() => reader.readManifest(manifestPath)).toThrow('not a valid object');
    });

    it('throws when generators is not an array', () => {
      const manifestPath = writeManifest(`
name: Test
generators: not-an-array
`);
      expect(() => reader.readManifest(manifestPath)).toThrow('generators must be an array');
    });

    it('throws when file reference entry is not an object', () => {
      const manifestPath = writeManifest(`
name: Test
contexts:
  - "just a string"
`);
      expect(() => reader.readManifest(manifestPath)).toThrow('is not an object');
    });

    it('throws when file reference has non-string name or path', () => {
      const manifestPath = writeManifest(`
name: Test
contexts:
  - name: 123
    path: true
`);
      expect(() => reader.readManifest(manifestPath)).toThrow("must have string 'name' and 'path'");
    });

    it('throws when generator outputDir is not a string', () => {
      const manifestPath = writeManifest(`
name: Test
generators:
  - format: typescript
    outputDir: 123
`);
      expect(() => reader.readManifest(manifestPath)).toThrow("'outputDir' for generator");
    });

    it('returns default watch config when watch is an array', () => {
      const manifestPath = writeManifest(`
name: Test
watch:
  - item1
  - item2
`);
      const config = reader.readManifest(manifestPath);
      expect(config.watch).toEqual({
        enabled: false,
        debounceMs: 300,
        paths: [],
      });
    });

    it('coerces non-string name and version to defaults', () => {
      const manifestPath = writeManifest(`
name: 123
version: true
`);
      const config = reader.readManifest(manifestPath);
      expect(config.name).toBe('');
      expect(config.version).toBe('0.0.0');
    });

    it('handles watch config with invalid types gracefully', () => {
      const manifestPath = writeManifest(`
name: Test
watch:
  enabled: "yes"
  debounceMs: "fast"
  paths: not-an-array
`);
      const config = reader.readManifest(manifestPath);
      expect(config.watch.enabled).toBe(false);
      expect(config.watch.debounceMs).toBe(300);
      expect(config.watch.paths).toEqual([]);
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

  describe('path-traversal guard on manifest fields', () => {
    it('rejects an absolute generators[].outputDir', () => {
      const manifestPath = writeManifest(`
name: TestProject
version: "1.0.0"
generators:
  - format: typescript
    outputDir: /etc/evil
`);
      expect(() => reader.readManifest(manifestPath)).toThrow(
        /generators\[0\]\.outputDir '\/etc\/evil' must be a relative path/,
      );
    });

    it('rejects a generators[].outputDir that escapes the manifest dir via ../', () => {
      const manifestPath = writeManifest(`
name: TestProject
version: "1.0.0"
generators:
  - format: gherkin
    outputDir: ../../../outside
`);
      expect(() => reader.readManifest(manifestPath)).toThrow(
        /generators\[0\]\.outputDir '\.\.\/\.\.\/\.\.\/outside' escapes the manifest directory/,
      );
    });

    it('accepts a relative generators[].outputDir that stays inside the manifest dir', () => {
      const manifestPath = writeManifest(`
name: TestProject
version: "1.0.0"
generators:
  - format: typescript
    outputDir: src/generated
`);
      const result = reader.readManifest(manifestPath);
      expect(result.generators).toEqual([{ format: 'typescript', outputDir: 'src/generated' }]);
    });

    it('allows empty/missing outputDir (defaults to empty string)', () => {
      const manifestPath = writeManifest(`
name: TestProject
version: "1.0.0"
generators:
  - format: markdown
`);
      const result = reader.readManifest(manifestPath);
      expect(result.generators[0].outputDir).toBe('');
    });

    it('rejects an absolute contexts[].path', () => {
      const manifestPath = writeManifest(`
name: TestProject
version: "1.0.0"
contexts:
  - name: Evil
    path: /etc/passwd
`);
      expect(() => reader.readManifest(manifestPath)).toThrow(
        /contexts\[0\]\.path '\/etc\/passwd' must be a relative path/,
      );
    });

    it('rejects a contexts[].path that escapes the manifest dir via ../', () => {
      const manifestPath = writeManifest(`
name: TestProject
version: "1.0.0"
contexts:
  - name: Escape
    path: ../../../etc/passwd
`);
      expect(() => reader.readManifest(manifestPath)).toThrow(
        /contexts\[0\]\.path '\.\.\/\.\.\/\.\.\/etc\/passwd' escapes the manifest directory/,
      );
    });

    it('rejects an absolute flows[].path', () => {
      const manifestPath = writeManifest(`
name: TestProject
version: "1.0.0"
flows:
  - name: Evil
    path: /tmp/anything
`);
      expect(() => reader.readManifest(manifestPath)).toThrow(
        /flows\[0\]\.path '\/tmp\/anything' must be a relative path/,
      );
    });

    it('rejects a flows[].path that escapes the manifest dir via ../', () => {
      const manifestPath = writeManifest(`
name: TestProject
version: "1.0.0"
flows:
  - name: Escape
    path: ../../../../etc/evil
`);
      expect(() => reader.readManifest(manifestPath)).toThrow(
        /flows\[0\]\.path '\.\.\/\.\.\/\.\.\/\.\.\/etc\/evil' escapes the manifest directory/,
      );
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
