/**
 * moment parse — Parse .moment files to validated IR
 *
 * Delegates to MomentParser from @mmmnt/core.
 * No grammar/AST logic in the CLI layer (EXIT-C1).
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { MomentParser } from '@mmmnt/core';
import type { Diagnostic, ParseResult } from '@mmmnt/core';
import { updateManifestFromIr } from './update-manifest.js';
import { isDirectory, loadSpecification } from '../lib/load-specification.js';
import type { LoadedSpecification } from '../lib/load-specification.js';

export interface ParseCommandResult {
  readonly success: boolean;
  readonly message: string;
  readonly diagnostics: readonly Diagnostic[];
  readonly contextCount?: number;
  readonly flowCount?: number;
}

const EMPTY: readonly Diagnostic[] = [];

function fail(message: string): ParseCommandResult {
  return { success: false, message, diagnostics: EMPTY };
}

export function formatDiagnostic(d: Diagnostic, fallbackFile?: string): string {
  const loc = d.source
    ? `${d.source.file}:${d.source.line}:${d.source.column}`
    : (fallbackFile ?? '<unknown>');
  // Name the rule (V22 …) unless the message already starts with it, as older rules' messages do.
  const rule = d.ruleId && !d.message.startsWith(`${d.ruleId}:`) ? `${d.ruleId}: ` : '';
  return `${d.severity}: ${loc} — ${rule}${d.message}`;
}

function readFile(path: string): string | ParseCommandResult {
  try {
    return readFileSync(path, 'utf-8');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return fail(`Error: Failed to read ${path}: ${msg}`);
  }
}

function toResult(parseResult: ParseResult): ParseCommandResult {
  if (!parseResult.success) {
    return {
      success: false,
      message: `Parse failed with ${parseResult.diagnostics.length} diagnostic(s)`,
      diagnostics: parseResult.diagnostics,
    };
  }

  const contextCount = parseResult.ir?.contexts?.length ?? 0;
  const flowCount = parseResult.ir?.flows?.length ?? 0;

  return {
    success: true,
    message: `Parsed successfully: ${contextCount} context(s), ${flowCount} flow(s)`,
    diagnostics: parseResult.diagnostics,
    contextCount,
    flowCount,
  };
}

export async function runParse(argv: string[]): Promise<ParseCommandResult> {
  const filePath = argv[0];
  if (!filePath) return fail('Usage: moment parse <file.moment | directory>');

  const resolvedPath = resolve(filePath);
  if (!existsSync(resolvedPath)) return fail(`Error: File not found: ${resolvedPath}`);

  if (isDirectory(resolvedPath)) return toProjectResult(await loadSpecification(resolvedPath));

  const content = readFile(resolvedPath);
  if (typeof content !== 'string') return content;

  const parser = new MomentParser();
  const result = await parser.parseContent(content, resolvedPath);

  if (result.success && result.ir) {
    updateManifestFromIr(resolvedPath, result.ir);
  }

  return toResult(result);
}

function toProjectResult(project: LoadedSpecification): ParseCommandResult {
  const contextCount = project.ir?.contexts.length ?? 0;
  const flowCount = project.ir?.flows.length ?? 0;
  if (!project.success) {
    return {
      success: false,
      message: `Project failed with ${project.diagnostics.length} diagnostic(s)`,
      diagnostics: project.diagnostics,
    };
  }
  return {
    success: true,
    message: `Parsed project successfully: ${project.files.length} file(s), ${contextCount} context(s), ${flowCount} flow(s)`,
    diagnostics: project.diagnostics,
    contextCount,
    flowCount,
  };
}
