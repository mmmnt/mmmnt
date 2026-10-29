/**
 * moment sync propose — Record implementation change proposals for review
 *
 * Pipeline: parse → emit-ts (expected) + read actual → ASTDiffEngine.generateProposals()
 * Delegates to generateProposals() + SyncState — no proposal logic in CLI (EXIT-C1).
 * Proposals persist in .domain/sync-state.jsonl (ADR-039 §2): a proposal's id is
 * derived from its drift, so a re-run records only new drift and supersedes
 * pending proposals whose drift is gone. Decisions are `sync accept` / `sync reject`.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolveRepoRoot } from '../lib/repo-root.js';
import { parseArgs } from 'node:util';
import { TypeScriptEmitter } from '@mmmnt/emit-ts';
import { ASTDiffEngine, LocalGitArtifactStore } from '@mmmnt/sync';
import type { Diagnostic } from '@mmmnt/core';
import type { ImplementationChangeProposal, SyncState, SyncStateEvent } from '@mmmnt/sync';
import { parseSpecification, specificationText } from '../lib/load-specification.js';
import { openSyncLogs } from '../lib/sync-logs.js';

export interface SyncProposeResult {
  readonly success: boolean;
  readonly message: string;
  readonly diagnostics: readonly Diagnostic[];
  readonly filePath?: string;
  /** Every proposal pending after this run. */
  readonly proposals?: readonly ImplementationChangeProposal[];
  readonly recorded: number;
  readonly superseded: number;
  readonly json?: string;
}

const EMPTY: readonly Diagnostic[] = [];
const DRIFT_GONE = 'drift no longer present';

function fail(message: string): SyncProposeResult {
  return { success: false, message, diagnostics: EMPTY, recorded: 0, superseded: 0 };
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

  // Accepting is a decision with an actor and a commit (ADR-039 §3); propose
  // only records. Refuse before doing any expensive work.
  if (values['auto-accept'] === true) {
    return fail(
      'Error: --auto-accept is not yet fully implemented — accepted proposals are not ' +
        'persisted and not applied to files. Omit --auto-accept to generate proposals, ' +
        'then decide them with `moment sync accept` or `moment sync reject`.',
    );
  }

  const filePath = positionals[0];
  if (!filePath) return fail('Usage: moment sync propose <file.moment|dir>');

  const resolvedPath = resolve(filePath);
  if (!existsSync(resolvedPath)) return fail(`Error: File not found: ${resolvedPath}`);

  const drift = await detectDrift(resolvedPath);
  if (!Array.isArray(drift)) return drift;

  const opened = openSyncLogs(resolvedPath);
  if (typeof opened === 'string') return fail(opened);
  const { store, logs } = opened;

  const events = reconcileProposals(logs.syncState, drift);
  store.append({ syncState: events });

  const pending = logs.syncState
    .getProposals()
    .filter((entry) => entry.status === 'pending')
    .map((entry) => entry.proposal);
  const recorded = events.filter((e) => e.type === 'ProposalRecorded').length;
  return buildResult(pending, recorded, events.length - recorded, values.json === true);
}

/** The proposals the current drift implies, or the refusal that stopped the pipeline. */
async function detectDrift(
  resolvedPath: string,
): Promise<ImplementationChangeProposal[] | SyncProposeResult> {
  const content = specificationText(resolvedPath, readFile);
  if (typeof content !== 'string') return content;

  const parseResult = await parseSpecification(resolvedPath, content);
  if (!parseResult.success) {
    return {
      success: false,
      message: `Parse failed with ${parseResult.diagnostics.length} diagnostic(s)`,
      diagnostics: parseResult.diagnostics,
      filePath: resolvedPath,
      recorded: 0,
      superseded: 0,
    };
  }

  // Generate expected TypeScript from spec
  const tsOutput = new TypeScriptEmitter().emit(parseResult.ir!, { scope: { level: 'system' } });

  // Read actual implementation files (project root: manifest > git > spec dir)
  const repoRoot = resolveRepoRoot(resolvedPath);
  const actual = await readActualFiles(new LocalGitArtifactStore(repoRoot), [
    ...tsOutput.files.keys(),
  ]);

  // Generate proposals via ASTDiffEngine (EXIT-C1)
  return new ASTDiffEngine().generateProposals({ expected: tsOutput.files, actual });
}

/** Record new drift; supersede pending proposals whose drift is gone; leave decided ones alone. */
function reconcileProposals(
  syncState: SyncState,
  drift: readonly ImplementationChangeProposal[],
): SyncStateEvent[] {
  const drifting = new Set(drift.map((p) => p.proposalId));
  const events: SyncStateEvent[] = [];
  for (const proposal of drift) {
    if (syncState.getProposalStatus(proposal.proposalId) !== undefined) continue;
    events.push(syncState.recordProposal(proposal));
  }
  for (const { proposal, status } of syncState.getProposals()) {
    if (status !== 'pending' || drifting.has(proposal.proposalId)) continue;
    events.push(syncState.skipProposal(proposal.proposalId, DRIFT_GONE));
  }
  return events;
}

function buildResult(
  pending: readonly ImplementationChangeProposal[],
  recorded: number,
  superseded: number,
  asJson: boolean,
): SyncProposeResult {
  const counts = { proposals: pending, recorded, superseded };
  if (asJson) {
    const json = JSON.stringify(counts, null, 2);
    return { success: true, message: json, diagnostics: EMPTY, json, ...counts };
  }
  return {
    success: true,
    message: formatProposalSummary(pending, recorded, superseded),
    diagnostics: EMPTY,
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

function formatProposalSummary(
  pending: readonly ImplementationChangeProposal[],
  recorded: number,
  superseded: number,
): string {
  const lines: string[] = [];
  lines.push(`Recorded ${recorded} new proposal(s); superseded ${superseded}.`);
  if (pending.length === 0) {
    lines.push('No pending proposals.');
    return lines.join('\n');
  }
  lines.push(`Pending ${pending.length} proposal(s):`);
  lines.push('');

  for (const p of pending) {
    // Render payload values (what changed), not the payload's field names.
    const detail = Object.entries(p.proposedPayload)
      .filter(([, v]) => typeof v === 'string' || typeof v === 'number')
      .map(([k, v]) => `${k}: ${String(v)}`)
      .join(', ');
    lines.push(`  ${p.proposalId}  ${p.proposedEventType}${detail ? ` — ${detail}` : ''}`);
    lines.push(`    File: ${p.sourceFile}`);
  }

  lines.push('');
  lines.push(
    'Decide with `moment sync accept <spec> <id>...` or `moment sync reject <spec> <id>...`.',
  );
  return lines.join('\n');
}
