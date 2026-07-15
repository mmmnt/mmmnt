/**
 * moment viz — Emit visualization data envelope
 *
 * Produces VizDataEnvelope from IR via VizEmitter. Dry-run mode outputs
 * envelope as JSON to stdout. Connection to visualization consumer is
 * lateral infrastructure — not implemented here.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { parseArgs } from 'node:util';
import { MomentParser } from '@mmmnt/core';
import { VizEmitter } from '@mmmnt/viz';
import type { Diagnostic } from '@mmmnt/core';
import type { VizInitialLoad } from '@mmmnt/viz';

export interface VizCommandResult {
  readonly success: boolean;
  readonly message: string;
  readonly diagnostics: readonly Diagnostic[];
  readonly filePath?: string;
  readonly event?: VizInitialLoad;
  readonly json?: string;
}

const EMPTY: readonly Diagnostic[] = [];

function fail(message: string): VizCommandResult {
  return { success: false, message, diagnostics: EMPTY };
}

function readFile(path: string): string | VizCommandResult {
  try {
    return readFileSync(path, 'utf-8');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return fail(`Error: Failed to read ${path}: ${msg}`);
  }
}

export async function runViz(argv: string[]): Promise<VizCommandResult> {
  const { positionals } = parseArgs({
    args: argv,
    options: {},
    allowPositionals: true,
    strict: false,
  });

  const filePath = positionals[0];
  if (!filePath) return fail('Usage: moment viz <file.moment>');

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
  const emitter = new VizEmitter();
  const sessionId = `viz-${Date.now()}`;

  const event = emitter.createInitialLoad(ir, {
    sessionId,
    specificationName: basename(resolvedPath, '.moment'),
    startedAt: new Date().toISOString(),
  });

  const json = JSON.stringify(event, null, 2);

  return {
    success: true,
    message: `Viz envelope emitted: ${event.envelope.metadata.contextCount} context(s), ${event.envelope.metadata.flowCount} flow(s)`,
    diagnostics: EMPTY,
    event,
    json,
  };
}
