import chokidar, { type FSWatcher } from 'chokidar';
import { resolve } from 'node:path';
import type { WatchConfiguration } from '../ir/index.js';

export interface FileWatcherOptions {
  config: WatchConfiguration;
  rootDir: string;
  onFileChange: (filePath: string) => void;
}

export class FileWatcher {
  private watcher: FSWatcher | null = null;
  private readonly options: FileWatcherOptions;

  constructor(options: FileWatcherOptions) {
    this.options = options;
  }

  start(): void {
    if (!this.options.config.enabled) return;
    if (this.watcher) this.stop();

    const paths = this.options.config.paths.map((p) => resolve(this.options.rootDir, p));
    this.watcher = chokidar.watch(paths, {
      ignored: (path) =>
        !path.endsWith('.moment') &&
        !path.endsWith('.yaml') &&
        !path.endsWith('.yml') &&
        !path.includes('.'),
      persistent: true,
      ignoreInitial: true,
    });

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const pendingChanges = new Set<string>();

    const handler = (filePath: string) => {
      if (
        !filePath.endsWith('.moment') &&
        !filePath.endsWith('.yaml') &&
        !filePath.endsWith('.yml')
      )
        return;
      pendingChanges.add(filePath);
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const changes = [...pendingChanges];
        pendingChanges.clear();
        for (const change of changes) {
          this.options.onFileChange(change);
        }
      }, this.options.config.debounceMs);
    };

    this.watcher.on('change', handler).on('add', handler).on('unlink', handler);
  }

  stop(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
  }

  get isRunning(): boolean {
    return this.watcher != null;
  }
}
