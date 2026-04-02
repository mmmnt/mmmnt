/**
 * moment import --from-sift — Import Sift specification into .moment files
 *
 * Delegates to SiftSpecificationImporter from @mmmnt/core (EXIT-C1).
 * Writes .upstream-fingerprint.json per ADR-022 §1.
 * Import is idempotent — re-running overwrites cleanly (EXIT-C4).
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { createHash } from 'node:crypto';
import { SiftSpecificationImporter } from '@mmmnt/core';
import type { Diagnostic, SiftImportInput } from '@mmmnt/core';

export interface ImportResult {
  readonly success: boolean;
  readonly message: string;
  readonly diagnostics: readonly Diagnostic[];
  readonly filesWritten: number;
  readonly json?: string;
}

const EMPTY: readonly Diagnostic[] = [];

function fail(message: string): ImportResult {
  return { success: false, message, diagnostics: EMPTY, filesWritten: 0 };
}

export async function runImportFromSift(argv: string[]): Promise<ImportResult> {
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      json: { type: 'boolean' },
      'output-dir': { type: 'string' },
    },
    allowPositionals: true,
    strict: false,
  });

  const siftPath = positionals[0];
  if (!siftPath) return fail('Usage: moment import --from-sift <sift-spec.json>');

  const resolvedPath = resolve(siftPath);
  if (!existsSync(resolvedPath)) return fail(`Error: File not found: ${resolvedPath}`);

  return executeImport(resolvedPath, values['output-dir'], values.json === true);
}

function executeImport(resolvedPath: string, outputDir: string | undefined, asJson: boolean): ImportResult {
  let content: string;
  try {
    content = readFileSync(resolvedPath, 'utf-8');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return fail(`Error: Failed to read ${resolvedPath}: ${msg}`);
  }

  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    return fail('Error: Invalid JSON in Sift specification file');
  }

  const validation = validateSiftInput(raw);
  if (validation) return fail(validation);

  const typedInput = raw as SiftImportInput;
  const importer = new SiftSpecificationImporter();
  const result = importer.import(typedInput);

  if (result.diagnostics.some((d) => d.severity === 'error')) {
    const errorCount = result.diagnostics.filter((d) => d.severity === 'error').length;
    return { success: false, message: `Import failed with ${errorCount} error(s)`, diagnostics: result.diagnostics, filesWritten: 0 };
  }

  const outDir = resolve(outputDir ?? dirname(resolvedPath));
  const filesWritten = writeOutputFiles(importer, typedInput, outDir);
  writeFingerprint(typedInput, result, content, outDir);

  return buildResult(result, filesWritten, asJson);
}

function validateSiftInput(raw: unknown): string | null {
  if (typeof raw !== 'object' || raw === null) return 'Error: Sift spec must be a JSON object';
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.buildingBlocks)) return 'Error: Sift spec missing "buildingBlocks" array';
  if (!Array.isArray(obj.timelineEvents)) return 'Error: Sift spec missing "timelineEvents" array';
  return null;
}

function sanitizeFileName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function writeOutputFiles(importer: SiftSpecificationImporter, input: SiftImportInput, outDir: string): number {
  let count = 0;
  const momentDir = join(outDir, '.moment');

  for (const block of input.buildingBlocks) {
    const fileName = sanitizeFileName(block.contextName);
    const filePath = join(momentDir, 'contexts', `${fileName}.moment`);
    assertPathWithin(filePath, momentDir);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, importer.generateContextFile(block));
    count++;
  }

  for (const event of input.timelineEvents) {
    const fileName = sanitizeFileName(event.flowName);
    const filePath = join(momentDir, 'flows', `${fileName}.moment`);
    assertPathWithin(filePath, momentDir);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, importer.generateFlowFile(event));
    count++;
  }

  return count;
}

function assertPathWithin(filePath: string, baseDir: string): void {
  const resolved = resolve(filePath);
  if (!resolved.startsWith(resolve(baseDir))) {
    throw new Error(`Path traversal detected: ${filePath} escapes ${baseDir}`);
  }
}

function writeFingerprint(
  siftInput: SiftImportInput,
  result: ReturnType<SiftSpecificationImporter['import']>,
  rawContent: string,
  outDir: string,
): void {
  const contentHash = createHash('sha256').update(rawContent).digest('hex');
  const fpDir = join(outDir, '.moment');
  const fpPath = join(fpDir, '.upstream-fingerprint.json');

  // Skip write if content hasn't changed (idempotent, EXIT-C4)
  if (existsSync(fpPath)) {
    try {
      const existing = JSON.parse(readFileSync(fpPath, 'utf-8')) as { contentHash?: unknown };
      if (existing.contentHash === contentHash) return;
    } catch {
      // Unreadable fingerprint — overwrite below
    }
  }

  const fingerprint = {
    specificationId: String(siftInput.sourceProduct ?? 'unknown'),
    contentHash,
    importedAt: new Date().toISOString(),
    boundedContextCount: result.contextFiles.length,
    aggregateCount: countAggregates(siftInput),
    domainEventCount: countDomainEvents(siftInput),
  };

  mkdirSync(fpDir, { recursive: true });
  writeFileSync(fpPath, JSON.stringify(fingerprint, null, 2));
}

function countAggregates(input: SiftImportInput): number {
  return input.buildingBlocks.reduce((sum, b) => sum + b.aggregates.length, 0);
}

function countDomainEvents(input: SiftImportInput): number {
  return input.buildingBlocks.reduce((sum, b) =>
    sum + b.aggregates.reduce((s, a) => s + a.events.length, 0), 0);
}

function buildResult(
  result: ReturnType<SiftSpecificationImporter['import']>,
  filesWritten: number,
  asJson: boolean,
): ImportResult {
  const summary = { contexts: result.contextFiles.length, flows: result.flowFiles.length, filesWritten };

  if (asJson) {
    const json = JSON.stringify(summary, null, 2);
    return { success: true, message: json, diagnostics: result.diagnostics, filesWritten, json };
  }

  return {
    success: true,
    message: `Imported: ${summary.contexts} context(s), ${summary.flows} flow(s), ${filesWritten} file(s) written`,
    diagnostics: result.diagnostics,
    filesWritten,
  };
}
