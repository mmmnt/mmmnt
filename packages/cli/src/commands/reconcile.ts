/**
 * moment reconcile — Cascade reconciliation engine (ADR-022 §3)
 *
 * Two modes:
 * --local (Pattern C, free tier): local diff classification against .domain/
 * --event <path> (Pattern A, paid tier CI): CascadeRequired event-scoped classification
 *
 * Exit codes per ADR-022 §3:
 *   0 + APPLIED  — Category 1 only (deterministic updates applied)
 *   0 + DRIFT    — Category 2 present (diagnostic report, no file changes)
 *   1 + BREAKING — Category 3 present (breaking change report)
 *
 * Multi-category: highest wins (PADR-009 §2.7).
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { createHash } from 'node:crypto';
import { MomentParser } from '@mmmnt/core';
import { SiftEventStreamReader } from '@mmmnt/sync';
import type { IntermediateRepresentation } from '@mmmnt/core';
import type { CascadeCategory } from '@mmmnt/sync';

type ReconcileOutcome = 'APPLIED' | 'DRIFT' | 'BREAKING';

export interface ReconcileResult {
  readonly success: boolean;
  readonly outcome: ReconcileOutcome | 'NO_CHANGES' | 'ERROR';
  readonly message: string;
  readonly category?: CascadeCategory;
  readonly json?: string;
}

function fail(message: string): ReconcileResult {
  return { success: false, outcome: 'ERROR', message };
}

export async function runReconcile(argv: string[]): Promise<ReconcileResult> {
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      local: { type: 'boolean' },
      event: { type: 'string' },
      json: { type: 'boolean' },
    },
    allowPositionals: true,
    strict: false,
  });

  const validation = validateArgs(values, positionals);
  if (validation) return validation;

  const resolvedPath = resolve(positionals[0]);
  const parsed = await parseSpec(resolvedPath);
  if (!('ir' in parsed)) return parsed;

  const asJson = values.json === true;

  if (values.event) {
    return reconcileFromEvent(parsed.ir, resolvedPath, values.event, asJson);
  }
  return reconcileLocal(parsed.ir, resolvedPath, asJson);
}

function validateArgs(
  values: { local?: boolean; event?: string },
  positionals: string[],
): ReconcileResult | null {
  if (!positionals[0])
    return fail('Usage: moment reconcile [--local | --event <cascade.json>] <file.moment>');
  if (!values.local && !values.event) return fail('Error: specify --local or --event <path>');
  if (values.local && values.event)
    return fail('Error: --local and --event are mutually exclusive');
  return null;
}

async function parseSpec(
  resolvedPath: string,
): Promise<ReconcileResult | { ir: IntermediateRepresentation }> {
  if (!existsSync(resolvedPath)) return fail(`Error: File not found: ${resolvedPath}`);

  let content: string;
  try {
    content = readFileSync(resolvedPath, 'utf-8');
  } catch (err: unknown) {
    return fail(
      `Error: Failed to read ${resolvedPath}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const parseResult = await new MomentParser().parseContent(content, resolvedPath);
  if (!parseResult.success) return fail('Error: Spec has parse errors — fix before reconciling');

  return { ir: parseResult.ir! };
}

function reconcileLocal(
  ir: IntermediateRepresentation,
  specPath: string,
  asJson: boolean,
): ReconcileResult {
  const projectDir = dirname(specPath);
  const domainDir = join(projectDir, '.domain');

  if (!existsSync(domainDir)) {
    return buildNoChangesResult(asJson);
  }

  const category = classifyDrift(ir, specPath);
  const outcome = categoryToOutcome(category);

  writeReconcileEvent(projectDir, outcome, category);

  // Only update fingerprint for Category 1 (APPLIED)
  // Category 2 (DRIFT) is diagnostic-only — no file changes
  if (category === 1) {
    updateFingerprint(domainDir, projectDir);
  }

  return buildResult(outcome, category, asJson);
}

function reconcileFromEvent(
  ir: IntermediateRepresentation,
  specPath: string,
  eventPath: string,
  asJson: boolean,
): ReconcileResult {
  const resolvedEventPath = resolve(eventPath);
  if (!existsSync(resolvedEventPath))
    return fail(`Error: Event file not found: ${resolvedEventPath}`);

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(resolvedEventPath, 'utf-8'));
  } catch {
    return fail('Error: Invalid JSON in cascade event file');
  }

  if (typeof raw !== 'object' || raw === null)
    return fail('Error: Cascade event must be a JSON object');

  const eventPayload = raw as Record<string, unknown>;
  const elements = validateAffectedElements(eventPayload.affectedElements);
  if (typeof elements === 'string') return fail(elements);

  const projectDir = dirname(specPath);
  const category = classifyAffectedElements(ir, elements);
  const outcome = categoryToOutcome(category);

  writeReconcileEvent(projectDir, outcome, category);

  return buildResult(outcome, category, asJson);
}

function validateAffectedElements(value: unknown): string[] | string {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return 'Error: affectedElements must be an array';
  if (!value.every((v) => typeof v === 'string'))
    return 'Error: affectedElements must contain only strings';
  return value as string[];
}

function classifyDrift(ir: IntermediateRepresentation, specPath: string): CascadeCategory {
  try {
    const domainDir = join(dirname(specPath), '.domain');
    const reader = new SiftEventStreamReader();
    const readResult = reader.read(domainDir);

    // Broken upstream → treat as drift, not APPLIED
    if (readResult.eventsProcessed === 0 && readResult.errors.length > 0) return 2;
    if (readResult.eventsProcessed === 0) return 1;

    const upstreamContexts = new Set(readResult.input.buildingBlocks.map((b) => b.contextName));
    const localContexts = new Set(ir.contexts.map((c) => c.name));

    // Local contexts not in upstream → breaking (dangling reference)
    for (const ctx of localContexts) {
      if (!upstreamContexts.has(ctx)) return 3;
    }

    // New upstream contexts not in local → drift
    for (const ctx of upstreamContexts) {
      if (!localContexts.has(ctx)) return 2;
    }

    return 1;
  } catch {
    return 2;
  }
}

function classifyAffectedElements(
  ir: IntermediateRepresentation,
  elements: string[],
): CascadeCategory {
  if (elements.length === 0) return 1;

  const knownNames = new Set<string>();
  for (const ctx of ir.contexts) {
    knownNames.add(ctx.name);
    for (const agg of ctx.aggregates) {
      knownNames.add(agg.name);
      for (const evt of agg.events) knownNames.add(evt.name);
      for (const cmd of agg.commands) knownNames.add(cmd.name);
    }
  }

  for (const el of elements) {
    if (!knownNames.has(el)) {
      // Element not referenced locally → drift (Cat 2)
      // Breaking/rename detection requires change metadata not available here
      return 2;
    }
  }

  return 1;
}

function categoryToOutcome(category: CascadeCategory): ReconcileOutcome {
  if (category === 3) return 'BREAKING';
  if (category === 2) return 'DRIFT';
  return 'APPLIED';
}

function writeReconcileEvent(
  projectDir: string,
  outcome: ReconcileOutcome,
  category: CascadeCategory,
): void {
  const eventDir = join(projectDir, '.complai', 'events', 'moment');
  mkdirSync(eventDir, { recursive: true });

  const event = {
    eventId: `evt-reconcile-${Date.now()}`,
    eventType: 'MomentReconcileCompleted',
    version: 1,
    productSource: 'moment',
    sessionId: 'ses_local_cli',
    causationEventIds: [],
    correlationId: `corr-reconcile-${Date.now()}`,
    timestamp: new Date().toISOString(),
    payload: { reconcileResult: outcome, cascadeCategory: category },
  };

  const fileName = new Date().toISOString().replace(/[:.]/g, '-') + '.jsonl';
  writeFileSync(join(eventDir, fileName), JSON.stringify(event) + '\n');
}

function updateFingerprint(domainDir: string, projectDir: string): void {
  const fpDir = join(projectDir, '.moment');
  const fpPath = join(fpDir, '.upstream-fingerprint.json');

  const hash = createHash('sha256');
  const { readdirSync } = require('node:fs') as typeof import('node:fs');
  const files = readdirSync(domainDir)
    .filter((f: string) => f.endsWith('.jsonl'))
    .sort();
  for (const file of files) {
    hash.update(readFileSync(join(domainDir, file), 'utf-8'));
  }
  const contentHash = hash.digest('hex');

  // Idempotent: skip write if content unchanged
  if (existsSync(fpPath)) {
    try {
      const existing = JSON.parse(readFileSync(fpPath, 'utf-8')) as {
        sift?: { contentHash?: string };
      };
      if (existing.sift?.contentHash === contentHash) return;
    } catch {
      /* overwrite */
    }
  }

  const fingerprint = {
    sift: {
      specificationId: 'reconciled',
      contentHash,
      importedAt: new Date().toISOString(),
      boundedContextCount: files.length,
    },
  };

  mkdirSync(fpDir, { recursive: true });
  writeFileSync(fpPath, JSON.stringify(fingerprint, null, 2));
}

function buildNoChangesResult(asJson: boolean): ReconcileResult {
  const msg = 'No upstream source configured — nothing to reconcile';
  if (asJson) {
    const json = JSON.stringify({ outcome: 'NO_CHANGES', success: true }, null, 2);
    return { success: true, outcome: 'NO_CHANGES', message: json, json };
  }
  return { success: true, outcome: 'NO_CHANGES', message: msg };
}

function buildResult(
  outcome: ReconcileOutcome,
  category: CascadeCategory,
  asJson: boolean,
): ReconcileResult {
  const messages: Record<ReconcileOutcome, string> = {
    APPLIED: 'APPLIED — Category 1: deterministic updates applied',
    DRIFT: 'DRIFT — Category 2: structural drift detected, review required',
    BREAKING: 'BREAKING — Category 3: breaking changes detected, manual resolution required',
  };

  const success = outcome !== 'BREAKING';

  if (asJson) {
    const json = JSON.stringify({ outcome, category, success }, null, 2);
    return { success, outcome, category, message: json, json };
  }

  return { success, outcome, category, message: messages[outcome] };
}
