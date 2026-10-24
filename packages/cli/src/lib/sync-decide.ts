/**
 * The accept / reject run shared by `moment sync accept` and `moment sync reject`
 * (ADR-039 §3–4). Every check passes before anything is appended; the run then
 * commits ONLY the .domain/ sync logs to the local repo. No push, no network.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { parseArgs } from 'node:util';
import {
  IMPLEMENTATION_FEEDBACK_LOG,
  PUSH_FLOW_LOG,
  SYNC_STATE_LOG,
  commitPathsOnly,
  impliedSpecEdit,
  planDecision,
  resolveRepoIdentity,
} from '@mmmnt/sync';
import type {
  CommitPathsInput,
  DecisionKind,
  DecisionPlan,
  ImpliedSpecEdit,
  JsonlSyncLogStore,
  RepoIdentity,
  SyncLogs,
} from '@mmmnt/sync';
import type { Diagnostic } from '@mmmnt/core';
import { isDirectory, specificationFiles } from './load-specification.js';
import { domainDirOf, openSyncLogs } from './sync-logs.js';

export interface SyncDecisionResult {
  readonly success: boolean;
  readonly message: string;
  readonly diagnostics: readonly Diagnostic[];
  readonly filePath?: string;
  /** The proposal ids this run decided. */
  readonly decided: readonly string[];
  /** The local commit holding the decision. */
  readonly commitRef?: string;
  /** For each accepted proposal, the spec edit it implies — printed, never written. */
  readonly edits?: readonly ProposalEdit[];
}

export interface ProposalEdit extends ImpliedSpecEdit {
  readonly proposalId: string;
}

export interface SyncDecisionDeps {
  readonly commit?: (input: CommitPathsInput) => Promise<string>;
}

const EMPTY: readonly Diagnostic[] = [];

export const DECISION_USAGE: Record<DecisionKind, string> = {
  accept: 'Usage: moment sync accept <file.moment|dir> (<proposal-id>... | --all)',
  reject: 'Usage: moment sync reject <file.moment|dir> <proposal-id>... --reason "<why>"',
};

function fail(message: string): SyncDecisionResult {
  return { success: false, message, diagnostics: EMPTY, decided: [] };
}

interface DecisionArgs {
  readonly specPath: string;
  readonly ids: readonly string[];
  readonly all: boolean;
  readonly reason?: string;
}

function parseDecisionArgs(kind: DecisionKind, argv: string[]): DecisionArgs | string {
  const { values, positionals } = parseArgs({
    args: argv,
    options: { all: { type: 'boolean' }, reason: { type: 'string' } },
    allowPositionals: true,
    strict: false,
  });
  const [specPath, ...ids] = positionals;
  const all = kind === 'accept' && values.all === true;
  if (!specPath || all === ids.length > 0) return DECISION_USAGE[kind];
  if (kind === 'reject' && values.all === true) return DECISION_USAGE[kind];
  const reason = typeof values.reason === 'string' ? values.reason : undefined;
  if (kind === 'reject' && (reason ?? '').trim().length === 0) {
    return `Error: --reason is required: say why the proposal(s) are rejected\n${DECISION_USAGE[kind]}`;
  }
  return { specPath: resolve(specPath), ids, all, reason };
}

/** The three logs as `/`-separated paths from the repo root, those that exist. */
function logPaths(specPath: string, identity: RepoIdentity): string[] {
  const domainDir = join(realpathSync(join(domainDirOf(specPath), '..')), '.domain');
  return [SYNC_STATE_LOG, IMPLEMENTATION_FEEDBACK_LOG, PUSH_FLOW_LOG]
    .map((log) => join(domainDir, log))
    .filter((path) => existsSync(path))
    .map((path) => relative(identity.root, path).split(sep).join('/'));
}

/** sha256 of the spec text; for a model directory, of every file's text in path order. */
function specificationHash(specPath: string): string {
  const texts = specificationFiles(specPath).map((file) => readFileSync(file, 'utf-8'));
  const hashed = isDirectory(specPath) ? JSON.stringify(texts) : texts[0];
  return createHash('sha256').update(hashed).digest('hex');
}

/** SS-02 needs each cursor strictly after the last, even within one millisecond. */
function cursorTimestamp(logs: SyncLogs): string {
  const last = logs.syncState.getCursor();
  const now = Date.now();
  const previous = last ? Date.parse(last.timestamp) : Number.NEGATIVE_INFINITY;
  return new Date(Math.max(now, previous + 1)).toISOString();
}

/** The edit each accepted proposal implies, searched for in the spec file(s), paths relative to them. */
function impliedEdits(specPath: string, plan: DecisionPlan): ProposalEdit[] {
  const base = join(domainDirOf(specPath), '..');
  const files = new Map(
    specificationFiles(specPath).map((file) => [
      relative(base, file).split(sep).join('/'),
      readFileSync(file, 'utf-8'),
    ]),
  );
  return plan.proposals.map((proposal) => ({
    proposalId: proposal.proposalId,
    ...impliedSpecEdit(proposal, files),
  }));
}

