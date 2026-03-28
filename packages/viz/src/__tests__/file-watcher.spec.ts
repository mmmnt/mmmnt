import { describe, it, expect, vi, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { FileWatcher } from '../server/file-watcher.js';

const TEST_DIR = join(process.cwd(), '.test-watch-tmp');

describe('FileWatcher', () => {
  afterEach(() => {
    try {
      rmSync(TEST_DIR, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  it('triggers onChange on file change (PS-03)', async () => {
    mkdirSync(TEST_DIR, { recursive: true });
    const testFile = join(TEST_DIR, 'test.moment');
    writeFileSync(testFile, 'initial content');

    const onChange = vi.fn();
    const watcher = new FileWatcher({
      patterns: ['*.moment'],
      cwd: TEST_DIR,
      debounceMs: 50,
      onChange,
    });

    await watcher.start();

    // Trigger a file change
    writeFileSync(testFile, 'updated content');

    // Wait for debounce + processing
    await new Promise((r) => setTimeout(r, 200));

    expect(onChange).toHaveBeenCalled();
    watcher.stop();
  });

  it('debounces rapid changes', async () => {
    mkdirSync(TEST_DIR, { recursive: true });
    const testFile = join(TEST_DIR, 'rapid.moment');
    writeFileSync(testFile, 'v1');

    const onChange = vi.fn();
    const watcher = new FileWatcher({
      patterns: ['*.moment'],
      cwd: TEST_DIR,
      debounceMs: 100,
      onChange,
    });

    await watcher.start();

    // Rapid-fire writes
    writeFileSync(testFile, 'v2');
    writeFileSync(testFile, 'v3');
    writeFileSync(testFile, 'v4');

    // Wait for debounce to settle
    await new Promise((r) => setTimeout(r, 300));

    // Should have debounced to fewer calls than writes
    expect(onChange.mock.calls.length).toBeLessThanOrEqual(2);
    watcher.stop();
  });

  it('stops cleanly', async () => {
    mkdirSync(TEST_DIR, { recursive: true });
    writeFileSync(join(TEST_DIR, 'stop.moment'), 'content');

    const watcher = new FileWatcher({
      patterns: ['*.moment'],
      cwd: TEST_DIR,
      debounceMs: 50,
      onChange: vi.fn(),
    });

    await watcher.start();
    expect(watcher.isRunning()).toBe(true);

    watcher.stop();
    expect(watcher.isRunning()).toBe(false);
  });

  it('does not start twice', async () => {
    mkdirSync(TEST_DIR, { recursive: true });
    writeFileSync(join(TEST_DIR, 'dup.moment'), 'content');

    const watcher = new FileWatcher({
      patterns: ['*.moment'],
      cwd: TEST_DIR,
      debounceMs: 50,
      onChange: vi.fn(),
    });

    await watcher.start();
    await watcher.start(); // second call should be no-op

    expect(watcher.isRunning()).toBe(true);
    watcher.stop();
  });
});
