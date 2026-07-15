/**
 * moment watch — Start reactive file watcher
 *
 * Delegates to FileWatcher + RegenerateOnMomentFileChanged from @mmmnt/core.
 * On a successful re-parse, the full generation pipeline runs for the changed
 * file (generate + emit-ts), making watch a build loop rather than a
 * stale-check (ADR-033 direction; incremental ledger is future work).
 * Watch configuration (paths, debounce) is manifest-driven when a
 * .manifest.yaml is present in the watched directory.
 */

import { parseArgs } from 'node:util';
import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import {
  FileWatcher,
  ManifestReader,
  RegenerateOnMomentFileChanged,
  type FileWatcherOptions,
  type WatchConfiguration,
} from '@mmmnt/core';
import { formatDiagnostic } from './parse.js';
import { runGenerate } from './generate.js';
import { runEmitTs } from './emit-ts.js';

export interface WatchCommandResult {
  readonly started: boolean;
  readonly message: string;
  readonly watcher?: FileWatcher;
}

const DEFAULT_WATCH: WatchConfiguration = {
  enabled: true,
  debounceMs: 300,
  paths: ['.moment/contexts', '.moment/flows', '.moment'],
};

function loadWatchConfig(targetDir: string, log: (msg: string) => void): WatchConfiguration {
  const manifestPath = join(targetDir, '.manifest.yaml');
  if (!existsSync(manifestPath)) return DEFAULT_WATCH;

  try {
    const manifest = new ManifestReader().readManifest(manifestPath);
    if (manifest.watch.paths.length > 0) return manifest.watch;
    return { ...manifest.watch, paths: DEFAULT_WATCH.paths };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`[watch] manifest unreadable (${msg}) — using default watch config`);
    return DEFAULT_WATCH;
  }
}

async function regenerate(
  filePath: string,
  log: (msg: string) => void,
  logError: (msg: string) => void,
): Promise<void> {
  const regenerated: string[] = [];

  const generateResult = await runGenerate([filePath]);
  if (generateResult.success) {
    regenerated.push('gherkin', 'markdown', 'test-scaffold');
  } else {
    logError(`[watch] generate failed: ${generateResult.message}`);
  }

  const emitResult = await runEmitTs([filePath]);
  if (emitResult.success) {
    regenerated.push('typescript');
  } else {
    logError(`[watch] emit-ts failed: ${emitResult.message}`);
  }

  if (regenerated.length > 0) {
    log(`[watch] changed: ${filePath} → regenerated: [${regenerated.join(', ')}]`);
  }
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
      'no-generate': { type: 'boolean' },
    },
    strict: false,
  });

  const noWatch = values['no-watch'] === true;
  const noGenerate = values['no-generate'] === true;
  const targetDir = resolve(typeof values.dir === 'string' ? values.dir : '.');

  if (noWatch) {
    return { started: false, message: 'Dry-run mode: --no-watch specified, exiting.' };
  }

  const watchConfig = loadWatchConfig(targetDir, log);
  if (!watchConfig.enabled) {
    return { started: false, message: 'Watch disabled by manifest (watch.enabled: false).' };
  }

  const policy = new RegenerateOnMomentFileChanged();

  const watcherOptions: FileWatcherOptions = {
    config: watchConfig,
    rootDir: targetDir,
    onFileChange: (filePath: string) => {
      log(`File changed: ${filePath}`);
      policy
        .onFileChanged(filePath)
        .then(async (result) => {
          if (result.parseResult.success) {
            log(`Parsed: ${filePath}`);
            if (!noGenerate) {
              await regenerate(filePath, log, logError);
            }
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

  return { started: true, message: `Watching for changes in ${targetDir}...`, watcher };
}
