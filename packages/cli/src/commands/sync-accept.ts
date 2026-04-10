/**
 * moment sync accept — Accept implementation change proposals by ID
 *
 * Delegates to SyncState.acceptProposal() — no state logic in CLI (EXIT-C1).
 */

import { parseArgs } from 'node:util';
import type { Diagnostic } from '@mmmnt/core';

export interface SyncAcceptResult {
  readonly success: boolean;
  readonly message: string;
  readonly diagnostics: readonly Diagnostic[];
  readonly filePath?: string;
  readonly acceptedCount: number;
  readonly json?: string;
}

const EMPTY: readonly Diagnostic[] = [];
const USAGE = 'Usage: moment sync accept [--all] <file.moment> [<proposal-id>...]';

function fail(message: string): SyncAcceptResult {
  return { success: false, message, diagnostics: EMPTY, acceptedCount: 0 };
}

function readFile(path: string): string | SyncAcceptResult {
  try {
    return readFileSync(path, 'utf-8');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return fail(`Error: Failed to read ${path}: ${msg}`);
  }
}

export async function runSyncAccept(argv: string[]): Promise<SyncAcceptResult> {
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      all: { type: 'boolean' },
      json: { type: 'boolean' },
    },
    allowPositionals: true,
    strict: false,
  });

  const filePath = positionals[0];
  if (!filePath) return fail(USAGE);

  // GUARD: sync accept is not yet fully implemented. SyncState records and
  // "accepts" proposals in memory, but (1) the acceptance is never persisted
  // to .domain/sync-state.jsonl and (2) the proposed changes are never
  // applied to the actual TypeScript files. Fail fast before doing any
  // expensive parse/emit/diff work.
  return fail(
    'Error: sync accept is not yet fully implemented — accepted proposals are not ' +
      'persisted and not applied to files. Use `moment sync propose` to generate ' +
      'proposals, then apply them manually. ' +
      'See https://github.com/mmmnt/mmmnt/issues for tracking.',
  );
}

// parseSpecFile, generateProposals, executeAccept, acceptAllProposals,
// acceptByIds, and readActualFiles were all removed because they are
// unreachable below the fail() guard above. They'll be restored (with
// real persistence + disk writes) when the full sync-accept pipeline
// is implemented.
