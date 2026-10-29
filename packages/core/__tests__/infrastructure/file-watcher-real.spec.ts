import { describe, it, expect, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, type Stats } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileWatcher, isIgnored } from '../../src/infrastructure/file-watcher.js';

// Real chokidar, unlike file-watcher.spec.ts: these cases prove which paths are watched.

const file = { isFile: () => true } as Stats;
const directory = { isFile: () => false } as Stats;

describe('isIgnored', () => {
  it('never ignores a directory, with or without a dot in its path', () => {
    expect(isIgnored('/home/me/model', directory)).toBe(false);
    expect(isIgnored('/home/me/.moment/contexts', directory)).toBe(false);
  });

  it('ignores files with other extensions and keeps .moment and manifest files', () => {
    expect(isIgnored('/home/me/model/notes.txt', file)).toBe(true);
    expect(isIgnored('/home/me/model/README', file)).toBe(true);
    expect(isIgnored('/home/me/model/shop.moment', file)).toBe(false);
    expect(isIgnored('/home/me/.manifest.yaml', file)).toBe(false);
    expect(isIgnored('/home/me/settings.yml', file)).toBe(false);
  });

  it('keeps a path chokidar has not stat-ed yet; the change handler filters it', () => {
    expect(isIgnored('/home/me/model/notes.txt')).toBe(false);
  });
});

describe('FileWatcher with chokidar', () => {
  let watcher: FileWatcher | undefined;
  let root: string | undefined;

  afterEach(() => {
    watcher?.stop();
    if (root) rmSync(root, { recursive: true, force: true });
  });

  it('reports a .moment change inside a watched directory whose path has no dot', async () => {
    root = mkdtempSync(join(tmpdir(), 'watch-'));
    const model = join(root, 'model');
    mkdirSync(model);
    expect(model.includes('.')).toBe(false);

    const changes: string[] = [];
    watcher = new FileWatcher({
      config: { enabled: true, paths: ['model'], debounceMs: 50 },
      rootDir: root,
      onFileChange: (path) => changes.push(path),
    });
    watcher.start();
    await new Promise((r) => setTimeout(r, 300));

    writeFileSync(join(model, 'notes.txt'), 'ignored');
    writeFileSync(join(model, 'shop.moment'), 'context "Shop" [Core]\n');
    await expect
      .poll(() => changes, { timeout: 5000, interval: 50 })
      .toEqual([join(model, 'shop.moment')]);
  }, 10_000);
});
