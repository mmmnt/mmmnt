# @mmmnt/mcp

A Model Context Protocol server that exposes Moment as tools an AI agent can call.

[![License: FSL-1.1-Apache-2.0](https://img.shields.io/badge/License-FSL--1.1--Apache--2.0-blue.svg)](../../LICENSE.md)
[![npm version](https://img.shields.io/npm/v/@mmmnt/mcp.svg)](https://www.npmjs.com/package/@mmmnt/mcp)

## Overview

`@mmmnt/mcp` runs a local MCP server over stdio. It registers 7 tools: validate a model, report project status, produce visualization data, read local event signals, import a Sift export, plan TypeScript emission, and reconcile upstream drift. Each tool takes JSON arguments and returns JSON in a text content block.

The server reads and writes only local files. It needs no account and makes no network calls. It calls the `@mmmnt` libraries directly and does not shell out to the `moment` CLI.

The CLI does more: generation, simulation, boards, schemas and the `sync` proposal workflow are only in [@mmmnt/cli](../cli/README.md).

What changed in each release is in [CHANGELOG.md](CHANGELOG.md).

**Transport:** stdio. **Requires** Node.js 22 or later.

## Installation

```bash
# Run without installing
npx @mmmnt/mcp

# Or install globally; the command is `mcp`
npm install -g @mmmnt/mcp
```

The server starts on stdio and waits for MCP messages on stdin.

## Connecting a client

### Claude Code and Claude Desktop

Add to a project `.mcp.json` (Claude Code) or to `claude_desktop_config.json` (Claude Desktop):

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

### VS Code (Copilot)

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

### From source

```bash
pnpm turbo build --filter=@mmmnt/mcp
node packages/mcp/dist/mcp.mjs
```

The server reports itself as `moment`, with the package version.

## Tools

| Tool                | Inputs                                                                        | Annotations                      | Writes files |
| ------------------- | ----------------------------------------------------------------------------- | -------------------------------- | ------------ |
| `moment_validate`   | `filePath`                                                                    | `readOnlyHint`, `idempotentHint` | No           |
| `moment_status`     | `filePath`                                                                    | `readOnlyHint`, `idempotentHint` | No           |
| `moment_viz`        | `filePath`                                                                    | `readOnlyHint`                   | No           |
| `moment_get_events` | `projectDir`, `limit?` (default 50), `since?`                                 | `readOnlyHint`, `idempotentHint` | No           |
| `moment_import`     | `domainDir`, `outputDir?`                                                     | none                             | Yes          |
| `moment_emit_ts`    | `filePath`, `dryRun?` (default `false`)                                       | none                             | No           |
| `moment_reconcile`  | `filePath`, `mode?` (`"local"` or `"event"`, default `"local"`), `eventPath?` | none                             | Yes          |

A `filePath` is a single `.moment` file or a model directory. A directory is loaded as one project, as `@mmmnt/cli` loads it, and `.domain/`, `.moment/` and `.complai/` are then looked for inside that directory; for a file, beside it. The model-level validation rules are warnings for a single file and errors over a project (see [@mmmnt/core](../core/README.md#validation-rules)).

### `moment_validate`

Parse and validate the model.

```
Input:  { filePath: string }
Output: { success, contextCount, flowCount, files, diagnostics[] }
```

`files` is the number of `.moment` files loaded; it is left out when the model does not parse. Each diagnostic has `severity` and `message`, plus `ruleId` and `source` (file, line, column) when the rule gives them. For the TicketWave directory, `examples/ticketwave/spec/`, the result is 7 contexts, 8 flows, 1 file and no diagnostics.

### `moment_status`

Report four checks: specification validity, implementation sync, schema lifecycle, and the upstream Sift fingerprint.

```
Input:  { filePath: string }
Output: { success, hasDrift, sections: [{ label, state, summary, details? }] }
```

`state` is `ok`, `drift`, `warning` or `error`. Implementation sync compares the TypeScript the model implies with the files at the root of the enclosing git repository. Outside a git repository the section reads `Not available (no git repository)`. Schema lifecycle counts deprecated fields. Upstream source is `drift` when `.domain/` exists without `.moment/.upstream-fingerprint.json`. `hasDrift` is true when any section is `drift` or `error`.

### `moment_viz`

Produce the visualization data for the model. Starts no server.

```
Input:  { filePath: string }
Output: { sessionId, timestamp, version, contextMap, timeline, metadata }
```

The output is the `VizDataEnvelope` from [@mmmnt/viz](../viz/README.md). `sessionId` is derived from a hash of the model's files, so the same model gives the same id.

### `moment_get_events`

Read the event signals in `<projectDir>/.complai/events/moment/*.jsonl`, newest first.

```
Input:  { projectDir: string, limit?: number, since?: string }
Output: { success, eventCount, events[] }
```

`since` keeps events whose `timestamp` is at or after it. Lines that are not JSON, or have no `timestamp`, are skipped. With no event directory the result is an empty list. `moment_reconcile` and `moment reconcile` write these events.

### `moment_import`

Import the Sift JSONL event streams in `domainDir` as one `.moment` file per context.

```
Input:  { domainDir: string, outputDir?: string }
Output: { success, contextsImported, filesWritten, eventsProcessed }
```

Files go to `<outputDir>/.moment/contexts/<context>.moment`, and the fingerprint to `<outputDir>/.moment/.upstream-fingerprint.json`. `outputDir` defaults to the parent of `domainDir`. A missing directory, a directory with no events, or an import with errors returns `IMPORT_FAILED`. The fixture in `fixtures/valid/sift/domain` gives 4 contexts, 4 files and 56 events.

### `moment_emit_ts`

Plan the TypeScript types, aggregates and test scaffolds for the model. Writes no files; use `moment emit-ts` or `moment generate` to write them.

```
Input:  { filePath: string, dryRun?: boolean }
Output: { success, tsFileCount, scaffoldFileCount, fileList? }
```

`fileList`, the project-relative paths, is included only with `dryRun: true`. For TicketWave the counts are 40 and 21.

### `moment_reconcile`

Classify upstream drift as `APPLIED` (Category 1), `DRIFT` (Category 2) or `BREAKING` (Category 3).

```
Input:  { filePath: string, mode?: "local" | "event", eventPath?: string }
Output: { success, outcome, category?, message }
```

- `local` compares the model's contexts with the contexts in `.domain/`. A context in the model but not upstream is `BREAKING`; a context upstream but not in the model is `DRIFT`. With no `.domain/`, the outcome is `NO_CHANGES` and nothing is written.
- `event` reads the cascade event file at `eventPath` (required) and checks its `affectedElements` against the names of the model's contexts, aggregates, events and commands. Any unknown name is `DRIFT`; otherwise `APPLIED`.

Every outcome except `NO_CHANGES` writes a `MomentReconcileCompleted` event to `.complai/events/moment/`. `success` is false for `BREAKING`.

## Errors

A failed call returns `isError: true` and a JSON body:

```json
{
  "errorCode": "TOOL_ERROR",
  "message": "File not found: /nope.moment",
  "context": {}
}
```

| Code                 | When                                                                                |
| -------------------- | ----------------------------------------------------------------------------------- |
| `PARSE_FAILED`       | `moment_viz`, `moment_emit_ts` or `moment_reconcile` on a model that does not parse |
| `IMPORT_FAILED`      | `moment_import` finds no events, or the import has errors                           |
| `MISSING_EVENT_PATH` | `moment_reconcile` in `event` mode without `eventPath`                              |
| `EVENT_NOT_FOUND`    | The cascade event file does not exist                                               |
| `INVALID_EVENT`      | The cascade event file is not JSON                                                  |
| `TOOL_ERROR`         | Any other failure, including a `filePath` that does not exist                       |

`moment_validate` and `moment_status` on a model that does not parse are not errors: they return the diagnostics, or an `error` section.

## Testing

### Smoke test

From the repository root, after a build:

```bash
# List the tools
echo '{"jsonrpc":"2.0","method":"tools/list","id":1}' | node packages/mcp/dist/mcp.mjs

# Call one
echo '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"moment_validate","arguments":{"filePath":"examples/ticketwave/spec/ticketwave.moment"}},"id":2}' | node packages/mcp/dist/mcp.mjs
```

The call returns `{ "success": true, "contextCount": 7, "flowCount": 8, "files": 1, "diagnostics": [] }` as its text content.

### Unit tests

```bash
pnpm --filter @mmmnt/mcp test
pnpm --filter @mmmnt/mcp test -- --coverage
```

## Packages it uses

```
@mmmnt/mcp
  +-- @mmmnt/core      model and project loading, Sift import
  +-- @mmmnt/derive    test topology
  +-- @mmmnt/emit-ts   TypeScript types and test scaffolds
  +-- @mmmnt/viz       visualization envelope
  +-- @mmmnt/sync      drift detection, git artifact reads, Sift stream reading
```

Each tool is wrapped so that an exception becomes a `TOOL_ERROR` result instead of stopping the server.

## Contributing

This package is part of the [mmmnt monorepo](https://github.com/mmmnt/mmmnt). See the repository root for contribution guidelines and development setup.

```bash
git clone https://github.com/mmmnt/mmmnt.git
cd mmmnt
pnpm install
pnpm turbo build --filter=@mmmnt/mcp
pnpm --filter @mmmnt/mcp test
```

## License

[FSL-1.1-Apache-2.0](../../LICENSE.md)
