/**
 * moment schema emit — one closed JSON Schema per event payload (ADR-049 D8).
 *
 * Delegates to @mmmnt/schema's emitPayloadSchemas; the CLI only reads the model and writes the files.
 * Any diagnostic fails the command and nothing is written, so a consumer never gets a partial set.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import type { Diagnostic } from '@mmmnt/core';
import { emitPayloadSchemas } from '@mmmnt/schema';
import { parseSpecification, specificationText } from '../lib/load-specification.js';

export interface SchemaEmitResult {
  readonly success: boolean;
  readonly message: string;
  readonly diagnostics: readonly Diagnostic[];
  readonly filePath?: string;
}

const USAGE = 'Usage: moment schema emit <file.moment|dir> [--out-dir <dir>]';

export async function runSchemaEmit(argv: string[]): Promise<SchemaEmitResult> {
  const { values, positionals } = parseArgs({
    args: argv,
    options: { 'out-dir': { type: 'string' } },
    allowPositionals: true,
    strict: false,
  });
  const filePath = positionals[0];
  if (!filePath) return { success: false, message: USAGE, diagnostics: [] };

  const resolvedPath = resolve(filePath);
  if (!existsSync(resolvedPath)) {
    return { success: false, message: `Error: File not found: ${resolvedPath}`, diagnostics: [] };
  }
  const content = specificationText(resolvedPath, (p) => readFileSync(p, 'utf-8'));
  const parsed = await parseSpecification(resolvedPath, content);
  if (!parsed.success || !parsed.ir) {
    return {
      success: false,
      message: `Parse failed with ${parsed.diagnostics.length} diagnostic(s)`,
      diagnostics: parsed.diagnostics,
      filePath: resolvedPath,
    };
  }

  const { schemas, diagnostics } = emitPayloadSchemas(parsed.ir);
  if (diagnostics.length > 0) {
    return {
      success: false,
      message: [
        `No schema written: ${diagnostics.length} diagnostic(s)`,
        ...diagnostics.map((d) => `error: ${d.message}`),
      ].join('\n'),
      diagnostics: [],
      filePath: resolvedPath,
    };
  }

  const outDir = typeof values['out-dir'] === 'string' ? resolve(values['out-dir']) : undefined;
  if (outDir === undefined) {
    return { success: true, message: JSON.stringify(schemas, null, 2), diagnostics: [] };
  }
  mkdirSync(outDir, { recursive: true });
  for (const [event, schema] of Object.entries(schemas)) {
    writeFileSync(join(outDir, `${event}.schema.json`), `${JSON.stringify(schema, null, 2)}\n`);
  }
  return {
    success: true,
    message: `Wrote ${Object.keys(schemas).length} payload schema(s) to ${outDir}`,
    diagnostics: [],
  };
}
