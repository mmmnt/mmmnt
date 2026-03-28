import { describe, it, expect, vi, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { FileWatcher } from '../server/file-watcher.js';

const TEST_DIR = join(process.cwd(), '.test-watch-tmp');

describe('FileWatcher', () => {
  afterEach(async () => {
    // Small delay to let watchers fully release handles
    await new Promise((r) => setTimeout(r, 50));
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
      patterns: ['**/*.moment'],
      cwd: TEST_DIR,
      debounceMs: 50,
      onChange,
    });

    await watcher.start();

    // Trigger a file change
    writeFileSync(testFile, 'updated content');

    // Wait for polling interval (100ms) + debounce (50ms) + processing margin
    await new Promise((r) => setTimeout(r, 800));

    expect(onChange).toHaveBeenCalled();
    expect(onChange.mock.calls[0][0]).toContain('test.moment');
    await watcher.stop();
  });

  it('debounces rapid changes', async () => {
    mkdirSync(TEST_DIR, { recursive: true });
    const testFile = join(TEST_DIR, 'rapid.moment');
    writeFileSync(testFile, 'v1');

    const onChange = vi.fn();
    const watcher = new FileWatcher({
      patterns: ['**/*.moment'],
      cwd: TEST_DIR,
      debounceMs: 150,
      onChange,
    });

    await watcher.start();

    // Rapid-fire writes — should collapse into fewer callbacks
    for (let i = 2; i <= 6; i++) {
      writeFileSync(testFile, `v${i}`);
      await new Promise((r) => setTimeout(r, 20));
    }

    // Wait for debounce to settle
    await new Promise((r) => setTimeout(r, 500));

    // Debounce should collapse rapid writes
    expect(onChange.mock.calls.length).toBeLessThanOrEqual(3);
    await watcher.stop();
  });

  it('stops cleanly and releases handles', async () => {
    mkdirSync(TEST_DIR, { recursive: true });
    writeFileSync(join(TEST_DIR, 'stop.moment'), 'content');

    const onChange = vi.fn();
    const watcher = new FileWatcher({
      patterns: ['**/*.moment'],
      cwd: TEST_DIR,
      debounceMs: 50,
      onChange,
    });

    await watcher.start();
    expect(watcher.isRunning()).toBe(true);

    await watcher.stop();
    expect(watcher.isRunning()).toBe(false);

    // Write after stop — should not trigger callback
    writeFileSync(join(TEST_DIR, 'stop.moment'), 'after stop');
    await new Promise((r) => setTimeout(r, 200));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('does not start twice', async () => {
    mkdirSync(TEST_DIR, { recursive: true });
    writeFileSync(join(TEST_DIR, 'dup.moment'), 'content');

    const watcher = new FileWatcher({
      patterns: ['**/*.moment'],
      cwd: TEST_DIR,
      debounceMs: 50,
      onChange: vi.fn(),
    });

    await watcher.start();
    await watcher.start(); // second call should be no-op

    expect(watcher.isRunning()).toBe(true);
    await watcher.stop();
  });

  it('reports errors via onError callback', async () => {
    mkdirSync(TEST_DIR, { recursive: true });
    writeFileSync(join(TEST_DIR, 'err.moment'), 'content');

    const onError = vi.fn();
    const watcher = new FileWatcher({
      patterns: ['**/*.moment'],
      cwd: TEST_DIR,
      debounceMs: 50,
      onChange: () => {
        throw new Error('callback failure');
      },
      onError,
    });

    await watcher.start();
    writeFileSync(join(TEST_DIR, 'err.moment'), 'trigger error');

    await new Promise((r) => setTimeout(r, 600));

    expect(onError).toHaveBeenCalledWith(expect.any(Error));
    await watcher.stop();
  });

  it('does not miss events when callback is in flight', async () => {
    mkdirSync(TEST_DIR, { recursive: true });
    const testFile = join(TEST_DIR, 'inflight.moment');
    writeFileSync(testFile, 'v1');

    let callCount = 0;
    const onChange = vi.fn(async () => {
      callCount++;
      if (callCount === 1) {
        // Simulate slow callback
        await new Promise((r) => setTimeout(r, 200));
      }
    });

    const watcher = new FileWatcher({
      patterns: ['**/*.moment'],
      cwd: TEST_DIR,
      debounceMs: 30,
      onChange,
    });

    await watcher.start();

    // First change triggers slow callback
    writeFileSync(testFile, 'v2');
    await new Promise((r) => setTimeout(r, 100));

    // Second change arrives while first is in flight
    writeFileSync(testFile, 'v3');

    // Wait for both to complete
    await new Promise((r) => setTimeout(r, 800));

    // Both events should have been processed
    expect(onChange.mock.calls.length).toBeGreaterThanOrEqual(2);
    await watcher.stop();
  });
});
