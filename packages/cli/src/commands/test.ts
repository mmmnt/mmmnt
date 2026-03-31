/**
 * moment test — Run derived test suites via TestRunner
 *
 * Chains parse → derive → TestRunner. No test execution logic in CLI layer (EXIT-C1).
 * Infrastructure-agnostic (Design Principle #6).
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { MomentParser } from '@mmmnt/core';
import { deriveTopology } from '@mmmnt/derive';
import { TestRunner } from '@mmmnt/harness';
import type { Diagnostic } from '@mmmnt/core';
import type { TestRunResult } from '@mmmnt/harness';

export interface TestCommandResult {
  readonly success: boolean;
  readonly message: string;
  readonly diagnostics: readonly Diagnostic[];
  readonly filePath?: string;
  readonly testResult?: TestRunResult;
}

const EMPTY: readonly Diagnostic[] = [];

function fail(message: string): TestCommandResult {
  return { success: false, message, diagnostics: EMPTY };
}

function readFile(path: string): string | TestCommandResult {
  try {
    return readFileSync(path, 'utf-8');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return fail(`Error: Failed to read ${path}: ${msg}`);
  }
}

export async function runTest(argv: string[]): Promise<TestCommandResult> {
  const { positionals } = parseArgs({
    args: argv,
    options: {},
    allowPositionals: true,
    strict: false,
  });

  const filePath = positionals[0];
  if (!filePath) return fail('Usage: moment test <file.moment>');

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
  const topology = deriveTopology(ir);
  const runner = new TestRunner();
  const testResult = runner.run(topology, ir);

  const allPassed = testResult.testsFailed === 0;

  return {
    success: allPassed,
    message: `Tests: ${testResult.testsPassed} passed, ${testResult.testsFailed} failed, ${testResult.testsSkipped} skipped (${testResult.suitesRun} suite(s))`,
    diagnostics: EMPTY,
    testResult,
  };
}
