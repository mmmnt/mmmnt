/**
 * moment lint — Cross-context diagnostic orchestrator (Design Principle #17)
 *
 * Collects diagnostics from multiple bounded contexts:
 * 1. Parse diagnostics (errors/warnings from MomentParser)
 * 2. Drift warnings (from ASTDiffEngine.detectDrift)
 * 3. Schema lifecycle warnings (deprecated fields from IR)
 *
 * Violations never block — only parse errors produce non-zero exit (EXIT-C3).
 * Each source is optional; unavailable sources produce empty results (EXIT-B5).
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolveRepoRoot } from '../lib/repo-root.js';
import { parseArgs } from 'node:util';
import { MomentParser } from '@mmmnt/core';
import { TypeScriptEmitter } from '@mmmnt/emit-ts';
import { ASTDiffEngine, LocalGitArtifactStore } from '@mmmnt/sync';
import type { Diagnostic, IntermediateRepresentation } from '@mmmnt/core';

interface LintIssue {
  readonly source: 'parse' | 'drift' | 'schema' | 'codex';
  readonly severity: 'error' | 'warning';
  readonly message: string;
}

export interface LintResult {
  readonly success: boolean;
  readonly message: string;
  readonly issues: readonly LintIssue[];
  readonly json?: string;
}

const EMPTY_ISSUES: readonly LintIssue[] = [];

function fail(message: string): LintResult {
  return { success: false, message, issues: EMPTY_ISSUES };
}

export async function runLint(argv: string[]): Promise<LintResult> {
  const { values, positionals } = parseArgs({
    args: argv,
    options: { json: { type: 'boolean' } },
    allowPositionals: true,
    strict: false,
  });

  const filePath = positionals[0];
  if (!filePath) return fail('Usage: moment lint <file.moment>');

  const resolvedPath = resolve(filePath);
  if (!existsSync(resolvedPath)) return fail(`Error: File not found: ${resolvedPath}`);

  let content: string;
  try {
    content = readFileSync(resolvedPath, 'utf-8');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return fail(`Error: Failed to read ${resolvedPath}: ${msg}`);
  }

  const parseResult = await new MomentParser().parseContent(content, resolvedPath);
  const issues: LintIssue[] = [];

  // Source 1: Parse diagnostics
  collectParseDiagnostics(parseResult.diagnostics, issues);

  if (!parseResult.success) {
    return buildResult(issues, true, values.json === true);
  }

  const ir = parseResult.ir!;

  // Source 2: Drift warnings (optional — may fail if not a git repo)
  await collectDriftWarnings(ir, resolvedPath, issues);

  // Source 3: Schema lifecycle warnings (events, commands, value objects)
  collectSchemaWarnings(ir, issues);

  return buildResult(issues, false, values.json === true);
}

function collectParseDiagnostics(diagnostics: readonly Diagnostic[], issues: LintIssue[]): void {
  for (const d of diagnostics) {
    issues.push({
      source: 'parse',
      severity: d.severity === 'error' ? 'error' : 'warning',
      message: d.message,
    });
  }
}

async function collectDriftWarnings(
  ir: IntermediateRepresentation,
  resolvedPath: string,
  issues: LintIssue[],
): Promise<void> {
  try {
    const tsOutput = new TypeScriptEmitter().emit(ir, { scope: { level: 'system' } });
    const repoRoot = resolveRepoRoot(resolvedPath);
    const store = new LocalGitArtifactStore(repoRoot);
    const actual = new Map<string, string>();

    for (const path of tsOutput.files.keys()) {
      try {
        actual.set(path, await store.readArtifact(path));
      } catch {
        // File not found — expected for new specs
      }
    }

    const report = new ASTDiffEngine().detectDrift({ expected: tsOutput.files, actual });
    if (report.totalDrifted > 0) {
      issues.push({
        source: 'drift',
        severity: 'warning',
        message: `${report.totalDrifted} file(s) drifted from specification`,
      });
    }
  } catch {
    // Drift detection unavailable (e.g., not a git repo) — skip silently (EXIT-B5)
  }
}

function collectDeprecatedFieldWarning(
  ownerName: string,
  field: {
    readonly name: string;
    readonly deprecated?: { readonly reason: string; readonly replacement: string };
  },
  issues: LintIssue[],
): void {
  if (!field.deprecated) return;
  issues.push({
    source: 'schema',
    severity: 'warning',
    message: `${ownerName}.${field.name} is deprecated: ${field.deprecated.reason} (use ${field.deprecated.replacement})`,
  });
}

function collectSchemaWarnings(ir: IntermediateRepresentation, issues: LintIssue[]): void {
  for (const ctx of ir.contexts) {
    for (const agg of ctx.aggregates) {
      for (const event of agg.events) {
        for (const field of event.fields) {
          collectDeprecatedFieldWarning(event.name, field, issues);
        }
      }
      for (const command of agg.commands) {
        for (const input of command.inputs) {
          collectDeprecatedFieldWarning(command.name, input, issues);
        }
      }
      for (const vo of agg.valueObjects) {
        for (const field of vo.fields) {
          collectDeprecatedFieldWarning(vo.name, field, issues);
        }
      }
    }
  }
}

function buildResult(issues: LintIssue[], hasParseErrors: boolean, asJson: boolean): LintResult {
  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');

  if (asJson) {
    const json = JSON.stringify(
      { issues, errors: errors.length, warnings: warnings.length },
      null,
      2,
    );
    return { success: !hasParseErrors, message: json, issues, json };
  }

  if (issues.length === 0) {
    return { success: true, message: 'No issues found', issues };
  }

  const lines: string[] = [];
  for (const issue of issues) {
    const icon = issue.severity === 'error' ? '✗' : '⚠';
    lines.push(`  ${icon} [${issue.source}] ${issue.message}`);
  }
  lines.push('');
  lines.push(`${errors.length} error(s), ${warnings.length} warning(s)`);

  return { success: !hasParseErrors, message: lines.join('\n'), issues };
}
