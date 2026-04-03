/**
 * @mmmnt/mcp — Local MCP server for Moment (ADR-022 §4)
 *
 * 7 MCP tools wrapping Moment domain services.
 * No shell-out — imports domain services programmatically.
 * stdio transport (primary). Design Principle #15 — no network calls.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerTools } from './tools/index.js';

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: 'moment',
    version: '0.0.0',
  });

  registerTools(server);

  return server;
}

export async function startStdioServer(): Promise<void> {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
