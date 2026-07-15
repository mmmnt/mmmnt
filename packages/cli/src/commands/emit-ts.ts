/**
 * moment emit-ts — Emit TypeScript artifacts (types + test scaffolds, no Gherkin)
 *
 * TypeScript-artifacts subset of `moment generate`. Chains parse → derive → TypeScriptEmitter + TestScaffoldEmitter.
 * No GherkinGenerator or SpecificationDocumentGenerator. Supports --dry-run (TG-05).
 * No codegen logic in CLI layer (EXIT-C1).
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { MomentParser } from '@mmmnt/core';
import { updateManifestFromIr } from './update-manifest.js';
import { resolveOutputBaseDir, writeOutputFiles } from './project-fs.js';
import { deriveTopology } from '@mmmnt/derive';
import { TypeScriptEmitter, TestScaffoldEmitter } from '@mmmnt/emit-ts';
import type { Diagnostic } from '@mmmnt/core';

export interface EmitTsCommandResult {
  readonly success: boolean;
  readonly message: string;
  readonly diagnostics: readonly Diagnostic[];
  readonly filePath?: string;
  readonly tsFileCount?: number;
  readonly scaffoldFileCount?: number;
  readonly dryRun?: boolean;
  readonly fileList?: readonly string[];
  readonly outDir?: string;
  readonly filesWritten?: readonly string[];
}

const EMPTY: readonly Diagnostic[] = [];

function fail(message: string): EmitTsCommandResult {
  return { success: false, message, diagnostics: EMPTY };
}

function readFile(path: string): string | EmitTsCommandResult {
  try {
    return readFileSync(path, 'utf-8');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return fail(`Error: Failed to read ${path}: ${msg}`);
  }
}

export async function runEmitTs(argv: string[]): Promise<EmitTsCommandResult> {
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      'dry-run': { type: 'boolean' },
      out: { type: 'string', short: 'o' },
    },
    allowPositionals: true,
    strict: false,
  });

  const filePath = positionals[0];
  if (!filePath) return fail('Usage: moment emit-ts <file.moment> [--dry-run] [--out <dir>]');

  const resolvedPath = resolve(filePath);
  if (!existsSync(resolvedPath)) return fail(`Error: File not found: ${resolvedPath}`);

  const content = readFile(resolvedPath);
  if (typeof content !== 'string') return content;

  const parser = new MomentParser();
  const parseResult = await parser.parseContent(content, resolvedPath);

  if (!parseResult.success) {
    return {
      success: false,
      message: `Parse failed with ${parseResult.diagnostics.length} diagnostic(s)`,
      diagnostics: parseResult.diagnostics,
      filePath: resolvedPath,
    };
  }

  const ir = parseResult.ir!;
  updateManifestFromIr(resolvedPath, ir);
  const topology = deriveTopology(ir);
  const isDryRun = values['dry-run'] === true;

  const tsEmitter = new TypeScriptEmitter();
  const scaffoldEmitter = new TestScaffoldEmitter();

  const tsOutput = tsEmitter.emit(ir, { scope: { level: 'system' }, dryRun: isDryRun });
  const scaffoldOutput = scaffoldEmitter.emit(ir, topology);

  const tsFileCount = tsOutput.files.size;
  const scaffoldFileCount = scaffoldOutput.files.size;
  const allFiles = [...tsOutput.files.keys(), ...scaffoldOutput.files.keys()];

  if (isDryRun) {
    const fileListStr = allFiles.length > 0 ? allFiles.join('\n') : '(no files)';
    return {
      success: true,
      message: `Dry run — would emit ${allFiles.length} file(s):\n${fileListStr}`,
      diagnostics: EMPTY,
      dryRun: true,
      fileList: allFiles,
      tsFileCount,
      scaffoldFileCount,
    };
  }

  const outDir = resolveOutputBaseDir(
    resolvedPath,
    typeof values.out === 'string' ? values.out : undefined,
  );

  const combined = new Map<string, string>();
  for (const [path, content] of tsOutput.files) combined.set(path, content);
  for (const [path, content] of scaffoldOutput.files) combined.set(path, content);

  const filesWritten = writeOutputFiles(combined, outDir);

  return {
    success: true,
    message:
      `Emitted: ${tsFileCount} TypeScript file(s), ${scaffoldFileCount} scaffold file(s)\n` +
      `Wrote ${filesWritten.length} file(s) to ${outDir}`,
    diagnostics: EMPTY,
    tsFileCount,
    scaffoldFileCount,
    outDir,
    filesWritten,
  };
}
