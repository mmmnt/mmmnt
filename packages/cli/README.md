# @mmmnt/cli

The `moment` command-line interface -- a unified entry point to all Moment domain specification tooling.

[![License: FSL-1.1-Apache-2.0](https://img.shields.io/badge/License-FSL--1.1--Apache--2.0-blue.svg)](../../LICENSE.md)
[![npm version](https://img.shields.io/npm/v/@mmmnt/cli.svg)](https://www.npmjs.com/package/@mmmnt/cli)

## Overview

`@mmmnt/cli` provides the `moment` command, which is the primary way most developers interact with the Moment toolchain. It wraps every package in the `@mmmnt` ecosystem behind a consistent, discoverable command-line interface with 16+ commands covering the full specification-to-implementation workflow.

From initializing a new project to parsing specifications, deriving test topologies, generating TypeScript code and BDD scenarios, running conformance tests, detecting implementation drift, and managing schema lifecycles -- every operation is available as a single CLI command. The CLI handles file I/O, output formatting, error reporting, and watch mode so that the underlying library packages remain focused on their core logic.

The CLI is designed for both interactive development and CI/CD pipeline integration. All commands produce structured output suitable for scripting, and exit codes follow standard conventions for use in automated workflows.

## Installation

```bash
# Install globally
npm install -g @mmmnt/cli

# Or run directly without installing
npx @mmmnt/cli

# Or install as a project dev dependency
npm install --save-dev @mmmnt/cli
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

## Commands

| Command | Description |
|---------|-------------|
| `moment init <name>` | Initialize a new Moment project with directory structure, manifest file, and starter specification. |
| `moment parse <file>` | Parse and validate a `.moment` specification file. Reports syntax errors and semantic diagnostics. |
| `moment watch <dir>` | Watch a directory for `.moment` file changes and automatically re-parse and regenerate artifacts. |
| `moment derive <file>` | Derive test topologies, simulation scenarios, event catalogs, impact analysis, and saga state machines from a specification. |
| `moment generate <file>` | Generate Gherkin `.feature` files, a `specification.md` document with Mermaid diagrams, and an `asyncapi.yaml` specification. |
| `moment emit-ts <file>` | Generate TypeScript interfaces, aggregate root classes, event union types, and test scaffold files. |
| `moment test <file>` | Execute derived tests against your domain implementation and report conformance results. |
| `moment viz <file>` | Generate visualization data (context maps, flow timelines) as a JSON VizDataEnvelope. |
| `moment simulate <file>` | Run simulation scenarios against the specification and report event flow traces. |
| `moment sync <file>` | Detect drift between the specification and implementation by comparing generated and actual TypeScript files. |
| `moment schema <file>` | Display schema lifecycle status for all events and commands in the specification. |
| `moment lint <file>` | Run codex governance rules and report policy violations. |
| `moment import <dir>` | Import Sift JSONL event streams from a `.domain/` directory into `.moment` specification files. |
| `moment reconcile <file>` | Run cascade reconciliation to classify and resolve drift between specification and implementation. |
| `moment status <file>` | Display unified project status: parse validity, sync drift, schema lifecycle, and upstream fingerprint. |
| `moment auth` | Authenticate with Moment cloud services (when applicable). |

## Common Workflows

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
moment import .domain/

# Review the generated .moment files, then derive and generate
moment derive specs/my-service.moment
moment emit-ts specs/my-service.moment
```

### CI/CD Pipeline

```bash
# Validate specification
moment parse specs/my-service.moment

# Check for drift (non-zero exit code on drift)
moment sync specs/my-service.moment

# Run conformance tests
moment test specs/my-service.moment

# Lint governance rules
moment lint specs/my-service.moment
```

## Global Options

| Option | Description |
|--------|-------------|
| `--help` | Display help for any command. |
| `--version` | Display the installed CLI version. |
| `--output <dir>` | Override the default output directory for generated artifacts. |
| `--format <fmt>` | Output format: `text` (default), `json`, or `silent`. |
| `--verbose` | Enable verbose logging for debugging. |

## Integration

`@mmmnt/cli` is the consumer-facing interface to the entire Moment toolchain. It depends on:

- **@mmmnt/core** for parsing and IR generation
- **@mmmnt/derive** for test topology and scenario derivation
- **@mmmnt/emit-ts** for TypeScript code generation
- **@mmmnt/generate** for Gherkin, specification documents, and AsyncAPI output
- **@mmmnt/harness** for test execution
- **@mmmnt/schema** for schema lifecycle governance
- **@mmmnt/sync** for drift detection and reconciliation
- **@mmmnt/viz** for visualization data generation

For programmatic integration or AI agent workflows, see [@mmmnt/mcp](../mcp/README.md) which exposes the same capabilities over the Model Context Protocol.

## License

[FSL-1.1-Apache-2.0](../../LICENSE.md)
