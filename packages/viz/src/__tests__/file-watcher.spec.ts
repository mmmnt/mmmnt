import { describe, it, expect, vi, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { FileWatcher } from '../server/file-watcher.js';

const TEST_DIR = join(process.cwd(), '.test-watch-tmp');

/** Poll until condition is true, or timeout after maxMs. */
async function waitFor(condition: () => boolean, maxMs = 3000, intervalMs = 50): Promise<void> {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    if (condition()) return;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

describe('FileWatcher', () => {
  afterEach(async () => {
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
    writeFileSync(testFile, 'updated content');

    await waitFor(() => onChange.mock.calls.length > 0);

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

    for (let i = 2; i <= 6; i++) {
      writeFileSync(testFile, `v${i}`);
      await new Promise((r) => setTimeout(r, 20));
    }

    // Wait for at least one callback
    await waitFor(() => onChange.mock.calls.length > 0);
    // Small extra wait to see if more arrive
    await new Promise((r) => setTimeout(r, 300));

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

    writeFileSync(join(TEST_DIR, 'stop.moment'), 'after stop');
    await new Promise((r) => setTimeout(r, 300));
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
    await watcher.start();

    expect(watcher.isRunning()).toBe(true);
    await watcher.stop();
  });

  it('reports errors via onError callback', async () => {
    mkdirSync(TEST_DIR, { recursive: true });
    const errFile = join(TEST_DIR, 'err.moment');
    writeFileSync(errFile, 'content');

    // Let the file system settle before watching
    await new Promise((r) => setTimeout(r, 200));

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

    // Wait for watcher to be fully settled before writing
    await new Promise((r) => setTimeout(r, 200));
    writeFileSync(errFile, 'trigger error at ' + Date.now());

    await waitFor(() => onError.mock.calls.length > 0);

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

    writeFileSync(testFile, 'v2');
    await waitFor(() => onChange.mock.calls.length >= 1, 2000);

    // Write again while first callback is in flight
    writeFileSync(testFile, 'v3');

    await waitFor(() => onChange.mock.calls.length >= 2, 3000);

    expect(onChange.mock.calls.length).toBeGreaterThanOrEqual(2);
    await watcher.stop();
  });
});
