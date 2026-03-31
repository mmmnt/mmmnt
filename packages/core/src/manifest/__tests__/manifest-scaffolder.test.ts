import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ManifestScaffolder } from '../manifest-scaffolder.js';
import { ManifestReader } from '../manifest-reader.js';

let tempDir: string;
let scaffolder: ManifestScaffolder;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'manifest-scaffolder-'));
  scaffolder = new ManifestScaffolder();
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe('ManifestScaffolder', () => {
  it('creates .manifest.yaml with valid schema', () => {
    const result = scaffolder.scaffold(tempDir, { name: 'test-project' });

    expect(result.manifestPath).toBe(join(tempDir, '.manifest.yaml'));
    expect(existsSync(result.manifestPath)).toBe(true);

    const content = readFileSync(result.manifestPath, 'utf-8');
    expect(content).toContain('name: test-project');
    expect(content).toContain('version: 0.0.0');
  });

  it('creates .moment/contexts/ and .moment/flows/ directories', () => {
    const result = scaffolder.scaffold(tempDir, { name: 'test-project' });

    expect(result.directoriesCreated).toHaveLength(2);
    expect(existsSync(join(tempDir, '.moment', 'contexts'))).toBe(true);
    expect(existsSync(join(tempDir, '.moment', 'flows'))).toBe(true);
  });

  it('accepts project name and sets it in manifest', () => {
    scaffolder.scaffold(tempDir, {
      name: 'my-custom-project',
      version: '1.0.0',
      description: 'A custom project',
    });

    const content = readFileSync(join(tempDir, '.manifest.yaml'), 'utf-8');
    expect(content).toContain('name: my-custom-project');
    expect(content).toContain('version: 1.0.0');
    expect(content).toContain('description: A custom project');
  });

  it('throws when .manifest.yaml already exists', () => {
    writeFileSync(join(tempDir, '.manifest.yaml'), 'name: existing\n', 'utf-8');

    expect(() => scaffolder.scaffold(tempDir, { name: 'new-project' })).toThrow(
      'Manifest already exists',
    );
  });

  it('scaffolded manifest is readable by ManifestReader', () => {
    scaffolder.scaffold(tempDir, { name: 'roundtrip-test' });

    const reader = new ManifestReader();
    const config = reader.readManifest(join(tempDir, '.manifest.yaml'));

    expect(config.name).toBe('roundtrip-test');
    expect(config.version).toBe('0.0.0');
    expect(config.contexts).toEqual([]);
    expect(config.flows).toEqual([]);
    expect(config.generators).toHaveLength(3);
    expect(config.watch.enabled).toBe(true);
    expect(config.watch.debounceMs).toBe(300);
  });

  it('manifest includes default generator and watch configuration', () => {
    scaffolder.scaffold(tempDir, { name: 'defaults-test' });

    const reader = new ManifestReader();
    const config = reader.readManifest(join(tempDir, '.manifest.yaml'));

    expect(config.generators).toEqual([
      { format: 'typescript', outputDir: 'src/generated' },
      { format: 'gherkin', outputDir: 'tests/features' },
      { format: 'markdown', outputDir: 'docs' },
    ]);
    expect(config.watch).toEqual({
      enabled: true,
      debounceMs: 300,
      paths: ['.moment/contexts', '.moment/flows'],
    });
  });
});
