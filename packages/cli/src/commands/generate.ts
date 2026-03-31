/**
 * moment generate — Compound command: parse → derive → [emit-ts + gherkin + docs] parallel
 *
 * Design Principle #2: every temporal flow produces BOTH .feature AND .spec.ts.
 * No --gherkin-only or --ts-only flags. Use `moment emit-ts` for TS-only.
 * Delegates to full pipeline — no generation logic in CLI layer (EXIT-C1).
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { MomentParser } from '@mmmnt/core';
import { deriveTopology } from '@mmmnt/derive';
import { GherkinGenerator, SpecificationDocumentGenerator } from '@mmmnt/generate';
import { TypeScriptEmitter, TestScaffoldEmitter } from '@mmmnt/emit-ts';
import type { Diagnostic } from '@mmmnt/core';

export interface GenerateCommandResult {
  readonly success: boolean;
  readonly message: string;
  readonly diagnostics: readonly Diagnostic[];
  readonly filePath?: string;
  readonly featureCount?: number;
  readonly specCount?: number;
  readonly docCount?: number;
}

const EMPTY: readonly Diagnostic[] = [];

function fail(message: string): GenerateCommandResult {
  return { success: false, message, diagnostics: EMPTY };
}

function readFile(path: string): string | GenerateCommandResult {
  try {
    return readFileSync(path, 'utf-8');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return fail(`Error: Failed to read ${path}: ${msg}`);
  }
}

export async function runGenerate(argv: string[]): Promise<GenerateCommandResult> {
  const { positionals } = parseArgs({
    args: argv,
    options: {},
    allowPositionals: true,
    strict: false,
  });

  const filePath = positionals[0];
  if (!filePath) return fail('Usage: moment generate <file.moment>');

  const resolvedPath = resolve(filePath);
  if (!existsSync(resolvedPath)) return fail(`Error: File not found: ${resolvedPath}`);

  const content = readFile(resolvedPath);
  if (typeof content !== 'string') return content;

  // Step 1: Parse
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

  // Step 2: Derive
  const topology = deriveTopology(ir);

  // Step 3: Generate in parallel (Design Principle #2 — both .feature + .spec.ts)
  const gherkinGen = new GherkinGenerator();
  const docGen = new SpecificationDocumentGenerator();
  const tsEmitter = new TypeScriptEmitter();
  const scaffoldEmitter = new TestScaffoldEmitter();

  const [gherkinManifest, docs, tsOutput, scaffoldOutput] = await Promise.all([
    Promise.resolve(gherkinGen.generate(ir, topology)),
    Promise.resolve(docGen.generate(ir)),
    Promise.resolve(tsEmitter.emit(ir, { scope: 'full' })),
    Promise.resolve(scaffoldEmitter.emit(ir, topology)),
  ]);

  const featureCount = gherkinManifest.features?.length ?? 0;
  const docCount = docs.length;
  const specCount = scaffoldOutput.files?.size ?? 0;

  return {
    success: true,
    message: `Generated: ${featureCount} .feature file(s), ${specCount} .spec.ts file(s), ${docCount} document(s)`,
    diagnostics: EMPTY,
    featureCount,
    specCount,
    docCount,
  };
}
