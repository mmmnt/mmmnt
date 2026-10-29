/**
 * Shared helpers for MCP tool implementations.
 */

import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { isDirectory, loadSpecification, type LoadedSpecification } from '@mmmnt/core';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/**
 * Load a model the way the CLI does: a `.moment` file, or every `.moment` file beneath a directory
 * as one project (ADR-038 project mode). Diagnostics carry the file they come from.
 */
export async function loadModel(filePath: string): Promise<LoadedSpecification & { path: string }> {
  const path = resolve(filePath);
  if (!existsSync(path)) {
    throw new Error(`File not found: ${path}`);
  }
  return { ...(await loadSpecification(path)), path };
}

/** The directory a model's `.domain/` and project files sit in: the model directory, or a file's parent. */
export const projectDirOf = (path: string): string => (isDirectory(path) ? path : dirname(path));

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
