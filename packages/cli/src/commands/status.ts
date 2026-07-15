/**
 * moment status — Unified project status dashboard (ADR-022 §2)
 *
 * Aggregates: parse validation, sync drift, schema lifecycle, upstream fingerprint.
 * 4 output modes: default, --verbose, --quiet, --json.
 * No network calls — reads local files only (Design Principle #15).
 * Exit code 0 if in sync, 1 if drift detected (EXIT-C2).
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { resolveRepoRoot } from '../lib/repo-root.js';
import { parseArgs } from 'node:util';
import { MomentParser } from '@mmmnt/core';
import { TypeScriptEmitter } from '@mmmnt/emit-ts';
import { ASTDiffEngine, LocalGitArtifactStore } from '@mmmnt/sync';
import type { Diagnostic, IntermediateRepresentation } from '@mmmnt/core';

interface StatusSection {
  readonly label: string;
  readonly state: 'ok' | 'drift' | 'warning' | 'error';
  readonly summary: string;
  readonly details?: readonly string[];
}

export interface StatusResult {
  readonly success: boolean;
  readonly hasDrift: boolean;
  readonly message: string;
  readonly sections: readonly StatusSection[];
  readonly json?: string;
}

function fail(message: string): StatusResult {
  return { success: false, hasDrift: false, message, sections: [] };
}

export async function runStatus(argv: string[]): Promise<StatusResult> {
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      verbose: { type: 'boolean' },
      quiet: { type: 'boolean' },
      json: { type: 'boolean' },
    },
    allowPositionals: true,
    strict: false,
  });

  const filePath = positionals[0];
  if (!filePath) return fail('Usage: moment status <file.moment>');

  const resolvedPath = resolve(filePath);
  if (!existsSync(resolvedPath)) return fail(`Error: File not found: ${resolvedPath}`);

  let content: string;
  try {
    content = readFileSync(resolvedPath, 'utf-8');
  } catch (err: unknown) {
    return fail(
      `Error: Failed to read ${resolvedPath}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const sections: StatusSection[] = [];

  const parseResult = await new MomentParser().parseContent(content, resolvedPath);
  sections.push(buildParseSection(parseResult));

  if (parseResult.success && parseResult.ir) {
    const driftSection = await buildDriftSection(parseResult.ir, resolvedPath);
    sections.push(driftSection);
    sections.push(buildSchemaSection(parseResult.ir));
  }

  sections.push(buildUpstreamSection(resolvedPath));

  const hasDrift = sections.some((s) => s.state === 'drift' || s.state === 'error');

  return formatOutput(sections, hasDrift, values);
}

function buildParseSection(parseResult: {
  success: boolean;
  diagnostics: readonly Diagnostic[];
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
  // Project root: nearest .manifest.yaml, else git root, else spec dir.
  // The working-tree-first artifact store works in non-git directories too.
  const repoRoot = resolveRepoRoot(resolvedPath);

  try {
    const tsOutput = new TypeScriptEmitter().emit(ir, { scope: { level: 'system' } });
    const store = new LocalGitArtifactStore(repoRoot);
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
  } catch {
    return {
      label: 'Implementation Sync',
      state: 'ok',
      summary: 'Not available (drift detection failed)',
    };
  }
}

function buildSchemaSection(ir: IntermediateRepresentation): StatusSection {
  let deprecatedCount = 0;
  for (const ctx of ir.contexts) {
    for (const agg of ctx.aggregates) {
      for (const evt of agg.events) {
        deprecatedCount += evt.fields.filter((f) => f.deprecated).length;
      }
      for (const cmd of agg.commands) {
        deprecatedCount += cmd.inputs.filter((f) => f.deprecated).length;
      }
      for (const vo of agg.valueObjects) {
        deprecatedCount += vo.fields.filter((f) => f.deprecated).length;
      }
    }
  }

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
  const projectDir = resolveRepoRoot(resolvedPath);
  const domainDir = join(projectDir, '.domain');
  const fpPath = join(projectDir, '.moment', '.upstream-fingerprint.json');

  if (!existsSync(domainDir)) {
    return { label: 'Upstream Source', state: 'ok', summary: 'No upstream source configured' };
  }

  if (!existsSync(fpPath)) {
    return {
      label: 'Upstream Source',
      state: 'drift',
      summary: '.domain/ exists but no fingerprint — run moment import --from-sift',
    };
  }

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

function formatOutput(
  sections: StatusSection[],
  hasDrift: boolean,
  values: { verbose?: boolean; quiet?: boolean; json?: boolean },
): StatusResult {
  if (values.json) {
    const json = JSON.stringify({ sections, hasDrift }, null, 2);
    return { success: true, hasDrift, message: json, sections, json };
  }

  if (values.quiet) {
    return { success: true, hasDrift, message: '', sections };
  }

  const lines: string[] = [];
  for (const s of sections) {
    const icon = s.state === 'ok' ? '✓' : s.state === 'warning' ? '⚠' : '✗';
    lines.push(`  ${icon} ${s.label}: ${s.summary}`);
    if (values.verbose && s.details) {
      for (const d of s.details) lines.push(`      ${d}`);
    }
  }

  if (!hasDrift) {
    lines.push('');
    lines.push('No drift detected.');
  }

  return { success: true, hasDrift, message: lines.join('\n'), sections };
}
