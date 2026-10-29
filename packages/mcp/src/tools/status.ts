/**
 * moment_status — Get unified project status for a .moment specification.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { MomentParser } from '@mmmnt/core';
import { TypeScriptEmitter } from '@mmmnt/emit-ts';
import { ASTDiffEngine, LocalGitArtifactStore } from '@mmmnt/sync';
import { readMomentFile, okResult, wrapTool } from './shared.js';
import type { IntermediateRepresentation } from '@mmmnt/core';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

interface StatusParams {
  filePath: string;
}

interface StatusSection {
  readonly label: string;
  readonly state: 'ok' | 'drift' | 'warning' | 'error';
  readonly summary: string;
  readonly details?: readonly string[];
}

async function statusImpl(params: StatusParams): Promise<CallToolResult> {
  const resolvedPath = resolve(params.filePath);
  const content = readMomentFile(params.filePath);
  const sections: StatusSection[] = [];

  const parseResult = await new MomentParser().parseContent(content);
  sections.push(buildParseSection(parseResult));

  if (parseResult.success && parseResult.ir) {
    sections.push(await buildDriftSection(parseResult.ir, resolvedPath));
    sections.push(buildSchemaSection(parseResult.ir));
  }

  sections.push(buildUpstreamSection(resolvedPath));

  const hasDrift = sections.some((s) => s.state === 'drift' || s.state === 'error');
  return okResult({ success: true, hasDrift, sections });
}

function buildParseSection(parseResult: {
  success: boolean;
  diagnostics: readonly { severity: string; message: string }[];
}): StatusSection {
  if (parseResult.success) {
    return { label: 'Specification', state: 'ok', summary: 'Valid — no parse errors' };
  }
  const errors = parseResult.diagnostics.filter((d) => d.severity === 'error');
  return {
    label: 'Specification',
    state: 'error',
    summary: `${errors.length} parse error(s)`,
    details: errors.map((d) => d.message),
  };
}

async function buildDriftSection(
  ir: IntermediateRepresentation,
  resolvedPath: string,
): Promise<StatusSection> {
  const gitRoot = findGitRoot(dirname(resolvedPath));
  if (!gitRoot) {
    return {
      label: 'Implementation Sync',
      state: 'ok',
      summary: 'Not available (no git repository)',
    };
  }

  try {
    return await detectDrift(ir, gitRoot);
  } catch {
    return {
      label: 'Implementation Sync',
      state: 'ok',
      summary: 'Not available (drift detection failed)',
    };
  }
}

async function detectDrift(
  ir: IntermediateRepresentation,
  gitRoot: string,
): Promise<StatusSection> {
  const tsOutput = new TypeScriptEmitter().emit(ir, { scope: { level: 'system' } });
  const store = new LocalGitArtifactStore(gitRoot);
  const actual = new Map<string, string>();

  for (const path of tsOutput.files.keys()) {
    try {
      actual.set(path, await store.readArtifact(path));
    } catch {
      /* not found */
    }
  }

  const report = new ASTDiffEngine().detectDrift({ expected: tsOutput.files, actual });
  if (report.totalDrifted === 0) {
    return {
      label: 'Implementation Sync',
      state: 'ok',
      summary: `${report.totalAligned} file(s) aligned`,
    };
  }
  return {
    label: 'Implementation Sync',
    state: 'drift',
    summary: `${report.totalDrifted} file(s) drifted, ${report.totalAligned} aligned`,
  };
}

const deprecated = (fields: readonly { deprecated?: unknown }[]): number =>
  fields.filter((f) => f.deprecated).length;

function deprecatedInContext(ctx: IntermediateRepresentation['contexts'][number]): number {
  const write = ctx.aggregates.reduce(
    (n, agg) =>
      n +
      agg.events.reduce((m, e) => m + deprecated(e.fields), 0) +
      agg.commands.reduce((m, c) => m + deprecated(c.inputs), 0),
    0,
  );
  // ctx.valueObjects holds the aggregates' value objects and the context's own (ADR-037 §4).
  const valueObjects = ctx.valueObjects.reduce((n, vo) => n + deprecated(vo.fields), 0);
  const projections = (ctx.projections ?? []).reduce((n, p) => n + deprecated(p.fields), 0);
  const queries = (ctx.queries ?? []).reduce((n, q) => n + deprecated(q.inputs), 0);
  return write + valueObjects + projections + queries;
}

function buildSchemaSection(ir: IntermediateRepresentation): StatusSection {
  const deprecatedCount = ir.contexts.reduce((n, ctx) => n + deprecatedInContext(ctx), 0);

  if (deprecatedCount === 0) {
    return { label: 'Schema Lifecycle', state: 'ok', summary: 'All fields active' };
  }
  return {
    label: 'Schema Lifecycle',
    state: 'warning',
    summary: `${deprecatedCount} deprecated field(s)`,
  };
}

function buildUpstreamSection(resolvedPath: string): StatusSection {
  const projectDir = dirname(resolvedPath);
  const domainDir = join(projectDir, '.domain');
  const fpPath = join(projectDir, '.moment', '.upstream-fingerprint.json');

  if (!existsSync(domainDir)) {
    return { label: 'Upstream Source', state: 'ok', summary: 'No upstream source configured' };
  }
  if (!existsSync(fpPath)) {
    return {
      label: 'Upstream Source',
      state: 'drift',
      summary: '.domain/ exists but no fingerprint',
    };
  }

  return readFingerprint(fpPath);
}

function readFingerprint(fpPath: string): StatusSection {
  try {
    const fp = JSON.parse(readFileSync(fpPath, 'utf-8'));
    const sift = fp.sift ?? fp;
    return {
      label: 'Upstream Source',
      state: 'ok',
      summary: `Last import: ${sift.importedAt ?? 'unknown'} (${sift.boundedContextCount ?? '?'} contexts)`,
    };
  } catch {
    return { label: 'Upstream Source', state: 'warning', summary: 'Fingerprint unreadable' };
  }
}

function findGitRoot(startDir: string): string | undefined {
  let dir = resolve(startDir);
  while (dir !== dirname(dir)) {
    if (existsSync(join(dir, '.git'))) return dir;
    dir = dirname(dir);
  }
  return undefined;
}

export const status = wrapTool(statusImpl);
