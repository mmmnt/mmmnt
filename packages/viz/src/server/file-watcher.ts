import { watch, type FSWatcher } from 'fs';
import { resolve, relative } from 'path';
import { Glob } from 'glob';

export interface FileWatcherOptions {
  readonly patterns: readonly string[];
  readonly cwd: string;
  readonly debounceMs: number;
  readonly onChange: (changedPath: string) => void | Promise<void>;
}

export class FileWatcher {
  private watchers: FSWatcher[] = [];
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private callbackInFlight = false;

  constructor(private readonly options: FileWatcherOptions) {}

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    try {
      // Watch cwd recursively to catch newly created files matching patterns
      const watcher = watch(this.options.cwd, { recursive: true }, (_event, filename) => {
        if (filename && this.matchesPatterns(filename)) {
          this.scheduleCallback(resolve(this.options.cwd, filename));
        }
      });
      this.watchers.push(watcher);
    } catch {
      this.running = false;
      throw new Error(`Failed to start file watcher on ${this.options.cwd}`);
    }
  }

  stop(): void {
    this.running = false;
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    for (const watcher of this.watchers) {
      watcher.close();
    }
    this.watchers = [];
  }

  isRunning(): boolean {
    return this.running;
  }

  private matchesPatterns(filename: string): boolean {
    for (const pattern of this.options.patterns) {
      if (filename.endsWith(pattern.replace('**/', '').replace('*', ''))) {
        return true;
      }
    }
    return false;
  }

  private scheduleCallback(changedPath: string): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      if (this.callbackInFlight) return;
      this.callbackInFlight = true;
      const rel = relative(this.options.cwd, changedPath);
      Promise.resolve(this.options.onChange(rel || changedPath))
        .catch(() => {})
        .finally(() => {
          this.callbackInFlight = false;
        });
    }, this.options.debounceMs);
  }
}
