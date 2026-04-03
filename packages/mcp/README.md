# @mmmnt/mcp

Model Context Protocol server exposing Moment domain services as AI agent tools.

[![License: FSL-1.1-Apache-2.0](https://img.shields.io/badge/License-FSL--1.1--Apache--2.0-blue.svg)](../../LICENSE.md)
[![npm version](https://img.shields.io/npm/v/@mmmnt/mcp.svg)](https://www.npmjs.com/package/@mmmnt/mcp)

## Overview

`@mmmnt/mcp` exposes the Moment toolchain as a local Model Context Protocol server, enabling AI coding assistants like Claude, Copilot, and Cursor to parse specifications, generate code, detect drift, and reconcile changes through structured tool calls. The server communicates over stdio and requires no account or network access -- it runs fully offline.

The server wraps 7 tools covering the core Moment workflow: validation, project status, visualization, event inspection, Sift import, TypeScript emission, and cascade reconciliation. Each tool accepts structured JSON input and returns structured JSON output per the MCP protocol, with consistent error handling that never crashes on invalid input.

This package is the recommended integration point for AI-assisted domain-driven development workflows. While `@mmmnt/cli` serves interactive terminal use, `@mmmnt/mcp` provides the same capabilities in a format optimized for programmatic consumption by language model agents.

**Transport:** stdio | **No account required** -- runs fully offline.

## Quick Start

```bash
# Install globally
npm install -g @mmmnt/mcp

# Or run directly via npx
npx @mmmnt/mcp
```

The server starts on stdio and waits for MCP protocol messages on stdin/stdout.

## Connecting to the Server

### Claude Code / Claude Desktop

Add to your MCP configuration (`~/.claude/claude_desktop_config.json` or project `.mcp.json`):

```json
{
  "mcpServers": {
    "moment": {
      "command": "npx",
      "args": ["@mmmnt/mcp"]
    }
  }
}
```

### VS Code (Copilot MCP)

Add to `.vscode/settings.json`:

```json
{
  "mcp": {
    "servers": {
      "moment": {
        "command": "npx",
        "args": ["@mmmnt/mcp"]
      }
    }
  }
}
```

### Cursor

Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "moment": {
      "command": "npx",
      "args": ["@mmmnt/mcp"]
    }
  }
}
```

### From Source (Development)

```bash
# Build the MCP server
pnpm turbo build --filter=@mmmnt/mcp

# Run directly
node packages/mcp/dist/mcp.mjs
```

## Tools

### `moment_validate` (Read)

Parse and validate a `.moment` specification file.

```
Input:  { filePath: string }
Output: { success, contextCount, flowCount, diagnostics[] }
```

Use to check if a `.moment` file is syntactically and semantically valid before running other tools.

### `moment_status` (Read)

Get unified project status — parse validity, implementation sync drift, schema lifecycle (deprecated fields), and upstream source fingerprint.

```
Input:  { filePath: string }
Output: { success, hasDrift, sections: [{ label, state, summary }] }
```

Use to assess overall project health at a glance.

### `moment_viz` (Read)

Generate visualization data (context map + timeline layout) as structured JSON. Does not start an HTTP server.

```
Input:  { filePath: string }
Output: VizDataEnvelope JSON (context map nodes, edges, timeline entries)
```

Use to get visualization data for diagrams without a browser.

### `moment_get_events` (Read)

Read local Moment event signals from `.complai/events/moment/`.

```
Input:  { projectDir: string, limit?: number, since?: string }
Output: { success, eventCount, events[] }
```

Use to inspect reconciliation history and event signals.

### `moment_import` (Write)

Import Sift JSONL event streams from `.domain/` into `.moment` specification files. Writes upstream fingerprint for drift tracking.

```
Input:  { domainDir: string, outputDir?: string }
Output: { success, contextsImported, filesWritten, eventsProcessed }
```

Use when upstream Sift specification has been updated and `.moment` files need regeneration.

### `moment_emit_ts` (Write)

Generate TypeScript type definitions and test scaffolds from a `.moment` specification.

```
Input:  { filePath: string, dryRun?: boolean }
Output: { success, tsFileCount, scaffoldFileCount, fileList? }
```

Use when TypeScript artifacts need regeneration after spec changes. Pass `dryRun: true` to preview files without writing.

### `moment_reconcile` (Write)

Run cascade reconciliation. Classifies upstream drift as APPLIED (Category 1), DRIFT (Category 2), or BREAKING (Category 3).

```
Input:  { filePath: string, mode?: "local" | "event", eventPath?: string }
Output: { success, outcome, category?, message }
```

Use after upstream changes to determine what reconciliation actions are needed.

## Error Handling

All tools return structured errors when something goes wrong — the server never crashes on invalid input:

```json
{
  "errorCode": "FILE_NOT_FOUND",
  "message": "File not found: /path/to/spec.moment",
  "context": {}
}
```

Error codes: `FILE_NOT_FOUND`, `PARSE_FAILED`, `IMPORT_FAILED`, `MISSING_EVENT_PATH`, `INVALID_EVENT`, `NO_EVENTS_DIR`, `TOOL_ERROR`.

## Testing

### Manual Smoke Test

```bash
# Build
pnpm turbo build --filter=@mmmnt/mcp

# List available tools
echo '{"jsonrpc":"2.0","method":"tools/list","id":1}' | node packages/mcp/dist/mcp.mjs

# Call a tool
echo '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"moment_validate","arguments":{"filePath":"fixtures/valid/unified/vet-clinic.moment"}},"id":2}' | node packages/mcp/dist/mcp.mjs
```

### Unit Tests

```bash
# Run MCP package tests
pnpm --filter @mmmnt/mcp test

# With coverage
pnpm --filter @mmmnt/mcp test -- --coverage
```

### Full Monorepo Validation

```bash
pnpm turbo test -- --coverage --passWithNoTests
```

## Architecture

The MCP server imports domain services directly from workspace packages — no shell-out to the `moment` CLI binary:

```
@mmmnt/mcp
  ├── @mmmnt/core      (MomentParser, SiftSpecificationImporter)
  ├── @mmmnt/derive    (deriveTopology)
  ├── @mmmnt/emit-ts   (TypeScriptEmitter, TestScaffoldEmitter)
  ├── @mmmnt/viz       (VizEmitter)
  ├── @mmmnt/sync      (ASTDiffEngine, SiftEventStreamReader)
  └── @mmmnt/schema    (SchemaRegistry)
```

Each tool callback is wrapped in `wrapTool()` for exception safety. All results are JSON-serialized `CallToolResult` objects per the MCP protocol.

## Installation

```bash
# Install globally
npm install -g @mmmnt/mcp

# Or run directly via npx
npx @mmmnt/mcp
```

## Integration

`@mmmnt/mcp` imports domain services directly from workspace packages -- it does not shell out to the `moment` CLI binary. It depends on:

- **@mmmnt/core** for parsing and Sift specification import
- **@mmmnt/derive** for test topology derivation
- **@mmmnt/emit-ts** for TypeScript code and test scaffold generation
- **@mmmnt/viz** for visualization data generation
- **@mmmnt/sync** for AST diffing and Sift event stream reading
- **@mmmnt/schema** for schema lifecycle status

For interactive terminal use, see [@mmmnt/cli](../cli/README.md) which provides the same capabilities as shell commands.

## Key Features

- **7 structured tools** -- covers the full Moment workflow: validation, status, visualization, event inspection, import, TypeScript emission, and reconciliation.
- **Stdio transport** -- communicates over stdin/stdout per the MCP protocol specification, compatible with all MCP-aware clients.
- **Fully offline** -- requires no account, API keys, or network access. All operations run against local files.
- **Exception-safe** -- every tool callback is wrapped in `wrapTool()` for guaranteed structured error responses. The server never crashes on invalid input.
- **Structured JSON output** -- all tool responses are JSON-serialized `CallToolResult` objects per the MCP protocol, making them easy for agents to parse.
- **Read/Write annotations** -- tools are annotated as Read or Write per the MCP specification, so agents can reason about side effects before calling them.
- **Multi-client support** -- tested with Claude Code, Claude Desktop, VS Code Copilot, and Cursor.
- **Direct library imports** -- imports domain services directly from workspace packages rather than shelling out to the CLI binary, avoiding process overhead.

## Contributing

This package is part of the [mmmnt monorepo](https://github.com/mmmnt/mmmnt). See the repository root for contribution guidelines, development setup, and the code of conduct.

```bash
git clone https://github.com/mmmnt/mmmnt.git
cd mmmnt
pnpm install
pnpm turbo build --filter=@mmmnt/mcp
pnpm --filter @mmmnt/mcp test
```

## License

[FSL-1.1-Apache-2.0](../../LICENSE.md)

## ADR References

- [ADR-022 §4](https://winnovation.atlassian.net/wiki/spaces/MMMNT/pages/23396354) — MCP server specification, 7 tools, tool descriptions
- [ADR-028](https://winnovation.atlassian.net/wiki/spaces/MMMNT/pages/47742977) — JSONL event stream format for Sift import
- [ADR-013](https://winnovation.atlassian.net/wiki/spaces/MMMNT/pages/12451841) — FSL-1.1-Apache-2.0 license