function formatEdits(edits: readonly ProposalEdit[]): string[] {
  const lines = edits.length > 0 ? ['', 'Make these edits to the specification:'] : [];
  for (const { proposalId, symbol, edit, locations } of edits) {
    lines.push(`  ${proposalId}: ${edit}`);
    if (locations.length === 0) lines.push(`    \`${symbol}\` is declared in no .moment file`);
    for (const { file, line } of locations) lines.push(`    at ${file}:${line}`);
  }
  return lines;
}

function commitMessage(kind: DecisionKind, plan: DecisionPlan): string {
  const ids = plan.proposals.map((p) => p.proposalId);
  return `chore(sync): ${kind} ${ids.length} proposal(s)\n\n${ids.join('\n')}\n`;
}

function targetIds(logs: SyncLogs, args: DecisionArgs): readonly string[] {
  if (!args.all) return args.ids;
  return logs.syncState
    .getProposals()
    .filter((e) => e.status === 'pending')
    .map((e) => e.proposal.proposalId);
}

async function commitDecision(
  kind: DecisionKind,
  specPath: string,
  { store, logs }: { store: JsonlSyncLogStore; logs: SyncLogs },
  plan: DecisionPlan,
  identity: RepoIdentity,
  commit: (input: CommitPathsInput) => Promise<string>,
): Promise<SyncDecisionResult> {
  const ids = plan.proposals.map((p) => p.proposalId);
  let oid: string;
  try {
    oid = await commit({
      root: identity.root,
      paths: logPaths(specPath, identity),
      message: commitMessage(kind, plan),
      author: { name: identity.name, email: identity.email },
    });
  } catch (err: unknown) {
    const reason = err instanceof Error ? err.message : String(err);
    store.append({ pushFlow: [plan.saga.abort(`local commit failed: ${reason}`)] });
    return {
      ...fail(
        `Error: the ${kind} decision(s) are recorded in ${domainDirOf(specPath)}, but the local ` +
          `commit failed: ${reason}. The push-flow saga is aborted and the sync cursor did not move.`,
      ),
      decided: ids,
    };
  }

  // The cursor moves only once the decision is committed, so it needs a commit of
  // its own; the saga's Committed and Complete records ride in that one too.
  const cursor = logs.syncState.advanceCursor({
    specificationHash: specificationHash(specPath),
    timestamp: cursorTimestamp(logs),
    lastProcessedFile: relative(identity.root, realpathSync(specPath)).split(sep).join('/'),
  });
  store.append({
    syncState: [cursor],
    pushFlow: [plan.saga.committed(oid), plan.saga.complete()],
  });
  try {
    await commit({
      root: identity.root,
      paths: logPaths(specPath, identity),
      message: `chore(sync): advance the sync cursor\n\nafter ${oid}\n`,
      author: { name: identity.name, email: identity.email },
    });
  } catch (err: unknown) {
    const reason = err instanceof Error ? err.message : String(err);
    return {
      ...fail(
        `Error: the ${kind} decision(s) are committed as ${oid}, but committing the advanced ` +
          `sync cursor failed: ${reason}. Commit ${domainDirOf(specPath)} yourself.`,
      ),
      decided: ids,
      commitRef: oid,
    };
  }

  const verb = kind === 'accept' ? 'Accepted' : 'Rejected';
  const edits = kind === 'accept' ? impliedEdits(specPath, plan) : [];
  return {
    success: true,
    message: [
      `${verb} ${ids.length} proposal(s) — committed ${oid.slice(0, 7)}:`,
      ...ids.map((id) => `  ${id}`),
      ...formatEdits(edits),
    ].join('\n'),
    diagnostics: EMPTY,
    decided: ids,
    commitRef: oid,
    edits,
  };
}

export async function runSyncDecision(
  kind: DecisionKind,
  argv: string[],
  deps: SyncDecisionDeps = {},
): Promise<SyncDecisionResult> {
  const args = parseDecisionArgs(kind, argv);
  if (typeof args === 'string') return fail(args);
  if (!existsSync(args.specPath)) return fail(`Error: File not found: ${args.specPath}`);

  const opened = openSyncLogs(args.specPath);
  if (typeof opened === 'string') return fail(opened);
  const { store, logs } = opened;

  const ids = targetIds(logs, args);
  if (ids.length === 0) {
    return {
      success: true,
      message: `No pending proposals to ${kind}.`,
      diagnostics: EMPTY,
      decided: [],
    };
  }

  const identity = await resolveRepoIdentity(join(domainDirOf(args.specPath), '..'));
  if (typeof identity === 'string') return fail(identity);

  const plan = planDecision(logs, {
    kind,
    proposalIds: ids,
    actor: identity.email,
    reason: args.reason,
    commitRef: identity.head,
  });
  if ('refused' in plan) return fail(`Error: nothing was recorded — ${plan.refused}`);

  store.append(plan);
  return commitDecision(
    kind,
    args.specPath,
    opened,
    plan,
    identity,
    deps.commit ?? commitPathsOnly,
  );
}
