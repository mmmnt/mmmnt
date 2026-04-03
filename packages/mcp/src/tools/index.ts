/**
 * Tool barrel — registers all 7 MCP tools on the McpServer instance.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { validate } from './validate.js';
import { status } from './status.js';
import { viz } from './viz.js';
import { getEvents } from './get-events.js';
import { importSift } from './import.js';
import { emitTs } from './emit-ts.js';
import { reconcile } from './reconcile.js';

export function registerTools(server: McpServer): void {
  server.tool(
    'moment_validate',
    'Parse and validate a .moment specification file. Returns parsed IR summary with context count, flow count, and any diagnostics. Use to check if a .moment file is valid before running other tools.',
    { filePath: z.string() },
    { readOnlyHint: true, idempotentHint: true },
    (params) => validate(params),
  );

  server.tool(
    'moment_status',
    'Get unified project status for a .moment specification. Checks parse validity, implementation sync drift, schema lifecycle, and upstream source fingerprint. Use to assess overall project health.',
    { filePath: z.string() },
    { readOnlyHint: true, idempotentHint: true },
    (params) => status(params),
  );

  server.tool(
    'moment_viz',
    'Generate visualization data from a .moment specification. Produces context map and timeline layout as structured JSON without starting an HTTP server. Use to get visualization data for diagrams.',
    { filePath: z.string() },
    { readOnlyHint: true },
    (params) => viz(params),
  );

  server.tool(
    'moment_get_events',
    'Read local Moment event signals from .complai/events/moment/. Returns event records sorted newest-first with optional time filtering. Use to inspect reconciliation history and event signals.',
    {
      projectDir: z.string(),
      limit: z.number().optional().default(50),
      since: z.string().optional(),
    },
    { readOnlyHint: true, idempotentHint: true },
    (params) => getEvents(params),
  );

  server.tool(
    'moment_import',
    'Import Sift JSONL event streams into .moment specification files. Reads .domain/*.jsonl and writes .moment context files plus upstream fingerprint. Use when upstream Sift specification has been updated.',
    {
      domainDir: z.string(),
      outputDir: z.string().optional(),
    },
    (params) => importSift(params),
  );

  server.tool(
    'moment_emit_ts',
    'Generate TypeScript type definitions and test scaffolds from a .moment specification. Chains parse, derive, and emit. Use when TypeScript artifacts need regeneration after spec changes.',
    {
      filePath: z.string(),
      dryRun: z.boolean().optional().default(false),
    },
    (params) => emitTs(params),
  );

  server.tool(
    'moment_reconcile',
    'Run cascade reconciliation against a .moment specification. Classifies drift as APPLIED (Category 1), DRIFT (Category 2), or BREAKING (Category 3). Use after upstream changes to determine reconciliation actions.',
    {
      filePath: z.string(),
      mode: z.enum(['local', 'event']).default('local'),
      eventPath: z.string().optional(),
    },
    (params) => reconcile(params),
  );
}
