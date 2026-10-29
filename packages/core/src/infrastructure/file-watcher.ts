import chokidar, { type FSWatcher } from 'chokidar';
import type { Stats } from 'node:fs';
import { resolve } from 'node:path';
import type { WatchConfiguration } from '../ir/index.js';

export interface FileWatcherOptions {
  config: WatchConfiguration;
  rootDir: string;
  onFileChange: (filePath: string) => void;
}

const WATCHED_EXTENSIONS = ['.moment', '.yaml', '.yml'];

const isWatchedFile = (path: string): boolean =>
  WATCHED_EXTENSIONS.some((ext) => path.endsWith(ext));

/**
 * Chokidar's `ignored` predicate. Only files with another extension are ignored; directories are
 * always walked. Chokidar may call this before it has stats, so a path without stats is kept and
 * the change handler filters by extension. (Treating every dot-less path as ignorable skipped any
 * watched directory such as `model/` whose absolute path happened to contain no dot.)
 */
export function isIgnored(path: string, stats?: Stats): boolean {
  return stats?.isFile() === true && !isWatchedFile(path);
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
      ignored: isIgnored,
      persistent: true,
      ignoreInitial: true,
    });

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const pendingChanges = new Set<string>();

    const handler = (filePath: string) => {
      if (!isWatchedFile(filePath)) return;
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
