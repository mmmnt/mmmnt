import { dirname, join } from 'node:path';
import { JsonlSyncLogStore, SyncLogCorruptedError } from '@mmmnt/sync';
import type { SyncLogs } from '@mmmnt/sync';
import { isDirectory } from './load-specification.js';

/** A model directory holds its own `.domain/`; a single file's sits beside it (as reconcile). */
export function domainDirOf(specPath: string): string {
  return join(isDirectory(specPath) ? specPath : dirname(specPath), '.domain');
}

export interface OpenedSyncLogs {
  readonly store: JsonlSyncLogStore;
  readonly logs: SyncLogs;
}

/** Replay the three sync logs for a spec; a corrupted log comes back as its refusal message. */
export function openSyncLogs(specPath: string): OpenedSyncLogs | string {
  const store = new JsonlSyncLogStore(domainDirOf(specPath));
  try {
    return { store, logs: store.load() };
  } catch (err: unknown) {
    if (err instanceof SyncLogCorruptedError) return `Error: ${err.message}`;
    throw err;
  }
}
