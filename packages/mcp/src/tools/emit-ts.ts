/**
 * moment_emit_ts — Generate TypeScript type definitions and test scaffolds.
 */

import { deriveTopology } from '@mmmnt/derive';
import { TypeScriptEmitter, TestScaffoldEmitter } from '@mmmnt/emit-ts';
import { loadModel, okResult, errorResult, wrapTool } from './shared.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

interface EmitTsParams {
  filePath: string;
  dryRun?: boolean;
}

async function emitTsImpl(params: EmitTsParams): Promise<CallToolResult> {
  const parseResult = await loadModel(params.filePath);

  if (!parseResult.success) {
    return errorResult(
      'PARSE_FAILED',
      `Parse failed with ${parseResult.diagnostics.length} diagnostic(s)`,
    );
  }

  const ir = parseResult.ir!;
  const isDryRun = params.dryRun ?? false;
  const topology = deriveTopology(ir);

  const tsEmitter = new TypeScriptEmitter();
  const scaffoldEmitter = new TestScaffoldEmitter();

  const tsOutput = tsEmitter.emit(ir, { scope: { level: 'system' }, dryRun: isDryRun });
  const scaffoldOutput = scaffoldEmitter.emit(ir, topology);

  const tsFileCount = tsOutput.files.size;
  const scaffoldFileCount = scaffoldOutput.files.size;
  const allFiles = [...tsOutput.files.keys(), ...scaffoldOutput.files.keys()];

  return okResult({
    success: true,
    tsFileCount,
    scaffoldFileCount,
    fileList: isDryRun ? allFiles : undefined,
  });
}

export const emitTs = wrapTool(emitTsImpl);
