# @mmmnt/cli

Command-line interface for the Moment domain specification language and implementation toolchain.

[![License: FSL-1.1-Apache-2.0](https://img.shields.io/badge/License-FSL--1.1--Apache--2.0-blue.svg)](../../LICENSE.md)
[![npm version](https://img.shields.io/npm/v/@mmmnt/cli.svg)](https://www.npmjs.com/package/@mmmnt/cli)

## Overview

`@mmmnt/cli` provides the `moment` command, which is the primary way most developers interact with the Moment toolchain. It wraps every package in the `@mmmnt` ecosystem behind a consistent, discoverable command-line interface with 20+ commands covering the full specification-to-implementation workflow.

From initializing a new project to parsing specifications, deriving test topologies, generating TypeScript code and BDD scenarios, running conformance tests, detecting implementation drift, and managing schema lifecycles -- every operation is available as a single CLI command. The CLI handles file I/O, output formatting, error reporting, and watch mode so that the underlying library packages remain focused on their core logic.

The CLI is designed for both interactive development and CI/CD pipeline integration. All commands produce structured output suitable for scripting, and exit codes follow standard conventions for use in automated workflows. The `--format json` flag is available on most commands for machine-readable output, and `--verbose` enables detailed logging for debugging.

## Installation

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
moment init my-service

# Parse and validate a .moment specification
moment parse specs/my-service.moment

# Derive test topologies and scenarios
moment derive specs/my-service.moment

# Generate TypeScript types and test scaffolds
moment emit-ts specs/my-service.moment

# Generate Gherkin BDD scenarios
moment generate specs/my-service.moment

# Run specification conformance tests
moment test specs/my-service.moment

# Watch for spec changes and regenerate automatically
moment watch specs/
```

## Key Features

- **Unified entry point** -- a single `moment` binary that wraps all `@mmmnt` packages, so you do not need to import or configure individual libraries.
- **20+ commands** -- covers the full lifecycle from project initialization through specification, derivation, generation, testing, synchronization, and governance.
- **Watch mode** -- monitors `.moment` files and automatically re-parses and regenerates artifacts on save.
- **Structured output** -- all commands support `--format json` for machine-readable output in CI/CD pipelines.
- **Standard exit codes** -- non-zero exit on validation failures, drift detection, or test failures for pipeline gating.
- **Subcommand structure** -- complex operations like `sync` and `schema` use subcommands (`sync status`, `sync propose`, `sync accept`, `schema status`) for organized workflows.
- **Authentication support** -- `moment auth` subcommands manage credentials for Moment cloud services when applicable.
- **Verbose mode** -- `--verbose` enables detailed logging for debugging specification issues or generation failures.

## Commands

### Project Initialization

| Command | Description |
|---------|-------------|
| `moment init <name>` | Initialize a new Moment project with directory structure, `moment.manifest.json`, and a starter `.moment` specification file. |

### Specification

| Command | Description |
|---------|-------------|
| `moment parse <file>` | Parse and validate a `.moment` specification file. Reports syntax errors and semantic diagnostics with line numbers and column positions. |
| `moment watch <dir>` | Watch a directory for `.moment` file changes and automatically re-parse and regenerate artifacts. Runs until interrupted. |

### Derivation

| Command | Description |
|---------|-------------|
| `moment derive <file>` | Derive test topologies, simulation scenarios, event catalogs, impact analysis, and saga state machines from a specification. |
| `moment simulate <file>` | Run simulation scenarios against the specification and report event flow traces. |

### Code Generation

| Command | Description |
|---------|-------------|
| `moment emit-ts <file>` | Generate TypeScript interfaces, aggregate root classes, discriminated event union types, and test scaffold files from the specification. |
| `moment generate <file>` | Generate Gherkin `.feature` files, a `specification.md` document with Mermaid diagrams, and an `asyncapi.yaml` specification. |

### Testing

| Command | Description |
|---------|-------------|
| `moment test <file>` | Execute derived tests against your domain implementation and report conformance results. Non-zero exit code on failures. |

### Visualization

| Command | Description |
|---------|-------------|
| `moment viz <file>` | Generate visualization data (context maps, flow timelines) as a JSON `VizDataEnvelope`. Output can be piped to files or visualization tools. |

### Synchronization

| Command | Description |
|---------|-------------|
| `moment sync status <file>` | Detect drift between the specification and implementation by comparing generated and actual TypeScript files. Non-zero exit code on drift. |
| `moment sync propose <file>` | Generate change proposals to reconcile detected drift between specification and implementation. |
| `moment sync accept <file>` | Accept proposed changes and apply them to the implementation. |
| `moment reconcile <file>` | Run cascade reconciliation to classify and resolve drift. Supports `--mode local` and `--mode event` for different reconciliation sources. |
| `moment status <file>` | Display unified project status: parse validity, sync drift, schema lifecycle, and upstream fingerprint. |

### Schema Governance

| Command | Description |
|---------|-------------|
| `moment schema status <file>` | Display schema lifecycle status for all events and commands in the specification, grouped by phase. |
| `moment lint <file>` | Run codex governance rules against the specification and report policy violations. Supports `--format json` for CI integration. |

### Import

| Command | Description |
|---------|-------------|
| `moment import --from-sift <dir>` | Import Sift JSONL event streams from a `.domain/` directory into `.moment` specification files. Writes upstream fingerprint for drift tracking. |

### Authentication

| Command | Description |
|---------|-------------|
| `moment auth login` | Authenticate with Moment cloud services. Initiates an interactive login flow. |
| `moment auth status` | Display current authentication status and account information. |
| `moment auth logout` | Clear stored authentication credentials. |

## Global Options

| Option | Description |
|--------|-------------|
| `--help` | Display help for any command. |
| `--version` | Display the installed CLI version. |
| `--output <dir>` | Override the default output directory for generated artifacts. |
| `--format <fmt>` | Output format: `text` (default), `json`, or `silent`. |
| `--verbose` | Enable verbose logging for debugging. |

## Examples

### New Project Setup

```bash
# Scaffold a new project
moment init my-service
cd my-service

# Write your .moment specification, then generate everything
moment derive specs/my-service.moment
moment emit-ts specs/my-service.moment
moment generate specs/my-service.moment
```

### Continuous Development

```bash
# Watch mode regenerates on every save
moment watch specs/

# After implementing domain logic, run conformance tests
moment test specs/my-service.moment

# Check for drift
moment status specs/my-service.moment
```

### Upstream Specification Import

```bash
# Import from Sift event streams
moment import --from-sift .domain/

# Review the generated .moment files, then derive and generate
moment derive specs/my-service.moment
moment emit-ts specs/my-service.moment
```

### CI/CD Pipeline

```bash
#!/bin/bash
set -e

# Validate specification
moment parse specs/my-service.moment

# Check for drift (non-zero exit code on drift)
moment sync status specs/my-service.moment

# Run conformance tests
moment test specs/my-service.moment

# Lint governance rules
moment lint specs/my-service.moment --format json

# Generate documentation artifacts
moment generate specs/my-service.moment
```

### Drift Detection and Reconciliation

```bash
# Check sync status
moment sync status specs/my-service.moment

# Generate proposals for detected drift
moment sync propose specs/my-service.moment

# Review proposals, then accept
moment sync accept specs/my-service.moment

# Or run full cascade reconciliation
moment reconcile specs/my-service.moment
```

### Schema Governance Audit

```bash
# View schema lifecycle status
moment schema status specs/my-service.moment

# Run governance rules
moment lint specs/my-service.moment

# Machine-readable output for dashboards
moment schema status specs/my-service.moment --format json
moment lint specs/my-service.moment --format json
```

## Integration

`@mmmnt/cli` is the consumer-facing interface to the entire Moment toolchain. It depends on all library packages:

```
@mmmnt/cli
  |
  +-- @mmmnt/core      (parsing and IR generation)
  +-- @mmmnt/derive    (test topology and scenario derivation)
  +-- @mmmnt/emit-ts   (TypeScript code generation)
  +-- @mmmnt/generate  (Gherkin, specification documents, AsyncAPI)
  +-- @mmmnt/harness   (test execution)
  +-- @mmmnt/schema    (schema lifecycle governance)
  +-- @mmmnt/sync      (drift detection and reconciliation)
  +-- @mmmnt/viz       (visualization data generation)
```

For programmatic integration or AI agent workflows, see [@mmmnt/mcp](../mcp/README.md) which exposes the same capabilities over the Model Context Protocol.

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
