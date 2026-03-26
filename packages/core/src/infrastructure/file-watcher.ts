import { watch, type FSWatcher } from 'node:fs';
import { resolve } from 'node:path';
import type { WatchConfiguration } from '../ir/index.js';

export interface FileWatcherOptions {
  config: WatchConfiguration;
  rootDir: string;
  onFileChange: (filePath: string) => void;
}

export class FileWatcher {
  private watchers: FSWatcher[] = [];
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingChanges: Set<string> = new Set();
  private readonly options: FileWatcherOptions;

  constructor(options: FileWatcherOptions) {
    this.options = options;
  }

  start(): void {
    if (!this.options.config.enabled) {
      return; // Disabled via config
    }

    const debounceMs = this.options.config.debounceMs;

    for (const watchPath of this.options.config.paths) {
      const fullPath = resolve(this.options.rootDir, watchPath);
      try {
        const watcher = watch(fullPath, { recursive: true }, (eventType, filename) => {
          if (!filename) return;
          const filePath = resolve(fullPath, filename);

          // Only react to .moment and .yaml files
          if (
            !filePath.endsWith('.moment') &&
            !filePath.endsWith('.yaml') &&
            !filePath.endsWith('.yml')
          ) {
            return;
          }

          this.pendingChanges.add(filePath);

          if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
          }

          this.debounceTimer = setTimeout(() => {
            const changes = [...this.pendingChanges];
            this.pendingChanges.clear();
            for (const change of changes) {
              this.options.onFileChange(change);
            }
          }, debounceMs);
        });
        this.watchers.push(watcher);
      } catch {
        // Path doesn't exist yet — skip silently
      }
    }
  }

  stop(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    for (const watcher of this.watchers) {
      watcher.close();
    }
    this.watchers = [];
    this.pendingChanges.clear();
  }

  get isRunning(): boolean {
    return this.watchers.length > 0;
  }
}
