/**
 * moment import --from-sift — Import Sift specification from .domain/ JSONL event files
 *
 * Per ADR-028: reads .domain/*.jsonl (one file per bounded context), replays Sift
 * Published Language events into SiftImportInput, delegates to SiftSpecificationImporter.
 * Writes .upstream-fingerprint.json per ADR-022 §1.
 * Import is idempotent — fingerprint only updated when content changes (EXIT-C4).
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { createHash } from 'node:crypto';
import { SiftSpecificationImporter } from '@mmmnt/core';
import { SiftEventStreamReader } from '@mmmnt/sync';
import type { Diagnostic } from '@mmmnt/core';
import type { SiftImportInput } from '@mmmnt/core';

export interface ImportResult {
  readonly success: boolean;
  readonly message: string;
  readonly diagnostics: readonly Diagnostic[];
  readonly filesWritten: number;
  readonly eventsProcessed: number;
  readonly json?: string;
}

const EMPTY: readonly Diagnostic[] = [];

function fail(message: string): ImportResult {
  return { success: false, message, diagnostics: EMPTY, filesWritten: 0, eventsProcessed: 0 };
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

  const domainDir = positionals[0];
  if (!domainDir) return fail('Usage: moment import --from-sift <.domain/ directory>');

  const resolvedDir = resolve(domainDir);
  if (!existsSync(resolvedDir)) return fail(`Error: Directory not found: ${resolvedDir}`);

  return executeImport(resolvedDir, values['output-dir'], values.json === true);
}

function executeImport(domainDir: string, outputDir: string | undefined, asJson: boolean): ImportResult {
  // Read and replay JSONL event stream
  const reader = new SiftEventStreamReader();
  const readResult = reader.read(domainDir);

  if (readResult.errors.length > 0 && readResult.eventsProcessed === 0) {
    return fail(`Error: ${readResult.errors[0]}`);
  }

  if (readResult.eventsProcessed === 0) {
    return fail('Error: No Sift events found in .domain/ directory');
  }

  const siftInput = readResult.input as SiftImportInput;

  // Delegate to SiftSpecificationImporter (EXIT-C1)
  const importer = new SiftSpecificationImporter();
  const importResult = importer.import(siftInput);

  if (importResult.diagnostics.some((d) => d.severity === 'error')) {
    const errorCount = importResult.diagnostics.filter((d) => d.severity === 'error').length;
    return { success: false, message: `Import failed with ${errorCount} error(s)`, diagnostics: importResult.diagnostics, filesWritten: 0, eventsProcessed: readResult.eventsProcessed };
  }

  const outDir = resolve(outputDir ?? dirname(domainDir));
  const filesWritten = writeOutputFiles(importer, siftInput, outDir);
  writeFingerprint(siftInput, importResult, domainDir, outDir);

  return buildResult(importResult, filesWritten, readResult.eventsProcessed, readResult.filesRead, asJson);
}

function sanitizeFileName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function assertPathWithin(filePath: string, baseDir: string): void {
  if (!resolve(filePath).startsWith(resolve(baseDir))) {
    throw new Error(`Path traversal detected: ${filePath} escapes ${baseDir}`);
  }
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

  return count;
}

function writeFingerprint(
  siftInput: SiftImportInput,
  importResult: ReturnType<SiftSpecificationImporter['import']>,
  domainDir: string,
  outDir: string,
): void {
  const contentHash = computeDomainHash(domainDir);
  const fpDir = join(outDir, '.moment');
  const fpPath = join(fpDir, '.upstream-fingerprint.json');

  // Idempotent: skip write if content unchanged (EXIT-C4)
  if (existsSync(fpPath)) {
    try {
      const existing = JSON.parse(readFileSync(fpPath, 'utf-8')) as { sift?: { contentHash?: string } };
      if (existing.sift?.contentHash === contentHash) return;
    } catch {
      // Unreadable — overwrite
    }
  }

  const fingerprint = {
    sift: {
      specificationId: siftInput.sourceProduct,
      contentHash,
      importedAt: new Date().toISOString(),
      boundedContextCount: importResult.contextFiles.length,
      aggregateCount: countAggregates(siftInput),
      domainEventCount: countDomainEvents(siftInput),
    },
  };

  mkdirSync(fpDir, { recursive: true });
  writeFileSync(fpPath, JSON.stringify(fingerprint, null, 2));
}

function computeDomainHash(domainDir: string): string {
  const { readdirSync } = require('node:fs') as typeof import('node:fs');
  const files = readdirSync(domainDir).filter((f: string) => f.endsWith('.jsonl')).sort();
  const hash = createHash('sha256');
  for (const file of files) {
    hash.update(readFileSync(join(domainDir, file), 'utf-8'));
  }
  return hash.digest('hex');
}

function countAggregates(input: SiftImportInput): number {
  return input.buildingBlocks.reduce((sum, b) => sum + b.aggregates.length, 0);
}

function countDomainEvents(input: SiftImportInput): number {
  return input.buildingBlocks.reduce((sum, b) =>
    sum + b.aggregates.reduce((s, a) => s + a.events.length, 0), 0);
}

function buildResult(
  importResult: ReturnType<SiftSpecificationImporter['import']>,
  filesWritten: number,
  eventsProcessed: number,
  filesRead: number,
  asJson: boolean,
): ImportResult {
  const summary = {
    contexts: importResult.contextFiles.length,
    flows: importResult.flowFiles.length,
    filesWritten,
    eventsProcessed,
    jsonlFilesRead: filesRead,
  };

  if (asJson) {
    const json = JSON.stringify(summary, null, 2);
    return { success: true, message: json, diagnostics: importResult.diagnostics, filesWritten, eventsProcessed, json };
  }

  return {
    success: true,
    message: `Imported: ${summary.contexts} context(s), ${filesWritten} file(s) written from ${eventsProcessed} events across ${filesRead} JSONL file(s)`,
    diagnostics: importResult.diagnostics,
    filesWritten,
    eventsProcessed,
  };
}
