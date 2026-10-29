# @mmmnt/cli

Command-line interface for the Moment domain specification language and implementation toolchain.

[![License: FSL-1.1-Apache-2.0](https://img.shields.io/badge/License-FSL--1.1--Apache--2.0-blue.svg)](../../LICENSE.md)
[![npm version](https://img.shields.io/npm/v/@mmmnt/cli.svg)](https://www.npmjs.com/package/@mmmnt/cli)

## Overview

`@mmmnt/cli` provides the `moment` command, which is the primary way most developers interact with the Moment toolchain. It wraps every package in the `@mmmnt` ecosystem behind a consistent, discoverable command-line interface with 20+ commands covering the full specification-to-implementation workflow.

From initializing a new project to parsing specifications, deriving test topologies, generating TypeScript code and BDD scenarios, running structural test suites, detecting and deciding implementation drift, and reporting schema lifecycles -- every operation is available as a single CLI command. The CLI handles file I/O, output formatting, error reporting, and watch mode so that the underlying library packages remain focused on their core logic.

The CLI is designed for both interactive development and CI/CD pipeline integration. Exit codes follow standard conventions for use in automated workflows, and many commands support the `--json` flag for machine-readable output; see the Common Options table below for details.

## Installation

Requires Node.js 22 or later.

```bash
# Install globally
npm install -g @mmmnt/cli

# Or run directly without installing
npx @mmmnt/cli

# Or install as a project dev dependency
npm install --save-dev @mmmnt/cli
```

Or with other package managers:

```bash
pnpm add -g @mmmnt/cli
yarn global add @mmmnt/cli
```

## Quick Start

```bash
# Initialize a new Moment project
moment init --name my-service

# Parse and validate a .moment specification
moment parse specs/my-service.moment

# Or parse a whole model directory as one project
moment parse specs/

# Derive the test topology
moment derive specs/my-service.moment

# Generate TypeScript types and test scaffolds
moment emit-ts specs/my-service.moment

# Generate Gherkin features, the specification document, TypeScript, and test scaffolds
moment generate specs/my-service.moment

# Run the derived test suites as structural checks
moment test specs/my-service.moment

# Watch the manifest's paths and regenerate on change
moment watch
```

## Key Features

- **Unified entry point** -- a single `moment` binary that wraps all `@mmmnt` packages, so you do not need to import or configure individual libraries.
- **20+ commands** -- covers the full lifecycle from project initialization through specification, derivation, generation, testing, synchronization, and governance.
- **Project mode** -- every command documented below with `<file|dir>`, plus `serve --project`, accepts a model directory and loads every `.moment` file beneath it as one merged project.
- **Watch mode** -- monitors `.moment` files and automatically re-parses and regenerates artifacts on save.
- **Structured output** -- many commands support `--json` for machine-readable output in CI/CD pipelines.
- **Standard exit codes** -- non-zero exit on parse or validation errors, failing structural tests, and (for `moment status`) detected drift, for pipeline gating.
- **Subcommand structure** -- `sync` and `schema` use subcommands (`sync status`, `sync propose`, `sync accept`, `sync reject`, `schema status`) for organized workflows.
- **Authentication support** -- `moment auth` subcommands manage GitHub and quorum credentials.
- **Verbose mode** -- `moment status --verbose` enables detailed output for the unified status command.

## Project Mode

Pass a directory where a command takes `<file|dir>` (or to `serve --project`) and the CLI loads every `.moment` file beneath it, in sorted path order, as one merged project. Names resolve across files, and node placement, saga transitions and External lanes are checked over the whole model.

The model rules V22–V37 (see [@mmmnt/core](../core/README.md#validation-rules)) are warnings when a file is parsed alone and errors over a project, and a project fails on any file's error. After upgrading, run:

```bash
moment parse specs/
```

## Commands

### Project Initialization

| Command | Description |
|---------|-------------|
| `moment init --name <name>` | Initialize a new Moment project with `.manifest.yaml`, `.moment/contexts/`, and `.moment/flows/` directories. Optionally specify `--dir <path>` for the target directory (defaults to `.`). Refuses to overwrite an existing manifest. |

### Specification

| Command | Description |
|---------|-------------|
| `moment parse <file\|dir>` | Parse and validate a `.moment` specification file or a model directory. Reports syntax errors and validation diagnostics with line and column positions. |
| `moment watch` | Watch the paths in `.manifest.yaml` (default `.moment/contexts`, `.moment/flows`, `.moment`) and, on each successful re-parse, re-run `generate` and `emit-ts` for the changed file. `--dir <path>` sets the project directory (defaults to `.`); `--no-generate` only re-parses. Runs until interrupted. |

### Derivation

| Command | Description |
|---------|-------------|
| `moment derive <file\|dir>` | Derive the test suite topology from a specification and report its suite and case counts. `--json` prints the topology. |
| `moment simulate <file\|dir>` | Generate simulation scenarios and report event flow traces. Supports `--all` to generate all branch combinations plus negative (precondition violation) scenarios, `--flow <name>` to select one flow, `--json`, and `--out-dir <path>` (alias `--out`) to write per-flow topology files, individual scenario files, `manifest.json`, and ADR-029 artifacts (`event-catalog.json`, `impact-analysis.json`, `saga-state-machines.json`, `policy-definitions.json`, `asyncapi.yaml`). |

### Code Generation

| Command | Description |
|---------|-------------|
| `moment cucumber-json <file\|dir>` | Output Cucumber JSON to stdout for Xray import. Useful for integrating Moment-derived scenarios into Jira/Xray test management workflows. |
| `moment emit-ts <file\|dir>` | Generate TypeScript types, aggregate files, read-model types, and test scaffold files from the specification. `--dry-run` lists the files without writing them. |
| `moment generate <file\|dir>` | Generate Gherkin `.feature` files, a `specification.md` document with Mermaid diagrams, TypeScript types, and test scaffolds. |

### Testing

| Command | Description |
|---------|-------------|
| `moment test <file\|dir>` | Run the derived test suites as structural checks against the specification and report passed, failed, and skipped counts. Non-zero exit code on failures. |

### Visualization

| Command | Description |
|---------|-------------|
| `moment viz <file\|dir>` | Generate visualization data (context maps, flow timelines) as a JSON `VizDataEnvelope`. Output can be piped to files or visualization tools. |
| `moment serve <file\|facet-dir>` | Serve topology and scenarios over WebSocket (Facet bridge). A file is parsed and derived live; a directory is a `moment simulate --out-dir` folder. `--project <dir>` serves a model directory as one project. |

### Synchronization

| Command | Description |
|---------|-------------|
| `moment sync status <file\|dir>` | Detect drift between the specification and implementation by comparing generated and actual TypeScript files. Exits 1 when the implementation has drifted, so CI can gate on it; the report still prints on stdout (`--json` too) for callers that only want to read it. |
| `moment sync propose <file\|dir>` | Record a proposal for each new drift in `.domain/sync-state.jsonl` and print every pending proposal with its id. A proposal's id is derived from its drift (`prop-` + 16 hex of sha256), so re-running records only new drift, leaves pending proposals whose drift remains untouched, and supersedes those whose drift is gone. Accepted and rejected proposals are never touched. `--auto-accept` is refused. |
| `moment sync accept <file\|dir> (<proposal-id>... \| --all)` | Accept pending proposals. Every named id must be pending or the whole run is refused, naming each id and its status; `--all` with nothing pending says so and exits zero. Records the decision with the repo's git `user.email` as actor, exactly one `ImplementationFeedbackRecorded` per accepted proposal, and one push-flow saga; commits only the three `.domain/` logs to the local repo, then advances the sync cursor in a second commit. Prints the spec edit each proposal implies (e.g. ``add field `note: string` to value-object `OrderItem` ``) with the file and line declaring the construct. Never edits a `.moment` or `.ts` file, never pushes. |
| `moment sync reject <file\|dir> <proposal-id>... --reason "<why>"` | Reject pending proposals with a required reason. Same all-or-nothing check, actor, saga and local commits as accept; records no feedback. |
| `moment reconcile <file\|dir> (--local \| --event <path>)` | Run cascade reconciliation to classify upstream drift. `--local` classifies against the local `.domain/` Sift export; `--event <path>` classifies against a cascade event file. Exactly one of the two is required. |
| `moment status <file\|dir>` | Display unified project status: parse validity, sync drift, schema lifecycle, and upstream fingerprint. Non-zero exit code on errors or drift. |

Sync keeps three append-only logs in `.domain/`, beside the spec file or inside the model directory: `sync-state.jsonl` (proposals, decisions and the cursor), `implementation-feedback.jsonl`, and `push-flow-saga.jsonl`. Every sync command replays them and refuses a corrupted log, naming the file and line; a refused run writes nothing. `accept` and `reject` need a git repository whose own config sets `user.name` and `user.email`, with at least one commit (the feedback's `commitRef` is that HEAD). If the local commit fails, the records stay appended, the saga is recorded as aborted, the cursor does not move, and the command exits non-zero.

### Schema Governance

| Command | Description |
|---------|-------------|
| `moment schema status <file\|dir>` | Display the lifecycle phase and consumer count of every event field in the specification. |
| `moment lint <file\|dir>` | Collect parse diagnostics, implementation drift warnings, and deprecated-field warnings into one report. Only parse errors produce a non-zero exit. Supports `--json` for CI integration. |

### Import

| Command | Description |
|---------|-------------|
| `moment import --from-sift <dir>` | Import Sift JSONL event streams from a `.domain/` directory into `.moment` context files under `.moment/contexts/`. Writes an upstream fingerprint to `.moment/.upstream-fingerprint.json` for drift tracking. Output goes beside the `.domain/` directory unless `--output-dir` is given. |

### Authentication

| Command | Description |
|---------|-------------|
| `moment auth login` | Authenticate with GitHub through the OAuth device flow: open the printed URL and enter the code. |
| `moment auth status` | Display current authentication status. |
| `moment auth logout` | Clear stored authentication credentials. |
| `moment auth quorum --token <jwt> [--server <url>]` | Store quorum credentials (`--logout` removes them). `QUORUM_TOKEN` in the environment works without storing. |

### Quorum

| Command | Description |
|---------|-------------|
| `moment quorum watch <stream>` | Subscribe to a quorum stream and append its entries as JSONL under `.domain/`. Supports `--server <url>`, `--out <dir>`, `--interval <ms>`, `--source <name>`, and `--once`. |

Run `moment --help` for the full command list.

## Common Options

These are commonly used options available on the commands indicated, not globally on every command. Individual commands may support additional command-specific flags not listed here.

| Option | Available on | Description |
|--------|-------------|-------------|
| `--json` | derive, simulate, lint, schema status, sync status/propose, reconcile, status, import | Machine-readable JSON output to stdout. |
| `--out <dir>` | generate, emit-ts | Override the output directory for generated artifacts (defaults to the directory of the nearest `.manifest.yaml`, else cwd). `generate` also accepts `--out-dir`. |
| `--out-dir <dir>` | simulate | Write topology, scenario, and artifact files to the specified directory (`--out` is an alias). |
| `--output-dir <dir>` | import --from-sift | Write imported `.moment` files to the specified directory. |
| `--flow <name>` | simulate | Simulate only the named flow. |
| `--all` | simulate, serve | Generate all branch combinations and negative scenarios (simulate) or serve all scenarios including negatives (serve). |
| `--all` | sync accept | Accept every pending proposal. |
| `--reason <why>` | sync reject | Why the proposals are rejected (required). |
| `--local` / `--event <path>` | reconcile | Classify against the local `.domain/` export, or against a cascade event file. |
| `--dry-run` | emit-ts | List files that would be emitted without writing them. |
| `--dir <path>` | init, watch | Target project directory (defaults to `.`). |
| `--verbose` / `--quiet` | status | More or less detailed output. |
| `--port <n>` | serve | WebSocket port (default 4321). |
| `--project <dir>` | serve | Load every `.moment` file beneath `<dir>` as one model project (ADR-038). Without it, a directory argument is a `moment simulate --out-dir` folder. |

## Examples

### New Project Setup

```bash
# Scaffold a new project
moment init --name my-service --dir my-service
cd my-service

# Write your .moment specifications under .moment/, then generate everything
moment parse .moment/
moment derive .moment/
moment generate .moment/
```

### Continuous Development

```bash
# Watch mode regenerates on every save
moment watch

# Run the derived structural test suites
moment test specs/my-service.moment

# Check overall status, including drift
moment status specs/my-service.moment
```

### Upstream Specification Import

```bash
# Import from Sift event streams
moment import --from-sift .domain/

# Review the generated .moment files, then derive and generate
moment derive .moment/
moment emit-ts .moment/
```

### CI/CD Pipeline

```bash
#!/bin/bash
set -e

# Validate the whole model as one project
moment parse specs/

# Gate on drift (non-zero exit code on drift or errors)
moment status specs/

# Run structural test suites
moment test specs/

# Lint (non-zero exit only on parse errors)
moment lint specs/ --json

# Generate documentation artifacts
moment generate specs/
```

### Drift Detection and Reconciliation

```bash
# Check sync status
moment sync status specs/my-service.moment

# Record proposals for detected drift; prints pending proposal ids
moment sync propose specs/my-service.moment

# Decide them: accept (prints the spec edit to make, and where) or reject
moment sync accept specs/my-service.moment prop-4b1a1efced680463
moment sync reject specs/my-service.moment prop-9c03d2e1aa7f5b10 --reason "local workaround"

# Or classify upstream drift against the local .domain/ export
moment reconcile specs/my-service.moment --local
```

### Schema Governance Audit

```bash
# View schema lifecycle status
moment schema status specs/my-service.moment

# Lint parse, drift, and schema lifecycle diagnostics
moment lint specs/my-service.moment

# Machine-readable output for dashboards
moment schema status specs/my-service.moment --json
moment lint specs/my-service.moment --json
```

## Integration

`@mmmnt/cli` is the consumer-facing interface to the entire Moment toolchain. It depends on all library packages:

```
@mmmnt/cli
  |
  +-- @mmmnt/core      (parsing, project loading, and IR generation)
  +-- @mmmnt/derive    (test topology and scenario derivation)
  +-- @mmmnt/emit-ts   (TypeScript code generation)
  +-- @mmmnt/generate  (Gherkin, specification documents, AsyncAPI)
  +-- @mmmnt/harness   (test execution)
  +-- @mmmnt/schema    (schema lifecycle governance)
  +-- @mmmnt/sync      (drift detection, proposals, and reconciliation)
  +-- @mmmnt/viz       (visualization data generation)
```

For programmatic integration or AI agent workflows, see [@mmmnt/mcp](../mcp/README.md), which exposes core Moment operations over the Model Context Protocol.

## Contributing

This package is part of the [mmmnt monorepo](https://github.com/mmmnt/mmmnt). See the repository root for contribution guidelines, development setup, and the code of conduct.

```bash
git clone https://github.com/mmmnt/mmmnt.git
cd mmmnt
pnpm install
pnpm turbo build --filter=@mmmnt/cli
pnpm --filter @mmmnt/cli test
```

## License

[FSL-1.1-Apache-2.0](../../LICENSE.md)
