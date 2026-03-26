import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { WatchConfiguration } from '../../src/ir/index.js';

// We need to mock node:fs watch before importing FileWatcher
const mockWatch = vi.fn();
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    watch: (...args: unknown[]) => mockWatch(...args),
  };
});

// Import after mock is set up
import { FileWatcher } from '../../src/infrastructure/file-watcher.js';

function makeConfig(overrides: Partial<WatchConfiguration> = {}): WatchConfiguration {
  return {
    enabled: true,
    debounceMs: 300,
    paths: ['.'],
    ...overrides,
  };
}

describe('FileWatcher', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'fw-test-'));
    mockWatch.mockReset();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('debounce', () => {
    it('uses default 300ms debounce', () => {
      vi.useFakeTimers();
      try {
        const onChange = vi.fn();
        let watchCallback!: (event: string, filename: string) => void;

        mockWatch.mockImplementation(
          (_path: string, _opts: unknown, cb: (event: string, filename: string) => void) => {
            watchCallback = cb;
            return { close: vi.fn() };
          },
        );

        const watcher = new FileWatcher({
          config: makeConfig({ debounceMs: 300 }),
          rootDir: tempDir,
          onFileChange: onChange,
        });
        watcher.start();

        // Simulate a file change
        watchCallback('change', 'test.moment');
        expect(onChange).not.toHaveBeenCalled();

        // At 299ms, still not called
        vi.advanceTimersByTime(299);
        expect(onChange).not.toHaveBeenCalled();

        // At 300ms, debounce fires
        vi.advanceTimersByTime(1);
        expect(onChange).toHaveBeenCalledTimes(1);

        watcher.stop();
      } finally {
        vi.useRealTimers();
      }
    });

    it('rapid changes within debounce window produce one callback', () => {
      vi.useFakeTimers();
      try {
        const onChange = vi.fn();
        let watchCallback!: (event: string, filename: string) => void;

        mockWatch.mockImplementation(
          (_path: string, _opts: unknown, cb: (event: string, filename: string) => void) => {
            watchCallback = cb;
            return { close: vi.fn() };
          },
        );

        const watcher = new FileWatcher({
          config: makeConfig({ debounceMs: 100 }),
          rootDir: tempDir,
          onFileChange: onChange,
        });
        watcher.start();

        // Simulate rapid changes
        watchCallback('change', 'a.moment');
        vi.advanceTimersByTime(50);
        watchCallback('change', 'b.moment');
        vi.advanceTimersByTime(50);
        watchCallback('change', 'c.yaml');

        // Still within debounce window of last change
        vi.advanceTimersByTime(99);
        expect(onChange).not.toHaveBeenCalled();

        // Debounce fires — one call per unique file
        vi.advanceTimersByTime(1);
        expect(onChange).toHaveBeenCalledTimes(3);

        watcher.stop();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('path filtering', () => {
    it('only triggers for .moment and .yaml files', () => {
      vi.useFakeTimers();
      try {
        const onChange = vi.fn();
        let watchCallback!: (event: string, filename: string) => void;

        mockWatch.mockImplementation(
          (_path: string, _opts: unknown, cb: (event: string, filename: string) => void) => {
            watchCallback = cb;
            return { close: vi.fn() };
          },
        );

        const watcher = new FileWatcher({
          config: makeConfig({ debounceMs: 10 }),
          rootDir: tempDir,
          onFileChange: onChange,
        });
        watcher.start();

        watchCallback('change', 'test.moment');
        watchCallback('change', 'config.yaml');
        watchCallback('change', 'config.yml');
        vi.advanceTimersByTime(20);

        expect(onChange).toHaveBeenCalledTimes(3);
        expect(onChange).toHaveBeenCalledWith(expect.stringContaining('test.moment'));
        expect(onChange).toHaveBeenCalledWith(expect.stringContaining('config.yaml'));
        expect(onChange).toHaveBeenCalledWith(expect.stringContaining('config.yml'));

        watcher.stop();
      } finally {
        vi.useRealTimers();
      }
    });

    it('ignores changes outside configured paths', () => {
      vi.useFakeTimers();
      try {
        const onChange = vi.fn();
        let watchCallback!: (event: string, filename: string) => void;

        mockWatch.mockImplementation(
          (_path: string, _opts: unknown, cb: (event: string, filename: string) => void) => {
            watchCallback = cb;
            return { close: vi.fn() };
          },
        );

        const watcher = new FileWatcher({
          config: makeConfig({ debounceMs: 10 }),
          rootDir: tempDir,
          onFileChange: onChange,
        });
        watcher.start();

        // These should be ignored — wrong extensions
        watchCallback('change', 'readme.md');
        watchCallback('change', 'script.ts');
        watchCallback('change', 'data.json');
        // Null filename should also be ignored
        watchCallback('change', null as unknown as string);

        vi.advanceTimersByTime(20);
        expect(onChange).not.toHaveBeenCalled();

        watcher.stop();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('disable', () => {
    it('does not start when config.enabled is false', () => {
      const onChange = vi.fn();

      const watcher = new FileWatcher({
        config: makeConfig({ enabled: false }),
        rootDir: tempDir,
        onFileChange: onChange,
      });
      watcher.start();

      expect(watcher.isRunning).toBe(false);
      expect(mockWatch).not.toHaveBeenCalled();
    });

    it('does not start when paths array is empty', () => {
      const onChange = vi.fn();

      const watcher = new FileWatcher({
        config: makeConfig({ paths: [] }),
        rootDir: tempDir,
        onFileChange: onChange,
      });
      watcher.start();

      expect(watcher.isRunning).toBe(false);
    });
  });

  describe('lifecycle', () => {
    it('start creates watchers', () => {
      mockWatch.mockReturnValue({ close: vi.fn() });

      const watcher = new FileWatcher({
        config: makeConfig({ paths: ['src', 'lib'] }),
        rootDir: tempDir,
        onFileChange: vi.fn(),
      });

      expect(watcher.isRunning).toBe(false);
      watcher.start();
      expect(watcher.isRunning).toBe(true);

      watcher.stop();
    });

    it('stop closes all watchers and clears pending changes', () => {
      vi.useFakeTimers();
      try {
        const closeA = vi.fn();
        const closeB = vi.fn();
        let callCount = 0;
        let watchCallback!: (event: string, filename: string) => void;

        mockWatch.mockImplementation(
          (_path: string, _opts: unknown, cb: (event: string, filename: string) => void) => {
            watchCallback = cb;
            callCount++;
            return { close: callCount === 1 ? closeA : closeB };
          },
        );

        const onChange = vi.fn();
        const watcher = new FileWatcher({
          config: makeConfig({ paths: ['a', 'b'], debounceMs: 100 }),
          rootDir: tempDir,
          onFileChange: onChange,
        });
        watcher.start();

        // Queue a change but don't let debounce fire
        watchCallback('change', 'test.moment');

        watcher.stop();

        expect(closeA).toHaveBeenCalled();
        expect(closeB).toHaveBeenCalled();
        expect(watcher.isRunning).toBe(false);

        // Debounce should not fire after stop
        vi.advanceTimersByTime(200);
        expect(onChange).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
