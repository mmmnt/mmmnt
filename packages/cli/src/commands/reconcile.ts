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

  const filePath = positionals[0];
  if (!filePath) return fail('Usage: moment reconcile [--local | --event <cascade.json>] <file.moment>');

  if (!values.local && !values.event) return fail('Error: specify --local or --event <path>');

  const resolvedPath = resolve(filePath);
  if (!existsSync(resolvedPath)) return fail(`Error: File not found: ${resolvedPath}`);

  // Parse spec first — both modes need a valid spec
  let content: string;
  try { content = readFileSync(resolvedPath, 'utf-8'); } catch (err: unknown) {
    return fail(`Error: Failed to read ${resolvedPath}: ${err instanceof Error ? err.message : String(err)}`);
  }

  const parseResult = await new MomentParser().parseContent(content);
  if (!parseResult.success) return fail('Error: Spec has parse errors — fix before reconciling');

  const ir = parseResult.ir!;

  if (values.event) {
    return reconcileFromEvent(ir, resolvedPath, values.event, values.json === true);
  }

  return reconcileLocal(ir, resolvedPath, values.json === true);
}

function reconcileLocal(ir: IntermediateRepresentation, specPath: string, asJson: boolean): ReconcileResult {
  const projectDir = dirname(specPath);
  const domainDir = join(projectDir, '.domain');

  if (!existsSync(domainDir)) {
    return { success: true, outcome: 'NO_CHANGES', message: 'No upstream source configured — nothing to reconcile' };
  }

  // Detect drift
  const category = classifyDrift(ir, specPath);
  const outcome = categoryToOutcome(category);

  // Write event signal
  writeReconcileEvent(projectDir, outcome, category);

  // Update fingerprint if not breaking
  if (category !== 3) {
    updateFingerprint(domainDir, projectDir);
  }

  return buildResult(outcome, category, asJson);
}

function reconcileFromEvent(ir: IntermediateRepresentation, specPath: string, eventPath: string, asJson: boolean): ReconcileResult {
  const resolvedEventPath = resolve(eventPath);
  if (!existsSync(resolvedEventPath)) return fail(`Error: Event file not found: ${resolvedEventPath}`);

  let eventPayload: { affectedElements?: string[] };
  try {
    eventPayload = JSON.parse(readFileSync(resolvedEventPath, 'utf-8'));
  } catch {
    return fail('Error: Invalid JSON in cascade event file');
  }

  const projectDir = dirname(specPath);

  // Classify based on affected elements
  const elements = eventPayload.affectedElements ?? [];
  const category = classifyAffectedElements(ir, elements);
  const outcome = categoryToOutcome(category);

  writeReconcileEvent(projectDir, outcome, category);

  return buildResult(outcome, category, asJson);
}

function classifyDrift(ir: IntermediateRepresentation, specPath: string): CascadeCategory {
  try {
    const domainDir = join(dirname(specPath), '.domain');
    const reader = new SiftEventStreamReader();
    const readResult = reader.read(domainDir);

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

function classifyAffectedElements(ir: IntermediateRepresentation, elements: string[]): CascadeCategory {
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

  let maxCategory: CascadeCategory = 1;
  for (const el of elements) {
    if (!knownNames.has(el)) {
      // Element not referenced locally → could be new (Cat 2) or renamed (Cat 3)
      maxCategory = Math.max(maxCategory, 2) as CascadeCategory;
    }
  }

  return maxCategory;
}

function categoryToOutcome(category: CascadeCategory): ReconcileOutcome {
  if (category === 3) return 'BREAKING';
  if (category === 2) return 'DRIFT';
  return 'APPLIED';
}

function writeReconcileEvent(projectDir: string, outcome: ReconcileOutcome, category: CascadeCategory): void {
  const eventDir = join(projectDir, '.complai', 'events', 'moment');
  mkdirSync(eventDir, { recursive: true });

  const event = {
    eventId: `evt-reconcile-${Date.now()}`,
    eventType: 'MomentReconcileCompleted',
    version: 1,
    productSource: 'moment',
    sessionId: `ses_local_cli`,
    causationEventIds: [],
    correlationId: `corr-reconcile-${Date.now()}`,
    timestamp: new Date().toISOString(),
    payload: {
      reconcileResult: outcome,
      cascadeCategory: category,
    },
  };

  const fileName = new Date().toISOString().replace(/[:.]/g, '-') + '.jsonl';
  writeFileSync(join(eventDir, fileName), JSON.stringify(event) + '\n');
}

function updateFingerprint(domainDir: string, projectDir: string): void {
  const fpDir = join(projectDir, '.moment');
  const fpPath = join(fpDir, '.upstream-fingerprint.json');

  const hash = createHash('sha256');
  const { readdirSync } = require('node:fs') as typeof import('node:fs');
  const files = readdirSync(domainDir).filter((f: string) => f.endsWith('.jsonl')).sort();
  for (const file of files) {
    hash.update(readFileSync(join(domainDir, file), 'utf-8'));
  }

  const fingerprint = {
    sift: {
      specificationId: 'reconciled',
      contentHash: hash.digest('hex'),
      importedAt: new Date().toISOString(),
      boundedContextCount: files.length,
    },
  };

  mkdirSync(fpDir, { recursive: true });
  writeFileSync(fpPath, JSON.stringify(fingerprint, null, 2));
}

function findGitRoot(startDir: string): string | undefined {
  let dir = resolve(startDir);
  while (dir !== dirname(dir)) {
    if (existsSync(join(dir, '.git'))) return dir;
    dir = dirname(dir);
  }
  return undefined;
}

function buildResult(outcome: ReconcileOutcome, category: CascadeCategory, asJson: boolean): ReconcileResult {
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
