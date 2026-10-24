/**
 * The accept / reject run shared by `moment sync accept` and `moment sync reject`
 * (ADR-039 §3–4). Every check passes before anything is appended; the run then
 * commits ONLY the .domain/ sync logs to the local repo. No push, no network.
 */

import { existsSync, realpathSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { parseArgs } from 'node:util';
import {
  IMPLEMENTATION_FEEDBACK_LOG,
  PUSH_FLOW_LOG,
  SYNC_STATE_LOG,
  commitPathsOnly,
  planDecision,
  resolveRepoIdentity,
} from '@mmmnt/sync';
import type {
  CommitPathsInput,
  DecisionKind,
  DecisionPlan,
  JsonlSyncLogStore,
  RepoIdentity,
  SyncLogs,
} from '@mmmnt/sync';
import type { Diagnostic } from '@mmmnt/core';
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
  store: JsonlSyncLogStore,
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

  store.append({ pushFlow: [plan.saga.committed(oid), plan.saga.complete()] });

  const verb = kind === 'accept' ? 'Accepted' : 'Rejected';
  return {
    success: true,
    message: [
      `${verb} ${ids.length} proposal(s) — committed ${oid.slice(0, 7)}:`,
      ...ids.map((id) => `  ${id}`),
    ].join('\n'),
    diagnostics: EMPTY,
    decided: ids,
    commitRef: oid,
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
  return commitDecision(kind, args.specPath, store, plan, identity, deps.commit ?? commitPathsOnly);
}
