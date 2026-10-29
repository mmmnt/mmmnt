/**
 * @mmmnt/mcp — Local MCP server for Moment (ADR-022 §4)
 *
 * 7 MCP tools wrapping Moment domain services.
 * No shell-out — imports domain services programmatically.
 * stdio transport (primary). Design Principle #15 — no network calls.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerTools } from './tools/index.js';

/** The package's own version: `package.json` sits one level above both `src/` and the `dist/` bundle. */
export function serverVersion(): string {
  try {
    const pkgPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version?: string };
    return pkg.version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: 'moment',
    version: serverVersion(),
  });

  registerTools(server);

  return server;
}

export async function startStdioServer(): Promise<void> {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
