/**
 * moment cucumber-json — Produce Cucumber JSON for Xray import
 *
 * Chains parse → derive → gherkin → cucumber-json. Outputs Cucumber JSON
 * to stdout or a file, suitable for Xray's import/execution/cucumber endpoint.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { MomentParser } from '@mmmnt/core';
import { deriveTopology } from '@mmmnt/derive';
import { GherkinGenerator, generateCucumberJson } from '@mmmnt/generate';
import { TestRunner } from '@mmmnt/harness';
import type { Diagnostic } from '@mmmnt/core';

export interface CucumberJsonCommandResult {
  readonly success: boolean;
  readonly message: string;
  readonly diagnostics: readonly Diagnostic[];
  readonly filePath?: string;
  readonly json?: string;
}

const EMPTY: readonly Diagnostic[] = [];

function fail(message: string): CucumberJsonCommandResult {
  return { success: false, message, diagnostics: EMPTY };
}

function readFile(path: string): string | CucumberJsonCommandResult {
  try {
    return readFileSync(path, 'utf-8');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return fail(`Error: Failed to read ${path}: ${msg}`);
  }
}

export async function runCucumberJson(argv: string[]): Promise<CucumberJsonCommandResult> {
  const { positionals } = parseArgs({
    args: argv,
    options: {},
    allowPositionals: true,
    strict: false,
  });

  const filePath = positionals[0];
  if (!filePath) return fail('Usage: moment cucumber-json <file.moment>');

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
  const topology = deriveTopology(ir);

  // Run structural tests to determine pass/fail status per scenario
  const runner = new TestRunner();
  runner.run(topology, ir);

  const gherkinGen = new GherkinGenerator();
  const gherkinManifest = gherkinGen.generate(ir, topology);
  const cucumberJson = generateCucumberJson(gherkinManifest, topology, ir);

  const json = JSON.stringify(cucumberJson, null, 2);

  return {
    success: true,
    message: json,
    diagnostics: EMPTY,
    json,
  };
}
