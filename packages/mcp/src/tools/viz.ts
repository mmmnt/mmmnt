/**
 * moment_viz — Generate visualization data from a .moment specification.
 */

import { basename } from 'node:path';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { VizEmitter } from '@mmmnt/viz';
import { loadModel, okResult, errorResult, wrapTool } from './shared.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

interface VizParams {
  filePath: string;
}

async function vizImpl(params: VizParams): Promise<CallToolResult> {
  const parseResult = await loadModel(params.filePath);
  const resolvedPath = parseResult.path;

  if (!parseResult.success) {
    return errorResult(
      'PARSE_FAILED',
      `Parse failed with ${parseResult.diagnostics.length} diagnostic(s)`,
    );
  }

  const ir = parseResult.ir!;
  const emitter = new VizEmitter();
  // Derive stable sessionId from the content hash for idempotent output (every file, in order, for a project)
  const hash = createHash('sha256');
  for (const file of parseResult.files) hash.update(readFileSync(file));
  const contentHash = hash.digest('hex').slice(0, 12);
  const sessionId = `viz-${contentHash}`;

  const event = emitter.createInitialLoad(ir, {
    sessionId,
    specificationName: basename(resolvedPath, '.moment'),
    startedAt: '2026-01-01T00:00:00.000Z', // stable timestamp for idempotent output
  });

  return okResult(event.envelope);
}

export const viz = wrapTool(vizImpl);
