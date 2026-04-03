/**
 * Shared helpers for MCP tool implementations.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export function readMomentFile(filePath: string): string {
  const resolved = resolve(filePath);
  if (!existsSync(resolved)) {
    throw new Error(`File not found: ${resolved}`);
  }
  return readFileSync(resolved, 'utf-8');
}

export function okResult(data: unknown): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  };
}

export function errorResult(
  errorCode: string,
  message: string,
  context?: Record<string, unknown>,
): CallToolResult {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({ errorCode, message, context: context ?? {} }, null, 2),
      },
    ],
    isError: true,
  };
}

export function wrapTool<T>(
  fn: (params: T) => Promise<CallToolResult>,
): (params: T) => Promise<CallToolResult> {
  return async (params: T): Promise<CallToolResult> => {
    try {
      return await fn(params);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return errorResult('TOOL_ERROR', message);
    }
  };
}
