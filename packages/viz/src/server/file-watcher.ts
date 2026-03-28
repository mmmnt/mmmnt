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

  constructor(private readonly options: FileWatcherOptions) {}

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    const resolvedPaths = await this.resolvePatterns();

    for (const filePath of resolvedPaths) {
      const watcher = watch(filePath, () => {
        this.scheduleCallback(filePath);
      });
      this.watchers.push(watcher);
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

  private scheduleCallback(changedPath: string): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      const rel = relative(this.options.cwd, changedPath);
      void this.options.onChange(rel || changedPath);
    }, this.options.debounceMs);
  }

  private async resolvePatterns(): Promise<string[]> {
    const allPaths: string[] = [];
    for (const pattern of this.options.patterns) {
      const glob = new Glob(pattern, { cwd: this.options.cwd, absolute: true });
      for await (const match of glob) {
        allPaths.push(resolve(match));
      }
    }
    return allPaths;
  }
}
