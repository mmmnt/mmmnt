/**
 * moment_import — Import Sift JSONL event streams into .moment specification files.
 */

import { writeFileSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { SiftSpecificationImporter } from '@mmmnt/core';
import { SiftEventStreamReader } from '@mmmnt/sync';
import { okResult, errorResult, wrapTool } from './shared.js';
import type { SiftImportInput } from '@mmmnt/core';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

interface ImportParams {
  domainDir: string;
  outputDir?: string;
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
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, importer.generateContextFile(block));
    count++;
  }

  return count;
}

function writeFingerprint(input: SiftImportInput, domainDir: string, outDir: string, contextCount: number): void {
  const hash = createHash('sha256');
  const files = readdirSync(domainDir).filter((f) => f.endsWith('.jsonl')).sort();
  for (const file of files) {
    hash.update(readFileSync(join(domainDir, file), 'utf-8'));
  }

  const fpDir = join(outDir, '.moment');
  mkdirSync(fpDir, { recursive: true });
  writeFileSync(
    join(fpDir, '.upstream-fingerprint.json'),
    JSON.stringify({
      sift: {
        specificationId: input.sourceProduct,
        contentHash: hash.digest('hex'),
        importedAt: new Date().toISOString(),
        boundedContextCount: contextCount,
      },
    }, null, 2),
  );
}

async function importImpl(params: ImportParams): Promise<CallToolResult> {
  const resolvedDir = resolve(params.domainDir);
  const reader = new SiftEventStreamReader();
  const readResult = reader.read(resolvedDir);

  if (readResult.errors.length > 0 && readResult.eventsProcessed === 0) {
    return errorResult('IMPORT_FAILED', readResult.errors[0]);
  }
  if (readResult.eventsProcessed === 0) {
    return errorResult('IMPORT_FAILED', 'No Sift events found in domain directory');
  }

  const siftInput = readResult.input as SiftImportInput;
  const importer = new SiftSpecificationImporter();
  const importResult = importer.import(siftInput);

  if (importResult.diagnostics.some((d) => d.severity === 'error')) {
    return errorResult('IMPORT_FAILED', 'Import produced errors', {
      diagnostics: importResult.diagnostics,
    });
  }

  const outDir = resolve(params.outputDir ?? dirname(resolvedDir));
  const filesWritten = writeOutputFiles(importer, siftInput, outDir);
  writeFingerprint(siftInput, resolvedDir, outDir, importResult.contextFiles.length);

  return okResult({
    success: true,
    contextsImported: importResult.contextFiles.length,
    filesWritten,
    eventsProcessed: readResult.eventsProcessed,
  });
}

export const importSift = wrapTool(importImpl);
