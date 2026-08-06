/**
 * moment generate — Compound command: parse → derive → [emit-ts + gherkin + docs]
 *
 * Design Principle #2: every temporal flow produces BOTH .feature AND .spec.ts.
 * No --gherkin-only or --ts-only flags. Use `moment emit-ts` for TS-only.
 * Delegates to full pipeline — no generation logic in CLI layer (EXIT-C1).
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { MomentParser } from '@mmmnt/core';
import { updateManifestFromIr } from './update-manifest.js';
import { resolveOutputBaseDir, writeOutputFiles } from './project-fs.js';
import { deriveTopology } from '@mmmnt/derive';
import { GherkinGenerator, SpecificationDocumentGenerator } from '@mmmnt/generate';
import { TypeScriptEmitter, TestScaffoldEmitter } from '@mmmnt/emit-ts';
import type { Diagnostic } from '@mmmnt/core';
import { warnUnknownFlags, resolveStringFlag } from '../lib/flags.js';

export interface GenerateCommandResult {
  readonly success: boolean;
  readonly message: string;
  readonly diagnostics: readonly Diagnostic[];
  readonly filePath?: string;
  readonly featureCount?: number;
  readonly specCount?: number;
  readonly docCount?: number;
  readonly outDir?: string;
  readonly filesWritten?: readonly string[];
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
  const options = {
    out: { type: 'string', short: 'o' },
    // Alias for --out, symmetric with `moment simulate --out-dir`.
    'out-dir': { type: 'string' },
  } as const;
  const { values, positionals, tokens } = parseArgs({
    args: argv,
    options,
    allowPositionals: true,
    strict: false,
    tokens: true,
  });
  warnUnknownFlags(tokens, Object.keys(options));

  const filePath = positionals[0];
  if (!filePath)
    return fail('Usage: moment generate <file.moment> [--out <dir> | --out-dir <dir>]');

  const resolvedPath = resolve(filePath);
  if (!existsSync(resolvedPath)) return fail(`Error: File not found: ${resolvedPath}`);

  const content = readFile(resolvedPath);
  if (typeof content !== 'string') return content;

  // Step 1: Parse
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

  // Step 2: Derive
  const topology = deriveTopology(ir);

  // Step 3: Generate all artifacts (Design Principle #2 — both .feature + .spec.ts)
  const gherkinGen = new GherkinGenerator();
  const docGen = new SpecificationDocumentGenerator();
  const tsEmitter = new TypeScriptEmitter();
  const scaffoldEmitter = new TestScaffoldEmitter();

  const gherkinManifest = gherkinGen.generate(ir, topology);
  const docs = docGen.generate(ir);
  const tsOutput = tsEmitter.emit(ir, { scope: { level: 'system' } });
  const scaffoldOutput = scaffoldEmitter.emit(ir, topology);

  // Step 4: Write everything to disk. --out-dir and --out are aliases;
  // resolution against cwd mirrors `moment simulate --out-dir`. Without
  // either flag the base dir is the nearest .manifest.yaml root, else cwd.
  const outDir = resolveOutputBaseDir(resolvedPath, resolveStringFlag(values, 'out-dir', 'out'));

  const allFiles = new Map<string, string>();
  for (const [path, content] of tsOutput.files) allFiles.set(path, content);
  for (const [path, content] of scaffoldOutput.files) allFiles.set(path, content);
  for (const feature of gherkinManifest.featuresGenerated) {
    allFiles.set(feature.filePath, feature.content);
  }
  for (const doc of docs) {
    allFiles.set(doc.filePath, doc.content);
  }

  const filesWritten = writeOutputFiles(allFiles, outDir);

  const featureCount = gherkinManifest.featuresGenerated.length;
  const docCount = docs.length;
  const specCount = scaffoldOutput.files.size;

  return {
    success: true,
    message:
      `Generated: ${featureCount} .feature file(s), ${specCount} .spec.ts file(s), ${docCount} document(s)\n` +
      `Wrote ${filesWritten.length} file(s) to ${outDir}`,
    diagnostics: EMPTY,
    featureCount,
    specCount,
    docCount,
    outDir,
    filesWritten,
  };
}
