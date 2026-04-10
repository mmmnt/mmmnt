/**
 * moment sync propose — Generate and present implementation change proposals
 *
 * Pipeline: parse → emit-ts (expected) + read actual → ASTDiffEngine.generateProposals()
 * Delegates to generateProposals() + PushFlowSaga — no proposal logic in CLI (EXIT-C1).
 * Every accepted proposal routes through PushFlowSaga (IS-04).
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { MomentParser } from '@mmmnt/core';
import { TypeScriptEmitter } from '@mmmnt/emit-ts';
import { ASTDiffEngine, LocalGitArtifactStore, PushFlowSaga, SyncState } from '@mmmnt/sync';
import type { Diagnostic } from '@mmmnt/core';
import type { ImplementationChangeProposal } from '@mmmnt/sync';

export interface SyncProposeResult {
  readonly success: boolean;
  readonly message: string;
  readonly diagnostics: readonly Diagnostic[];
  readonly filePath?: string;
  readonly proposals?: readonly ImplementationChangeProposal[];
  readonly accepted: number;
  readonly rejected: number;
  readonly skipped: number;
  readonly json?: string;
}

const EMPTY: readonly Diagnostic[] = [];

function fail(message: string): SyncProposeResult {
  return { success: false, message, diagnostics: EMPTY, accepted: 0, rejected: 0, skipped: 0 };
}

function readFile(path: string): string | SyncProposeResult {
  try {
    return readFileSync(path, 'utf-8');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return fail(`Error: Failed to read ${path}: ${msg}`);
  }
}

export async function runSyncPropose(argv: string[]): Promise<SyncProposeResult> {
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      json: { type: 'boolean' },
      'auto-accept': { type: 'boolean' },
    },
    allowPositionals: true,
    strict: false,
  });

  const filePath = positionals[0];
  if (!filePath) return fail('Usage: moment sync propose <file.moment>');

  const resolvedPath = resolve(filePath);
  if (!existsSync(resolvedPath)) return fail(`Error: File not found: ${resolvedPath}`);

  const content = readFile(resolvedPath);
  if (typeof content !== 'string') return content;

  const parseResult = await new MomentParser().parseContent(content);

  if (!parseResult.success) {
    return {
      success: false,
      message: `Parse failed with ${parseResult.diagnostics.length} diagnostic(s)`,
      diagnostics: parseResult.diagnostics,
      filePath: resolvedPath,
      accepted: 0,
      rejected: 0,
      skipped: 0,
    };
  }

  const ir = parseResult.ir!;

  // Generate expected TypeScript from spec
  const tsOutput = new TypeScriptEmitter().emit(ir, { scope: { level: 'system' } });

  // Read actual implementation files
  const repoRoot = dirname(resolvedPath);
  const store = new LocalGitArtifactStore(repoRoot);
  const actual = await readActualFiles(store, [...tsOutput.files.keys()]);

  // Generate proposals via ASTDiffEngine (EXIT-C1)
  const proposals = new ASTDiffEngine().generateProposals({
    expected: tsOutput.files,
    actual,
  });

  // Drive PushFlowSaga to terminal state (IS-04)
  const saga = new PushFlowSaga();
  saga.start();
  saga.proposalsGenerated(proposals.length);

  if (proposals.length === 0) {
    // Zero-proposal shortcut — saga auto-completes
    const noChanges = { proposals: [], accepted: 0, rejected: 0, skipped: 0 };
    return {
      success: true,
      message: values.json === true ? JSON.stringify(noChanges, null, 2) : 'No changes to propose',
      diagnostics: EMPTY,
      proposals: [],
      accepted: 0,
      rejected: 0,
      skipped: 0,
      json: values.json === true ? JSON.stringify(noChanges, null, 2) : undefined,
    };
  }

  // Record proposals in SyncState
  const syncState = new SyncState();
  for (const p of proposals) {
    syncState.recordProposal(p);
  }

  // Auto-accept mode or skip (non-interactive CLI defaults to skip)
  const autoAccept = values['auto-accept'] === true;

  // GUARD: --auto-accept has the same "silent no-op" bug as sync accept.
  // SyncState.acceptProposal() runs in memory but is never persisted and
  // the proposals are never applied to files on disk. Fail loudly until
  // the full persistence + application pipeline is implemented.
  if (autoAccept) {
    return fail(
      'Error: --auto-accept is not yet fully implemented — accepted proposals are not ' +
        'persisted and not applied to files. Omit --auto-accept to generate proposals ' +
        'for manual review instead. ' +
        'See https://github.com/mmmnt/mmmnt/issues for tracking.',
    );
  }

  const counts = processProposals(proposals, syncState, autoAccept);

  // Drive saga to terminal state
  saga.confirmationComplete(counts.accepted, counts.rejected, counts.skipped);
  saga.recordingComplete(counts.accepted);
  saga.committed(`cli-propose-${saga.getSagaId()}`);
  saga.complete();

  return buildResult(proposals, counts, values.json === true);
}

function buildResult(
  proposals: ImplementationChangeProposal[],
  counts: { accepted: number; rejected: number; skipped: number },
  asJson: boolean,
): SyncProposeResult {
  if (asJson) {
    const json = JSON.stringify({ proposals, ...counts }, null, 2);
    return { success: true, message: json, diagnostics: EMPTY, proposals, json, ...counts };
  }
  return {
    success: true,
    message: formatProposalSummary(proposals, counts),
    diagnostics: EMPTY,
    proposals,
    ...counts,
  };
}

async function readActualFiles(
  store: LocalGitArtifactStore,
  paths: string[],
): Promise<Map<string, string>> {
  const actual = new Map<string, string>();
  for (const path of paths) {
    try {
      const content = await store.readArtifact(path);
      actual.set(path, content);
    } catch (err: unknown) {
      // Only ignore "artifact not found" — surface other errors
      const msg = err instanceof Error ? err.message : '';
      if (msg.startsWith('Artifact not found')) continue;
      throw err;
    }
  }
  return actual;
}

function processProposals(
  proposals: ImplementationChangeProposal[],
  syncState: SyncState,
  autoAccept: boolean,
): { accepted: number; rejected: number; skipped: number } {
  let accepted = 0;
  const skipped = autoAccept ? 0 : proposals.length;

  if (autoAccept) {
    for (const p of proposals) {
      syncState.acceptProposal(p.proposalId);
      accepted++;
    }
  }

  return { accepted, rejected: 0, skipped };
}

function formatProposalSummary(
  proposals: ImplementationChangeProposal[],
  counts: { accepted: number; rejected: number; skipped: number },
): string {
  const lines: string[] = [];
  lines.push(`Generated ${proposals.length} proposal(s):`);
  lines.push('');

  for (const p of proposals) {
    const payloadKeys = Object.keys(p.proposedPayload);
    const detail = payloadKeys.length > 0 ? ` (${payloadKeys.join(', ')})` : '';
    lines.push(`  ${p.proposedEventType}${detail}`);
    lines.push(`    File: ${p.sourceFile}`);
  }

  lines.push('');
  lines.push(
    `Accepted: ${counts.accepted}, Rejected: ${counts.rejected}, Skipped: ${counts.skipped}`,
  );
  return lines.join('\n');
}
