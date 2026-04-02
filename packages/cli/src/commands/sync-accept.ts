/**
 * moment sync accept — Accept implementation change proposals by ID
 *
 * Delegates to SyncState.acceptProposal() — no state logic in CLI (EXIT-C1).
 * Cursor advancement is atomic per SS-02.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { MomentParser } from '@mmmnt/core';
import { TypeScriptEmitter } from '@mmmnt/emit-ts';
import {
  ASTDiffEngine,
  LocalGitArtifactStore,
  SyncState,
} from '@mmmnt/sync';
import type { Diagnostic, IntermediateRepresentation } from '@mmmnt/core';
import type { ImplementationChangeProposal } from '@mmmnt/sync';

export interface SyncAcceptResult {
  readonly success: boolean;
  readonly message: string;
  readonly diagnostics: readonly Diagnostic[];
  readonly filePath?: string;
  readonly acceptedCount: number;
  readonly json?: string;
}

const EMPTY: readonly Diagnostic[] = [];

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
  if (!filePath) return fail('Usage: moment sync accept [--all | <proposal-id>...] <file.moment>');

  const parsed = await parseSpecFile(filePath);
  if ('success' in parsed && !parsed.success) return parsed as SyncAcceptResult;

  const { ir, resolvedPath } = parsed as { ir: ReturnType<typeof Object>; resolvedPath: string };

  const proposals = await generateProposals(ir, resolvedPath);

  if (proposals.length === 0) {
    return { success: true, message: 'No pending proposals to accept', diagnostics: EMPTY, acceptedCount: 0 };
  }

  return executeAccept(proposals, values.all === true, positionals.slice(1), values.json === true);
}

function executeAccept(
  proposals: ImplementationChangeProposal[],
  acceptAll: boolean,
  proposalIds: string[],
  asJson: boolean,
): SyncAcceptResult {
  const syncState = new SyncState();
  for (const p of proposals) {
    syncState.recordProposal(p);
  }

  if (!acceptAll && proposalIds.length === 0) {
    return fail('Usage: moment sync accept [--all | <proposal-id>...] <file.moment>');
  }

  const result = acceptAll
    ? acceptAllProposals(syncState, proposals.map((p) => p.proposalId))
    : acceptByIds(syncState, proposalIds, proposals.map((p) => p.proposalId));

  if (!result.success || !asJson) return result;

  const json = JSON.stringify({ accepted: result.acceptedCount }, null, 2);
  return { ...result, message: json, json };
}

async function parseSpecFile(filePath: string): Promise<SyncAcceptResult | { ir: IntermediateRepresentation; resolvedPath: string }> {
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
      acceptedCount: 0,
    };
  }

  return { ir: parseResult.ir!, resolvedPath };
}

async function generateProposals(ir: IntermediateRepresentation, resolvedPath: string): Promise<ImplementationChangeProposal[]> {
  const tsOutput = new TypeScriptEmitter().emit(ir, { scope: { level: 'system' } });
  const repoRoot = dirname(resolvedPath);
  const store = new LocalGitArtifactStore(repoRoot);
  const actual = await readActualFiles(store, [...tsOutput.files.keys()]);

  return new ASTDiffEngine().generateProposals({ expected: tsOutput.files, actual });
}

function acceptAllProposals(
  syncState: SyncState,
  allIds: string[],
): SyncAcceptResult {
  for (const id of allIds) {
    syncState.acceptProposal(id);
  }
  return {
    success: true,
    message: `Accepted ${allIds.length} proposal(s)`,
    diagnostics: EMPTY,
    acceptedCount: allIds.length,
  };
}

function acceptByIds(
  syncState: SyncState,
  requestedIds: string[],
  validIds: string[],
): SyncAcceptResult {
  const validSet = new Set(validIds);
  const invalid = requestedIds.filter((id) => !validSet.has(id));

  if (invalid.length > 0) {
    return fail(`Error: Unknown proposal ID(s): ${invalid.join(', ')}`);
  }

  for (const id of requestedIds) {
    syncState.acceptProposal(id);
  }

  return {
    success: true,
    message: `Accepted ${requestedIds.length} proposal(s)`,
    diagnostics: EMPTY,
    acceptedCount: requestedIds.length,
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
      const msg = err instanceof Error ? err.message : '';
      if (msg.startsWith('Artifact not found')) continue;
      throw err;
    }
  }
  return actual;
}
