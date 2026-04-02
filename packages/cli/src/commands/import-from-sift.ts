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

function executeImport(
  resolvedPath: string,
  outputDir: string | undefined,
  asJson: boolean,
): ImportResult {
  let content: string;
  try {
    content = readFileSync(resolvedPath, 'utf-8');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return fail(`Error: Failed to read ${resolvedPath}: ${msg}`);
  }

  let siftInput: ReturnType<typeof JSON.parse>;
  try {
    siftInput = JSON.parse(content);
  } catch {
    return fail('Error: Invalid JSON in Sift specification file');
  }

  const typedInput = siftInput as SiftImportInput;
  const importer = new SiftSpecificationImporter();
  const result = importer.import(typedInput);

  if (result.diagnostics.length > 0) {
    const errors = result.diagnostics.filter((d) => d.severity === 'error');
    if (errors.length > 0) {
      return {
        success: false,
        message: `Import failed with ${errors.length} error(s)`,
        diagnostics: result.diagnostics,
        filesWritten: 0,
      };
    }
  }

  const outDir = resolve(outputDir ?? dirname(resolvedPath));
  const filesWritten = writeOutputFiles(importer, typedInput, outDir);
  writeFingerprint(siftInput, result, content, outDir);

  return buildResult(result, filesWritten, asJson);
}

function writeOutputFiles(
  importer: SiftSpecificationImporter,
  siftInput: SiftImportInput,
  outDir: string,
): number {
  let count = 0;

  for (const block of siftInput.buildingBlocks) {
    const fileName = block.contextName.toLowerCase().replace(/\s+/g, '-');
    const filePath = join(outDir, 'contexts', `${fileName}.moment`);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, importer.generateContextFile(block));
    count++;
  }

  for (const event of siftInput.timelineEvents) {
    const fileName = event.flowName.toLowerCase().replace(/\s+/g, '-');
    const filePath = join(outDir, 'flows', `${fileName}.moment`);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, importer.generateFlowFile(event));
    count++;
  }

  return count;
}

function writeFingerprint(
  siftInput: Record<string, unknown>,
  result: ReturnType<SiftSpecificationImporter['import']>,
  rawContent: string,
  outDir: string,
): void {
  const fingerprint = {
    specificationId: String(siftInput.sourceProduct ?? 'unknown'),
    contentHash: createHash('sha256').update(rawContent).digest('hex'),
    importedAt: new Date().toISOString(),
    boundedContextCount: result.contextFiles.length,
    aggregateCount: countAggregates(siftInput),
    domainEventCount: countDomainEvents(siftInput),
  };

  const fpDir = join(outDir, '.moment');
  mkdirSync(fpDir, { recursive: true });
  writeFileSync(join(fpDir, '.upstream-fingerprint.json'), JSON.stringify(fingerprint, null, 2));
}

function countAggregates(input: Record<string, unknown>): number {
  const blocks = input.buildingBlocks;
  if (!Array.isArray(blocks)) return 0;
  return blocks.reduce((sum: number, b: Record<string, unknown>) => {
    const aggs = b.aggregates;
    return sum + (Array.isArray(aggs) ? aggs.length : 0);
  }, 0);
}

function countDomainEvents(input: Record<string, unknown>): number {
  const blocks = input.buildingBlocks;
  if (!Array.isArray(blocks)) return 0;
  return blocks.reduce((sum: number, b: Record<string, unknown>) => {
    const aggs = b.aggregates;
    if (!Array.isArray(aggs)) return sum;
    return sum + aggs.reduce((s: number, a: Record<string, unknown>) => {
      const events = a.events;
      return s + (Array.isArray(events) ? events.length : 0);
    }, 0);
  }, 0);
}

function buildResult(
  result: ReturnType<SiftSpecificationImporter['import']>,
  filesWritten: number,
  asJson: boolean,
): ImportResult {
  const summary = {
    contexts: result.contextFiles.length,
    flows: result.flowFiles.length,
    filesWritten,
  };

  if (asJson) {
    const json = JSON.stringify(summary, null, 2);
    return { success: true, message: json, diagnostics: result.diagnostics, filesWritten, json };
  }

  const msg = `Imported: ${summary.contexts} context(s), ${summary.flows} flow(s), ${filesWritten} file(s) written`;
  return { success: true, message: msg, diagnostics: result.diagnostics, filesWritten };
}
