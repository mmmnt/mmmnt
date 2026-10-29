/**
 * moment_validate — Parse and validate a .moment file, or a model directory as one project.
 */

import { loadModel, okResult, wrapTool } from './shared.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

interface ValidateParams {
  filePath: string;
}

async function validateImpl(params: ValidateParams): Promise<CallToolResult> {
  const result = await loadModel(params.filePath);

  const diagnostics = result.diagnostics.map((d) => ({
    severity: d.severity,
    message: d.message,
    ...(d.ruleId ? { ruleId: d.ruleId } : {}),
    ...(d.source ? { source: d.source } : {}),
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
    files: result.files.length,
    diagnostics,
  });
}

export const validate = wrapTool(validateImpl);
