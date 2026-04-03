/**
 * moment_reconcile — Run cascade reconciliation against a .moment specification.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { MomentParser } from '@mmmnt/core';
import { SiftEventStreamReader } from '@mmmnt/sync';
import { readMomentFile, okResult, errorResult, wrapTool } from './shared.js';
import type { IntermediateRepresentation } from '@mmmnt/core';
import type { CascadeCategory } from '@mmmnt/sync';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

interface ReconcileParams {
  filePath: string;
  mode?: 'local' | 'event';
  eventPath?: string;
}

type ReconcileOutcome = 'APPLIED' | 'DRIFT' | 'BREAKING' | 'NO_CHANGES';

function categoryToOutcome(category: CascadeCategory): ReconcileOutcome {
  if (category === 3) return 'BREAKING';
  if (category === 2) return 'DRIFT';
  return 'APPLIED';
}

function classifyLocalDrift(ir: IntermediateRepresentation, specPath: string): CascadeCategory {
  const domainDir = join(dirname(specPath), '.domain');
  const reader = new SiftEventStreamReader();
  const readResult = reader.read(domainDir);

  if (readResult.eventsProcessed === 0 && readResult.errors.length > 0) return 2;
  if (readResult.eventsProcessed === 0) return 1;

  const upstreamContexts = new Set(readResult.input.buildingBlocks.map((b) => b.contextName));
  const localContexts = new Set(ir.contexts.map((c) => c.name));

  for (const ctx of localContexts) {
    if (!upstreamContexts.has(ctx)) return 3;
  }
  for (const ctx of upstreamContexts) {
    if (!localContexts.has(ctx)) return 2;
  }

  return 1;
}

function classifyFromEvent(ir: IntermediateRepresentation, elements: string[]): CascadeCategory {
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
    if (!knownNames.has(el)) return 2;
  }

  return 1;
}

function writeReconcileEvent(projectDir: string, outcome: ReconcileOutcome, category: CascadeCategory): void {
  const eventDir = join(projectDir, '.complai', 'events', 'moment');
  mkdirSync(eventDir, { recursive: true });

  const event = {
    eventId: `evt-reconcile-${Date.now()}`,
    eventType: 'MomentReconcileCompleted',
    version: 1,
    productSource: 'moment',
    sessionId: 'ses_mcp',
    causationEventIds: [],
    correlationId: `corr-reconcile-${Date.now()}`,
    timestamp: new Date().toISOString(),
    payload: { reconcileResult: outcome, cascadeCategory: category },
  };

  const fileName = new Date().toISOString().replace(/[:.]/g, '-') + '.jsonl';
  writeFileSync(join(eventDir, fileName), JSON.stringify(event) + '\n');
}

function reconcileLocal(ir: IntermediateRepresentation, specPath: string): CallToolResult {
  const projectDir = dirname(specPath);
  const domainDir = join(projectDir, '.domain');

  if (!existsSync(domainDir)) {
    return okResult({ success: true, outcome: 'NO_CHANGES', message: 'No upstream source configured' });
  }

  const category = classifyLocalDrift(ir, specPath);
  const outcome = categoryToOutcome(category);
  writeReconcileEvent(projectDir, outcome, category);

  return okResult({ success: outcome !== 'BREAKING', outcome, category, message: `${outcome} — Category ${category}` });
}

function reconcileFromEvent(ir: IntermediateRepresentation, specPath: string, eventPath: string): CallToolResult {
  const resolvedEventPath = resolve(eventPath);
  if (!existsSync(resolvedEventPath)) {
    return errorResult('EVENT_NOT_FOUND', `Event file not found: ${resolvedEventPath}`);
  }

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(resolvedEventPath, 'utf-8'));
  } catch {
    return errorResult('INVALID_EVENT', 'Invalid JSON in cascade event file');
  }

  const payload = raw as Record<string, unknown>;
  const elements = Array.isArray(payload.affectedElements) ? (payload.affectedElements as string[]) : [];

  const projectDir = dirname(specPath);
  const category = classifyFromEvent(ir, elements);
  const outcome = categoryToOutcome(category);
  writeReconcileEvent(projectDir, outcome, category);

  return okResult({ success: outcome !== 'BREAKING', outcome, category, message: `${outcome} — Category ${category}` });
}

async function reconcileImpl(params: ReconcileParams): Promise<CallToolResult> {
  const resolvedPath = resolve(params.filePath);
  const content = readMomentFile(params.filePath);
  const parseResult = await new MomentParser().parseContent(content);

  if (!parseResult.success) {
    return errorResult('PARSE_FAILED', 'Spec has parse errors — fix before reconciling');
  }

  const ir = parseResult.ir!;
  const mode = params.mode ?? 'local';

  if (mode === 'event') {
    if (!params.eventPath) {
      return errorResult('MISSING_EVENT_PATH', 'eventPath is required when mode is "event"');
    }
    return reconcileFromEvent(ir, resolvedPath, params.eventPath);
  }

  return reconcileLocal(ir, resolvedPath);
}

export const reconcile = wrapTool(reconcileImpl);
