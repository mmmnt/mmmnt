import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { WatchConfiguration } from '../../src/ir/index.js';

type ChokidarHandler = (filePath: string) => void;

interface MockWatcher {
  on: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  handlers: Map<string, ChokidarHandler>;
}

function createMockWatcher(): MockWatcher {
  const handlers = new Map<string, ChokidarHandler>();
  const watcher: MockWatcher = {
    handlers,
    close: vi.fn(),
    on: vi.fn((event: string, handler: ChokidarHandler) => {
      handlers.set(event, handler);
      return watcher;
    }),
  };
  return watcher;
}

let currentMockWatcher: MockWatcher;

vi.mock('chokidar', () => ({
  default: {
    watch: vi.fn(() => {
      currentMockWatcher = createMockWatcher();
      return currentMockWatcher;
    }),
  },
}));

import { FileWatcher } from '../../src/infrastructure/file-watcher.js';
import chokidar from 'chokidar';

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
    vi.mocked(chokidar.watch).mockClear();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('debounce', () => {
    it('uses default 300ms debounce', () => {
      vi.useFakeTimers();
      try {
        const onChange = vi.fn();

        const watcher = new FileWatcher({
          config: makeConfig({ debounceMs: 300 }),
          rootDir: tempDir,
          onFileChange: onChange,
        });
        watcher.start();

        const handler = currentMockWatcher.handlers.get('change')!;
        handler('/some/path/test.moment');
        expect(onChange).not.toHaveBeenCalled();

        vi.advanceTimersByTime(299);
        expect(onChange).not.toHaveBeenCalled();

        vi.advanceTimersByTime(1);
        expect(onChange).toHaveBeenCalledTimes(1);

        watcher.stop();
      } finally {
        vi.useRealTimers();
      }
    });

    it('rapid changes within debounce window produce one callback per file', () => {
      vi.useFakeTimers();
      try {
        const onChange = vi.fn();

        const watcher = new FileWatcher({
          config: makeConfig({ debounceMs: 100 }),
          rootDir: tempDir,
          onFileChange: onChange,
        });
        watcher.start();

        const handler = currentMockWatcher.handlers.get('change')!;
        handler('/path/a.moment');
        vi.advanceTimersByTime(50);
        handler('/path/b.moment');
        vi.advanceTimersByTime(50);
        handler('/path/c.yaml');

        vi.advanceTimersByTime(99);
        expect(onChange).not.toHaveBeenCalled();

        vi.advanceTimersByTime(1);
        expect(onChange).toHaveBeenCalledTimes(3);

        watcher.stop();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('path filtering', () => {
    it('only triggers for .moment, .yaml, and .yml files', () => {
      vi.useFakeTimers();
      try {
        const onChange = vi.fn();

        const watcher = new FileWatcher({
          config: makeConfig({ debounceMs: 10 }),
          rootDir: tempDir,
          onFileChange: onChange,
        });
        watcher.start();

        const handler = currentMockWatcher.handlers.get('change')!;
        handler('/path/test.moment');
        handler('/path/config.yaml');
        handler('/path/config.yml');
        vi.advanceTimersByTime(20);

        expect(onChange).toHaveBeenCalledTimes(3);
        expect(onChange).toHaveBeenCalledWith('/path/test.moment');
        expect(onChange).toHaveBeenCalledWith('/path/config.yaml');
        expect(onChange).toHaveBeenCalledWith('/path/config.yml');

        watcher.stop();
      } finally {
        vi.useRealTimers();
      }
    });

    it('ignores changes for unsupported extensions', () => {
      vi.useFakeTimers();
      try {
        const onChange = vi.fn();

        const watcher = new FileWatcher({
          config: makeConfig({ debounceMs: 10 }),
          rootDir: tempDir,
          onFileChange: onChange,
        });
        watcher.start();

        const handler = currentMockWatcher.handlers.get('change')!;
        handler('/path/readme.md');
        handler('/path/script.ts');
        handler('/path/data.json');

        vi.advanceTimersByTime(20);
        expect(onChange).not.toHaveBeenCalled();

        watcher.stop();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('event types', () => {
    it('handles add and unlink events', () => {
      vi.useFakeTimers();
      try {
        const onChange = vi.fn();

        const watcher = new FileWatcher({
          config: makeConfig({ debounceMs: 10 }),
          rootDir: tempDir,
          onFileChange: onChange,
        });
        watcher.start();

        const addHandler = currentMockWatcher.handlers.get('add')!;
        const unlinkHandler = currentMockWatcher.handlers.get('unlink')!;
        addHandler('/path/new.moment');
        unlinkHandler('/path/old.yaml');
        vi.advanceTimersByTime(20);

        expect(onChange).toHaveBeenCalledTimes(2);
        expect(onChange).toHaveBeenCalledWith('/path/new.moment');
        expect(onChange).toHaveBeenCalledWith('/path/old.yaml');

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
      expect(chokidar.watch).not.toHaveBeenCalled();
    });
  });

  describe('lifecycle', () => {
    it('start creates watcher', () => {
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

    it('stop closes watcher', () => {
      const watcher = new FileWatcher({
        config: makeConfig(),
        rootDir: tempDir,
        onFileChange: vi.fn(),
      });
      watcher.start();
      const mockWatcher = currentMockWatcher;

      watcher.stop();

      expect(mockWatcher.close).toHaveBeenCalled();
      expect(watcher.isRunning).toBe(false);
    });

    it('start stops previous watcher before creating new one', () => {
      const watcher = new FileWatcher({
        config: makeConfig(),
        rootDir: tempDir,
        onFileChange: vi.fn(),
      });

      watcher.start();
      const firstWatcher = currentMockWatcher;

      watcher.start();
      expect(firstWatcher.close).toHaveBeenCalled();
      expect(watcher.isRunning).toBe(true);

      watcher.stop();
    });

    it('stop is safe to call when not running', () => {
      const watcher = new FileWatcher({
        config: makeConfig(),
        rootDir: tempDir,
        onFileChange: vi.fn(),
      });

      // Should not throw
      watcher.stop();
      expect(watcher.isRunning).toBe(false);
    });
  });
});
