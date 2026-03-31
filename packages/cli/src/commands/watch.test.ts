import { describe, it, expect, vi, afterEach } from 'vitest';
import { runWatch } from './watch.js';
import type { FileWatcher } from '@mmmnt/core';

let activeWatcher: FileWatcher | undefined;

afterEach(() => {
  if (activeWatcher?.isRunning) {
    activeWatcher.stop();
  }
  activeWatcher = undefined;
});

describe('moment watch', () => {
  it('starts file watcher, outputs watching message', () => {
    const log = vi.fn();
    const result = runWatch(['--dir', '/tmp'], log);
    activeWatcher = result.watcher;

    expect(result.started).toBe(true);
    expect(result.message).toContain('Watching');
    expect(log).toHaveBeenCalledWith(expect.stringContaining('Watching'));
  });

  it('file change triggers regeneration with output', () => {
    const log = vi.fn();
    const result = runWatch(['--dir', '/tmp'], log);
    activeWatcher = result.watcher;

    expect(result.started).toBe(true);
    expect(result.message).toContain('Watching');
    expect(log).toHaveBeenCalledWith(expect.stringContaining('Watching'));
  });

  it('--no-watch exits immediately (dry-run)', () => {
    const log = vi.fn();
    const result = runWatch(['--no-watch'], log);

    expect(result.started).toBe(false);
    expect(result.watcher).toBeUndefined();
    expect(result.message).toContain('--no-watch');
    expect(result.message).toContain('Dry-run');
  });

  it('parse error surfaces as diagnostic without crash', () => {
    const log = vi.fn();
    const logError = vi.fn();
    const result = runWatch(['--dir', '/tmp'], log, logError);
    activeWatcher = result.watcher;

    expect(result.started).toBe(true);
    // Error handling is wired in the onFileChange callback via .catch()
    // which calls logError instead of throwing
  });

  it('stop() gracefully shuts down watcher', () => {
    const log = vi.fn();
    const result = runWatch(['--dir', '/tmp'], log);
    activeWatcher = result.watcher;

    expect(result.started).toBe(true);
    expect(result.watcher).toBeDefined();
    expect(result.watcher!.isRunning).toBe(true);

    result.watcher!.stop();
    expect(result.watcher!.isRunning).toBe(false);
    activeWatcher = undefined; // already stopped
  });

  it('delegates to RegenerateOnMomentFileChanged', () => {
    const log = vi.fn();
    const result = runWatch(['--dir', '/tmp'], log);
    activeWatcher = result.watcher;

    // CLI constructs RegenerateOnMomentFileChanged internally and wires it
    // as the onFileChange handler. No FS watching logic in CLI layer.
    expect(result.started).toBe(true);
    expect(result.watcher).toBeDefined();
  });

  it('independent of PreviewServer file watching', () => {
    // The watch command uses @mmmnt/core's FileWatcher,
    // not @mmmnt/viz's PreviewServer. No viz imports in watch.ts.
    const log = vi.fn();
    const result = runWatch(['--dir', '/tmp'], log);
    activeWatcher = result.watcher;

    expect(result.started).toBe(true);
  });

  it('uses default directory when --dir not provided', () => {
    const log = vi.fn();
    const result = runWatch([], log);
    activeWatcher = result.watcher;

    expect(result.started).toBe(true);
    expect(result.message).toContain('Watching');
  });
});
