/**
 * moment_viz — Generate visualization data from a .moment specification.
 */

import { resolve, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { MomentParser } from '@mmmnt/core';
import { VizEmitter } from '@mmmnt/viz';
import { readMomentFile, okResult, errorResult, wrapTool } from './shared.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

interface VizParams {
  filePath: string;
}

async function vizImpl(params: VizParams): Promise<CallToolResult> {
  const resolvedPath = resolve(params.filePath);
  const content = readMomentFile(params.filePath);
  const parser = new MomentParser();
  const parseResult = await parser.parseContent(content);

  if (!parseResult.success) {
    return errorResult('PARSE_FAILED', `Parse failed with ${parseResult.diagnostics.length} diagnostic(s)`);
  }

  const ir = parseResult.ir!;
  const emitter = new VizEmitter();
  // Derive stable sessionId from content hash for idempotent output
  const contentHash = createHash('sha256').update(content).digest('hex').slice(0, 12);
  const sessionId = `viz-${contentHash}`;

  const event = emitter.createInitialLoad(ir, {
    sessionId,
    specificationName: basename(resolvedPath, '.moment'),
    startedAt: '2026-01-01T00:00:00.000Z', // stable timestamp for idempotent output
  });

  return okResult(event.envelope);
}

export const viz = wrapTool(vizImpl);
