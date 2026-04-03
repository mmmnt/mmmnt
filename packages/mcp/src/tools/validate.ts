/**
 * moment_validate — Parse and validate a .moment specification file.
 */

import { MomentParser } from '@mmmnt/core';
import { readMomentFile, okResult, wrapTool } from './shared.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

interface ValidateParams {
  filePath: string;
}

async function validateImpl(params: ValidateParams): Promise<CallToolResult> {
  const content = readMomentFile(params.filePath);
  const parser = new MomentParser();
  const result = await parser.parseContent(content);

  const diagnostics = result.diagnostics.map((d) => ({
    severity: d.severity,
    message: d.message,
  }));

  if (!result.success) {
    return okResult({
      success: false,
      contextCount: 0,
      flowCount: 0,
      diagnostics,
    });
  }

  const ir = result.ir!;
  return okResult({
    success: true,
    contextCount: ir.contexts.length,
    flowCount: ir.flows.length,
    diagnostics,
  });
}

export const validate = wrapTool(validateImpl);
