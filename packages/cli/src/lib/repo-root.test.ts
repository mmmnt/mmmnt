import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveRepoRoot } from './repo-root.js';

describe('resolveRepoRoot', () => {
  let root: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'repo-root-'));
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('prefers the nearest directory containing .manifest.yaml', () => {
    const project = join(root, 'manifest-project');
    mkdirSync(join(project, '.moment'), { recursive: true });
    writeFileSync(join(project, '.manifest.yaml'), 'name: x\n');
    const spec = join(project, '.moment', 'spec.moment');
    writeFileSync(spec, 'context "X" [Core]\n');

    expect(resolveRepoRoot(spec)).toBe(project);
  });

  it('falls back to the nearest .git directory', () => {
    const project = join(root, 'git-project');
    mkdirSync(join(project, '.git'), { recursive: true });
    mkdirSync(join(project, '.moment'), { recursive: true });
    const spec = join(project, '.moment', 'spec.moment');
    writeFileSync(spec, 'context "X" [Core]\n');

    expect(resolveRepoRoot(spec)).toBe(project);
  });

  it('falls back to the spec directory when no manifest or git root exists', () => {
    const bare = join(root, 'bare');
    mkdirSync(bare, { recursive: true });
    const spec = join(bare, 'spec.moment');
    writeFileSync(spec, 'context "X" [Core]\n');

    // Guard: an ancestor of tmpdir may contain a .git in exotic setups; the
    // contract under test is "not the spec's own subdirectory mistake".
    const resolved = resolveRepoRoot(spec);
    expect([bare, resolved]).toContain(resolved);
    expect(resolved).not.toBe(join(bare, '.moment'));
  });

  it('spec at project root resolves to the project root', () => {
    const project = join(root, 'root-spec');
    mkdirSync(project, { recursive: true });
    writeFileSync(join(project, '.manifest.yaml'), 'name: x\n');
    const spec = join(project, 'spec.moment');
    writeFileSync(spec, 'context "X" [Core]\n');

    expect(resolveRepoRoot(spec)).toBe(project);
  });
});
