/**
 * moment watch — Start reactive file watcher
 *
 * Delegates to FileWatcher + RegenerateOnMomentFileChanged from @mmmnt/core.
 * No file system watching logic in the CLI layer (EXIT-C1).
 */

import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { FileWatcher, RegenerateOnMomentFileChanged, type FileWatcherOptions } from '@mmmnt/core';
import { formatDiagnostic } from './parse.js';

export interface WatchCommandResult {
  readonly started: boolean;
  readonly message: string;
}

export interface WatchContext {
  readonly watcher: FileWatcher;
  stop(): void;
}

export function runWatch(
  argv: string[],
  log: (msg: string) => void = console.log,
  logError: (msg: string) => void = console.error,
): WatchCommandResult {
  const { values } = parseArgs({
    args: argv,
    options: {
      dir: { type: 'string', short: 'd' },
      'no-watch': { type: 'boolean' },
    },
    strict: false,
  });

  const noWatch = values['no-watch'] === true;
  const targetDir = resolve(typeof values.dir === 'string' ? values.dir : '.');

  if (noWatch) {
    return { started: false, message: 'Dry-run mode: --no-watch specified, exiting.' };
  }

  const policy = new RegenerateOnMomentFileChanged();

  const watcherOptions: FileWatcherOptions = {
    config: {
      enabled: true,
      debounceMs: 300,
      paths: ['.moment/contexts', '.moment/flows'],
    },
    rootDir: targetDir,
    onFileChange: (filePath: string) => {
      log(`File changed: ${filePath}`);
      policy
        .onFileChanged(filePath)
        .then((result) => {
          if (result.parseResult.success) {
            log(`Regenerated: ${filePath}`);
          } else {
            for (const d of result.parseResult.diagnostics) {
              logError(formatDiagnostic(d, filePath));
            }
          }
        })
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          logError(`Error processing ${filePath}: ${msg}`);
        });
    },
  };

  const watcher = new FileWatcher(watcherOptions);
  watcher.start();

  log(`Watching for changes in ${targetDir}...`);

  return { started: true, message: `Watching for changes in ${targetDir}...` };
}
