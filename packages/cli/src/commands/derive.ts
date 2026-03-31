/**
 * moment derive — Parse then derive test suite topology
 *
 * Delegates to MomentParser + deriveTopology from @mmmnt/core and @mmmnt/derive.
 * No derivation logic in the CLI layer (EXIT-C1).
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { MomentParser } from '@mmmnt/core';
import { deriveTopology } from '@mmmnt/derive';
import type { Diagnostic } from '@mmmnt/core';
import type { TestSuiteTopology } from '@mmmnt/derive';
import { formatDiagnostic } from './parse.js';

export interface DeriveCommandResult {
  readonly success: boolean;
  readonly message: string;
  readonly diagnostics: readonly Diagnostic[];
  readonly topology?: TestSuiteTopology;
  readonly json?: string;
}

const EMPTY: readonly Diagnostic[] = [];

function fail(message: string): DeriveCommandResult {
  return { success: false, message, diagnostics: EMPTY };
}

function readFile(path: string): string | DeriveCommandResult {
  try {
    return readFileSync(path, 'utf-8');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return fail(`Error: Failed to read ${path}: ${msg}`);
  }
}

export async function runDerive(argv: string[]): Promise<DeriveCommandResult> {
  const { values, positionals } = parseArgs({
    args: argv,
    options: { json: { type: 'boolean' } },
    allowPositionals: true,
    strict: false,
  });

  const filePath = positionals[0];
  if (!filePath) return fail('Usage: moment derive <file.moment>');

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
    };
  }

  const topology = deriveTopology(parseResult.ir!);
  const suiteCount = topology.suites.length;
  const caseCount = topology.suites.reduce((sum, s) => sum + s.testCases.length, 0);

  if (values.json === true) {
    return {
      success: true,
      message: JSON.stringify(topology, null, 2),
      diagnostics: EMPTY,
      topology,
      json: JSON.stringify(topology, null, 2),
    };
  }

  return {
    success: true,
    message: `Derived topology: ${suiteCount} suite(s), ${caseCount} case(s)`,
    diagnostics: EMPTY,
    topology,
  };
}
