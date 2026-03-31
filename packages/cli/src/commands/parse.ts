/**
 * moment parse — Parse .moment files to validated IR
 *
 * Delegates to MomentParser from @mmmnt/core.
 * No grammar/AST logic in the CLI layer (EXIT-C1).
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { MomentParser } from '@mmmnt/core';
import type { Diagnostic } from '@mmmnt/core';

export interface ParseCommandResult {
  readonly success: boolean;
  readonly message: string;
  readonly diagnostics: readonly Diagnostic[];
  readonly contextCount?: number;
  readonly flowCount?: number;
}

export function formatDiagnostic(d: Diagnostic): string {
  const loc = d.source ? `${d.source.file}:${d.source.line}:${d.source.column}` : '<unknown>';
  return `${d.severity}: ${loc} — ${d.message}`;
}

export async function runParse(argv: string[]): Promise<ParseCommandResult> {
  const filePath = argv[0];

  if (!filePath) {
    return {
      success: false,
      message: 'Usage: moment parse <file.moment>',
      diagnostics: [],
    };
  }

  const resolvedPath = resolve(filePath);

  if (!existsSync(resolvedPath)) {
    return {
      success: false,
      message: `Error: File not found: ${resolvedPath}`,
      diagnostics: [],
    };
  }

  const content = readFileSync(resolvedPath, 'utf-8');
  const parser = new MomentParser();
  const result = await parser.parseContent(content);

  if (!result.success) {
    return {
      success: false,
      message: `Parse failed with ${result.diagnostics.length} diagnostic(s)`,
      diagnostics: result.diagnostics,
    };
  }

  const contextCount = result.ir?.contexts?.length ?? 0;
  const flowCount = result.ir?.flows?.length ?? 0;

  return {
    success: true,
    message: `Parsed successfully: ${contextCount} context(s), ${flowCount} flow(s)`,
    diagnostics: result.diagnostics,
    contextCount,
    flowCount,
  };
}
