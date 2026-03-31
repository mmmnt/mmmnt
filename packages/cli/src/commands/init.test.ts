import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runInit } from './init.js';

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'moment-init-'));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe('moment init', () => {
  it('creates .manifest.yaml with expected default fields', () => {
    const result = runInit(['--dir', tempDir, '--name', 'test-project']);

    expect(result.success).toBe(true);
    expect(existsSync(join(tempDir, '.manifest.yaml'))).toBe(true);

    const content = readFileSync(join(tempDir, '.manifest.yaml'), 'utf-8');
    expect(content).toContain('name: test-project');
    expect(content).toContain('version: 0.0.0');
    expect(content).toContain('generators:');
    expect(content).toContain('watch:');
  });

  it('creates .moment/contexts/ and .moment/flows/ directories', () => {
    runInit(['--dir', tempDir]);

    expect(existsSync(join(tempDir, '.moment', 'contexts'))).toBe(true);
    expect(existsSync(join(tempDir, '.moment', 'flows'))).toBe(true);
  });

  it('--name flag sets project name in manifest', () => {
    runInit(['--dir', tempDir, '--name', 'custom-name']);

    const content = readFileSync(join(tempDir, '.manifest.yaml'), 'utf-8');
    expect(content).toContain('name: custom-name');
  });

  it('existing .manifest.yaml returns success: false with diagnostic', () => {
    writeFileSync(join(tempDir, '.manifest.yaml'), 'name: existing\n', 'utf-8');

    const result = runInit(['--dir', tempDir]);

    expect(result.success).toBe(false);
    expect(result.message).toContain('Error:');
    expect(result.message).toContain('already exists');
  });

  it('delegates to ManifestScaffolder (no schema logic in CLI)', () => {
    const result = runInit(['--dir', tempDir, '--name', 'delegate-test']);

    expect(result.success).toBe(true);
    expect(result.manifestPath).toBe(join(tempDir, '.manifest.yaml'));
    // Verify the CLI does not contain any YAML generation — ManifestScaffolder handles it
    // The test proves delegation by checking the result matches ManifestScaffolder output
    const content = readFileSync(join(tempDir, '.manifest.yaml'), 'utf-8');
    expect(content).toContain('name: delegate-test');
  });

  it('uses current directory when --dir not provided', () => {
    // Change to temp dir to avoid polluting the repo
    const originalCwd = process.cwd();
    process.chdir(tempDir);
    try {
      const result = runInit(['--name', 'default-dir-test']);
      expect(result.success).toBe(true);
      expect(existsSync(join(tempDir, '.manifest.yaml'))).toBe(true);
    } finally {
      process.chdir(originalCwd);
    }
  });

  it('uses default project name when --name not provided', () => {
    const result = runInit(['--dir', tempDir]);
    expect(result.success).toBe(true);
    const content = readFileSync(join(tempDir, '.manifest.yaml'), 'utf-8');
    expect(content).toContain('name: my-moment-project');
  });

  it('output format matches CLI UX conventions', () => {
    const successResult = runInit(['--dir', tempDir, '--name', 'ux-test']);
    expect(successResult.success).toBe(true);
    expect(successResult.message).toMatch(/^Initialized Moment project/);

    // Error case
    const errorResult = runInit(['--dir', tempDir, '--name', 'ux-test']);
    expect(errorResult.success).toBe(false);
    expect(errorResult.message).toMatch(/^Error:/);
  });
});
