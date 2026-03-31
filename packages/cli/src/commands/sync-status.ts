/**
 * moment sync status — Show drift report between spec and implementation
 *
 * Pipeline: parse → emit-ts (expected) + read actual from disk → ASTDiffEngine.detectDrift()
 * Delegates to ASTDiffEngine — no diff logic in CLI layer (EXIT-C1).
 * Type-level only (IS-02).
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { MomentParser } from '@mmmnt/core';
import { TypeScriptEmitter } from '@mmmnt/emit-ts';
import { ASTDiffEngine } from '@mmmnt/sync';
import type { Diagnostic } from '@mmmnt/core';
import type { DriftReport } from '@mmmnt/sync';

export interface SyncStatusResult {
  readonly success: boolean;
  readonly message: string;
  readonly diagnostics: readonly Diagnostic[];
  readonly filePath?: string;
  readonly report?: DriftReport;
  readonly json?: string;
}

const EMPTY: readonly Diagnostic[] = [];

function fail(message: string): SyncStatusResult {
  return { success: false, message, diagnostics: EMPTY };
}

function readFile(path: string): string | SyncStatusResult {
  try {
    return readFileSync(path, 'utf-8');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return fail(`Error: Failed to read ${path}: ${msg}`);
  }
}

export async function runSyncStatus(argv: string[]): Promise<SyncStatusResult> {
  const { values, positionals } = parseArgs({
    args: argv,
    options: { json: { type: 'boolean' } },
    allowPositionals: true,
    strict: false,
  });

  const filePath = positionals[0];
  if (!filePath) return fail('Usage: moment sync status <file.moment>');

  const resolvedPath = resolve(filePath);
  if (!existsSync(resolvedPath)) return fail(`Error: File not found: ${resolvedPath}`);

  const content = readFile(resolvedPath);
  if (typeof content !== 'string') return content;

  const parser = new MomentParser();
  const parseResult = await parser.parseContent(content);

  if (!parseResult.success) {
    return {
      success: false,
      message: `Parse failed with ${parseResult.diagnostics.length} diagnostic(s)`,
      diagnostics: parseResult.diagnostics,
      filePath: resolvedPath,
    };
  }

  const ir = parseResult.ir!;

  // Generate expected TypeScript from spec
  const emitter = new TypeScriptEmitter();
  const tsOutput = emitter.emit(ir, { scope: { level: 'system' } });

  // Actual implementation files are not loaded yet — no project-root convention
  // exists to locate them. Once a --root flag or manifest config is added, this
  // map will be populated by reading .ts files keyed to the same paths as
  // tsOutput.files. Until then, every expected file reports as drifted.
  const actual = new Map<string, string>();

  const engine = new ASTDiffEngine();
  const report = engine.detectDrift({ expected: tsOutput.files, actual });

  if (values.json === true) {
    const json = JSON.stringify(report, null, 2);
    return { success: true, message: json, diagnostics: EMPTY, report, json };
  }

  if (report.totalDrifted === 0) {
    return {
      success: true,
      message: `No drift detected. ${report.totalAligned} file(s) aligned.`,
      diagnostics: EMPTY,
      report,
    };
  }

  return {
    success: true,
    message: `Drift detected: ${report.totalDrifted} drifted, ${report.totalAligned} aligned`,
    diagnostics: EMPTY,
    report,
  };
}
