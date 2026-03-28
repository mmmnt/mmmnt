import chokidar, { type FSWatcher } from 'chokidar';
import picomatch from 'picomatch';

export interface FileWatcherOptions {
  readonly patterns: readonly string[];
  readonly cwd: string;
  readonly debounceMs: number;
  readonly onChange: (changedPath: string) => void | Promise<void>;
  readonly onError?: (error: unknown) => void;
}

/**
 * Watches files matching glob patterns under a working directory.
 *
 * Implementation: chokidar watches the cwd directory with polling enabled
 * (reliable on Linux), and picomatch filters events to the configured patterns.
 * Debounces rapid changes and serializes async callbacks so no event is dropped.
 */
export class FileWatcher {
  private watcher: FSWatcher | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingPath: string | null = null;
  private callbackInFlight = false;
  private running = false;
  private readonly matcher: (path: string) => boolean;

  constructor(private readonly options: FileWatcherOptions) {
    this.matcher = picomatch(options.patterns as string[]);
  }

  async start(): Promise<void> {
    if (this.running) return;

    // Watch the directory, not glob patterns — chokidar glob watching
    // is unreliable on Linux. We filter with picomatch instead.
    const watcher = chokidar.watch(this.options.cwd, {
      ignoreInitial: true,
      usePolling: true,
      interval: 100,
      binaryInterval: 300,
    });

    watcher.on('change', (fullPath) => this.onEvent(fullPath));
    watcher.on('add', (fullPath) => this.onEvent(fullPath));
    watcher.on('error', (error) => {
      this.options.onError?.(error);
    });

    await new Promise<void>((resolve, reject) => {
      watcher.on('ready', () => resolve());
      // Only reject for errors that occur during initialization
      const timer = setTimeout(() => resolve(), 2000);
      watcher.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });

    this.watcher = watcher;
    this.running = true;
  }

  async stop(): Promise<void> {
    this.running = false;
    this.clearDebounce();
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
  }

  isRunning(): boolean {
    return this.running;
  }

  private onEvent(fullPath: string): void {
    // Extract relative path from cwd for matching
    const cwd = this.options.cwd.endsWith('/') ? this.options.cwd : this.options.cwd + '/';
    const relative = fullPath.startsWith(cwd) ? fullPath.slice(cwd.length) : fullPath;

    if (!this.matcher(relative)) return;
    this.pendingPath = relative;
    this.scheduleCallback();
  }

  private scheduleCallback(): void {
    this.clearDebounce();
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.flushPending();
    }, this.options.debounceMs);
  }

  private flushPending(): void {
    if (this.callbackInFlight) {
      // Re-schedule — don't drop the event
      this.scheduleCallback();
      return;
    }

    const path = this.pendingPath;
    if (!path) return;
    this.pendingPath = null;

    this.callbackInFlight = true;
    let result: void | Promise<void>;
    try {
      result = this.options.onChange(path);
    } catch (error) {
      this.options.onError?.(error);
      this.callbackInFlight = false;
      return;
    }
    Promise.resolve(result)
      .catch((error) => {
        this.options.onError?.(error);
      })
      .finally(() => {
        this.callbackInFlight = false;
        // If another event arrived during callback, flush it
        if (this.pendingPath && !this.debounceTimer) {
          this.flushPending();
        }
      });
  }

  private clearDebounce(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }
}
