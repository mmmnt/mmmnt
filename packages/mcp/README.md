# @mmmnt/mcp

Model Context Protocol server exposing Moment domain services as AI agent tools.

[![License: FSL-1.1-Apache-2.0](https://img.shields.io/badge/License-FSL--1.1--Apache--2.0-blue.svg)](../../LICENSE.md)
[![npm version](https://img.shields.io/npm/v/@mmmnt/mcp.svg)](https://www.npmjs.com/package/@mmmnt/mcp)

## Overview

`@mmmnt/mcp` exposes the Moment toolchain as a local Model Context Protocol server, enabling AI coding assistants like Claude, Copilot, and Cursor to validate specifications, check project status and drift, plan TypeScript emission, import upstream specifications, and reconcile changes through structured tool calls. The server communicates over stdio and requires no account or network access -- it runs fully offline.

The server registers 7 tools covering the core Moment workflow: validation, project status, visualization, event inspection, Sift import, TypeScript emission, and cascade reconciliation. Each tool accepts structured JSON input and returns structured JSON output per the MCP protocol, with consistent error handling that never crashes on invalid input.

This package is the recommended integration point for AI-assisted domain-driven development workflows. While `@mmmnt/cli` serves interactive terminal use, `@mmmnt/mcp` provides core Moment operations in a format optimized for programmatic consumption by language model agents.

**Transport:** stdio | **No account required** -- runs fully offline. | **Requires** Node.js 22 or later.

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

Add to your MCP configuration (a project `.mcp.json` for Claude Code, or `claude_desktop_config.json` for Claude Desktop):

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

Tools marked **(Read)** carry the MCP `readOnlyHint` annotation. Tools that take a `filePath` accept a single `.moment` file or a model directory, which is loaded as one project exactly as `@mmmnt/cli` loads it (`.domain/` is then read from that directory). Diagnostics carry their `ruleId` and source; the V22–V39 model rules are warnings for a single file and errors over a project (see [@mmmnt/core](../core/README.md#validation-rules)).

### `moment_validate` (Read)

Parse and validate a `.moment` specification file.

```
Input:  { filePath: string }
Output: { success, contextCount, flowCount, diagnostics[] }
```

Use to check if a `.moment` file is syntactically and semantically valid before running other tools. Each diagnostic carries `severity` and `message`.

### `moment_status` (Read)

Get unified project status — parse validity, implementation sync drift, schema lifecycle (deprecated fields), and upstream source fingerprint.

```
Input:  { filePath: string }
Output: { success, hasDrift, sections: [{ label, state, summary, details? }] }
```

Use to assess overall project health at a glance. Drift detection needs the file to sit inside a git repository.

### `moment_viz` (Read)

Generate visualization data (context map + timeline layout) as structured JSON. Does not start an HTTP server.

```
Input:  { filePath: string }
Output: VizDataEnvelope JSON (context map nodes, edges, timeline entries)
```

Use to get visualization data for diagrams without a browser.

### `moment_get_events` (Read)

Read local Moment event signals from `.complai/events/moment/`, newest first.

```
Input:  { projectDir: string, limit?: number (default 50), since?: string }
Output: { success, eventCount, events[] }
```

Use to inspect reconciliation history and event signals. `since` keeps events whose timestamp is at or after it.

### `moment_import` (Write)

Import Sift JSONL event streams from `.domain/` into `.moment` context files under `<outputDir>/.moment/contexts/`, and write the upstream fingerprint to `<outputDir>/.moment/.upstream-fingerprint.json`. `outputDir` defaults to the parent of `domainDir`.

```
Input:  { domainDir: string, outputDir?: string }
Output: { success, contextsImported, filesWritten, eventsProcessed }
```

Use when upstream Sift specification has been updated and `.moment` files need regeneration.

### `moment_emit_ts`

Plan TypeScript type definitions and test scaffolds for a `.moment` specification (parse, derive, emit). The tool reports what would be emitted and writes no files; use `moment emit-ts` or `moment generate` from `@mmmnt/cli` to write them.

```
Input:  { filePath: string, dryRun?: boolean (default false) }
Output: { success, tsFileCount, scaffoldFileCount, fileList? }
```

Use to check which TypeScript artifacts a spec change affects. Pass `dryRun: true` to include the file list.

### `moment_reconcile` (Write)

Run cascade reconciliation. Classifies upstream drift as APPLIED (Category 1), DRIFT (Category 2), or BREAKING (Category 3), and records a `MomentReconcileCompleted` event in `.complai/events/moment/`. In `local` mode with no `.domain/` beside the spec, the outcome is `NO_CHANGES` and nothing is written.

```
Input:  { filePath: string, mode?: "local" | "event" (default "local"), eventPath?: string }
Output: { success, outcome, category?, message }
```

Use after upstream changes to determine what reconciliation actions are needed. `eventPath` is required in `event` mode.

## Error Handling

All tools return structured errors when something goes wrong — the server never crashes on invalid input:

```json
{
  "errorCode": "TOOL_ERROR",
  "message": "File not found: /path/to/spec.moment",
  "context": {}
}
```

Error codes: `PARSE_FAILED`, `IMPORT_FAILED`, `MISSING_EVENT_PATH`, `EVENT_NOT_FOUND`, `INVALID_EVENT`, `TOOL_ERROR` (any other failure, including a missing file).

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
  └── @mmmnt/sync      (ASTDiffEngine, LocalGitArtifactStore, SiftEventStreamReader)
```

Each tool callback is wrapped in `wrapTool()` for exception safety. All results are JSON-serialized `CallToolResult` objects per the MCP protocol.

## Installation

Requires Node.js 22 or later.

```bash
# Install globally
npm install -g @mmmnt/mcp

# Or run directly via npx
npx @mmmnt/mcp
```

## Integration

`@mmmnt/mcp` imports domain services directly from workspace packages -- it does not shell out to the `moment` CLI binary. Its tools use:

- **@mmmnt/core** for parsing and Sift specification import
- **@mmmnt/derive** for test topology derivation
- **@mmmnt/emit-ts** for TypeScript code and test scaffold generation
- **@mmmnt/viz** for visualization data generation
- **@mmmnt/sync** for AST diffing, git artifact reads, and Sift event stream reading

For interactive terminal use, model directories, and the `sync` proposal workflow, see [@mmmnt/cli](../cli/README.md).

## Key Features

- **7 structured tools** -- covers the core Moment workflow: validation, status, visualization, event inspection, import, TypeScript emission, and reconciliation.
- **Stdio transport** -- communicates over stdin/stdout per the MCP protocol specification, compatible with all MCP-aware clients.
- **Fully offline** -- requires no account, API keys, or network access. All operations run against local files.
- **Exception-safe** -- every tool callback is wrapped in `wrapTool()` for guaranteed structured error responses. The server never crashes on invalid input.
- **Structured JSON output** -- all tool responses are JSON-serialized `CallToolResult` objects per the MCP protocol, making them easy for agents to parse.
- **Read-only annotations** -- the four read tools carry the MCP `readOnlyHint`, so agents can tell them apart from tools with side effects before calling them.
- **Multi-client configuration** -- configuration examples for Claude Code, Claude Desktop, VS Code Copilot, and Cursor.
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
