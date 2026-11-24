# @mmmnt/cli

The `moment` command: check a Moment model and derive tests, types, scenarios, schemas, documents and boards from it.

[![License: FSL-1.1-Apache-2.0](https://img.shields.io/badge/License-FSL--1.1--Apache--2.0-blue.svg)](../../LICENSE.md)
[![npm version](https://img.shields.io/npm/v/@mmmnt/cli.svg)](https://www.npmjs.com/package/@mmmnt/cli)

## Overview

`@mmmnt/cli` puts every `@mmmnt` package behind one command, `moment`. Each command reads a `.moment` file or a model directory, does one job, and prints a short result. The CLI handles file I/O, output, error reporting and exit codes. The library packages hold the logic.

The commands exit non-zero when the model does not parse, so you can gate CI on them. Some also fail on findings: `test` on a failing case, `status` and `sync status` on drift, `reconcile` on a breaking change. See [Exit codes](#exit-codes).

What changed in each release is in [CHANGELOG.md](CHANGELOG.md).

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

## Quick start

Every output below is from the TicketWave example in this repository (`examples/ticketwave/spec/`: 7 contexts, 8 flows named `N1 - General admission purchase` to `N8 - Waitlist offer`). The CLI prints absolute paths; they are shortened here.

```bash
moment parse examples/ticketwave/spec/
# Parsed project successfully: 1 file(s), 7 context(s), 8 flow(s)

moment derive examples/ticketwave/spec/
# Derived topology: 8 suite(s), 92 case(s)

moment test examples/ticketwave/spec/
# Tests: 92 total, 92 passed, 0 failed, 0 skipped (8 suite(s))

moment generate examples/ticketwave/spec/ --out out/
# Generated: 8 .feature file(s), 21 .spec.ts file(s), 1 document(s)
# Wrote 70 file(s) to out/

moment simulate examples/ticketwave/spec/ --all --out-dir facet/
# Wrote 8 topology file(s), 72 scenario file(s), 5 artifact(s), manifest.json to facet/ (733 total events)

moment schema emit examples/ticketwave/spec/ --out-dir schemas/
# Wrote 59 payload schema(s) to schemas/

moment board examples/ticketwave/spec/ --out board/
# Board written to board/: 39 file(s) and manifest.json (38 frame(s), 509 node(s))
```

`board` prints one `note:` line on stderr for TicketWave, because TicketWave has no `manifest.yaml` to number its contexts. It does not fail the run.

## Project mode

Where a command takes `<file|dir>` (and for `serve --project <dir>`), you can pass a directory. The CLI then loads every `.moment` file beneath it, in sorted path order, as one merged project. Names resolve across files, and node placement, saga transitions and External lanes are checked over the whole model.

The model-level validation rules (see [@mmmnt/core](../core/README.md#validation-rules)) are warnings when a file is parsed alone, because a missing name may be in another file. Over a project they are errors, and a project fails on any file's error.

## Commands

`moment --help` lists every command. `moment <command> --help` prints that command's usage and runs nothing. `moment --version` prints the version.

### Model and check

| Command                     | What it does                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `moment init`               | Create a project in `--dir <path>` (default `.`): a `.manifest.yaml`, `.moment/contexts/` and `.moment/flows/`. `--name <name>` sets the project name (default `my-moment-project`). Refuses to overwrite an existing manifest.                                                                                                                                                                                                     |
| `moment parse <file\|dir>`  | Parse and validate the model. Prints the context and flow counts; diagnostics go to stderr with file, line and column, and the rule id where there is one.                                                                                                                                                                                                                                                                          |
| `moment watch`              | Watch the paths listed under `watch.paths` in `.manifest.yaml`, or `.moment/contexts`, `.moment/flows` and `.moment` when there is no manifest. On each change that parses, re-run `generate` and `emit-ts` for the changed file. `--dir <path>` sets the project directory (default `.`). `--no-generate` only re-parses. `--no-watch` exits at once. `watch.enabled: false` in the manifest turns it off. Runs until interrupted. |
| `moment lint <file\|dir>`   | One report of parse diagnostics, implementation drift and deprecated fields. Exits non-zero only on parse errors. `--json` prints `{ issues, errors, warnings }`.                                                                                                                                                                                                                                                                   |
| `moment status <file\|dir>` | Four checks in one view: specification validity, implementation sync, schema lifecycle, and the upstream Sift fingerprint. Exits non-zero on a parse error, on drift, or when `.domain/` exists without a fingerprint. `--verbose` adds section details, `--quiet` prints nothing (use the exit code), `--json` prints `{ sections, hasDrift }`.                                                                                    |

When a single `.moment` file sits inside a project that has a `.manifest.yaml`, `parse`, `generate` and `emit-ts` update the manifest's `contexts` and `flows` lists from it. A directory run does not touch the manifest.

### Derive tests

| Command                            | What it does                                                                                                                                                     |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `moment derive <file\|dir>`        | Derive the test topology and print its suite and case counts. `--json` prints the topology.                                                                      |
| `moment test <file\|dir>`          | Run the derived suites as structural checks against the model and print passed, failed and skipped counts. Exits non-zero when a case fails.                     |
| `moment cucumber-json <file\|dir>` | Print Cucumber JSON to stdout: one feature per flow, with each scenario's status from the structural checks. Any tool that imports Cucumber results can read it. |

### Generate

| Command                       | What it does                                                                                                                                                                              |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `moment generate <file\|dir>` | Write Gherkin features, `specification.md` with Mermaid diagrams, TypeScript types and aggregates, and test scaffolds. `--out <dir>` (alias `--out-dir`, `-o`) sets the output directory. |
| `moment emit-ts <file\|dir>`  | Write only the TypeScript: types, aggregates and test scaffolds. `--out <dir>` (`-o`) sets the output directory. `--dry-run` lists the files and writes nothing.                          |

Without `--out`, both write under the directory of the nearest `.manifest.yaml` above the model, else the current directory. For TicketWave, `generate` writes:

| Path                                                                              | Count | Contents                                                                             |
| --------------------------------------------------------------------------------- | ----- | ------------------------------------------------------------------------------------ |
| `features/<flow>.feature`                                                         | 8     | One feature per flow, e.g. `features/n5-seat-request.feature`                        |
| `src/<context>/<aggregate>.types.ts`, `.aggregate.ts`, `index.ts`, `src/index.ts` | 40    | Types and an aggregate per aggregate, an index per context and one for the system    |
| `__tests__/<context>/<aggregate>.spec.ts`                                         | 16    | A test scaffold per aggregate                                                        |
| `__tests__/flows/<flow>.spec.ts`                                                  | 5     | A test scaffold per flow whose test cases carry assertions; the other flows get none |
| `specification.md`                                                                | 1     | The specification document                                                           |

`emit-ts` writes the same 40 TypeScript files and 21 scaffolds (61 files).

### Simulate and serve

| Command                          | What it does                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `moment simulate <file\|dir>`    | Generate event chains for each flow and print a trace per scenario. By default one happy-path scenario per flow. `--all` adds every branch combination, negative scenarios for unmet preconditions, and timeout scenarios. `--flow "<name>"` selects one flow by its full name. `--json` prints the scenarios.                                                                                              |
| `moment serve <file\|facet-dir>` | Serve topology and scenarios over WebSocket for [Facet](https://facet.mmmnt.dev), on `ws://localhost:4321` (`--port <n>`, `-p`). A file is parsed and derived, and re-served when it changes. A directory is a folder written by `simulate --out-dir`, and is reloaded when it changes. `--project <dir>` serves a model directory as one project. `--all` serves every scenario, not only the happy paths. |

`simulate --out-dir <dir>` (alias `--out`) writes:

- `topology-<flow>.json`, one per flow, e.g. `topology-n5-seat-request.json`
- `scenario-<flow>.json` per flow, or with `--all` `scenario-<flow>-<n>.json`, `scenario-<flow>-neg-<command>-<precondition>.json` and `scenario-<flow>-timeout-<saga>.json` per scenario, slugged like the topology files, e.g. `scenario-n5-seat-request-0.json`. The file's `scenarioId` keeps the flow name as written, e.g. `scenario-flow-N5 - Seat request-0`, and `manifest.json` gives each scenario's `file`. Two scenarios whose names slug to one file fail the run.
- `manifest.json`, the index Facet reads
- `event-catalog.json`, `impact-analysis.json`, `saga-state-machines.json`, `policy-definitions.json` and `asyncapi.yaml`

For TicketWave, `simulate` alone gives 8 scenarios and 111 events; with `--all`, 72 scenarios and 733 events. `serve` on the model prints `Scenarios: 8`, or `Scenarios: 72` with `--all`.

### Visualise

| Command                                | What it does                                                                                                                                                                                                                                                                                                                                               |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `moment viz <file\|dir>`               | Print a `viz:initial-load` message as JSON: a session and a `VizDataEnvelope` with the context map and flow timelines.                                                                                                                                                                                                                                     |
| `moment board <file\|dir> --out <dir>` | Project the model onto an event-storming board: `board.svg` with every frame, one SVG per frame, and `manifest.json`. `--frame <id>` writes only that frame and the manifest. `--pointers <file>` reads a JSON file `{ "pointers": [...] }` that links board nodes to spec locations. Writes nothing when the model does not parse. Does not talk to Miro. |

For TicketWave, `board` writes 38 frames: `legend`, `grammar`, `context-map`, `policies`, `invariant-coverage`, 7 `context-C<n>`, 16 `aggregate-<Name>`, 2 `services-C<n>`, and 8 `thread-N<n>`, one per flow. An unknown `--frame` fails and lists the frame ids. A flow name must start with an id token such as `N5 - `; a flow with no id, or two flows with one id, fails `board` with exit 1. For a model directory with a `manifest.yaml`, contexts are numbered in the order it lists them. A context it does not list, or any context of a single file, is numbered in load order, and `board` prints a `note:` line on stderr that names it. A note does not fail the run. The numbering and the manifest format are in [@mmmnt/board](../board/README.md).

### Govern contracts

| Command                                            | What it does                                                                                                                                                                                                                |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `moment schema emit <file\|dir> [--out-dir <dir>]` | Write one closed JSON Schema (draft 2020-12) per event payload, `<Event>.schema.json`. Without `--out-dir`, print them as one JSON object keyed by event. On a type the model does not declare, exits 1 and writes nothing. |
| `moment schema status <file\|dir>`                 | A table of every event field with its type, lifecycle phase and consumer count. `--json` prints `{ schemas, total }`.                                                                                                       |

### Keep implementation honest

`sync` compares the TypeScript the model implies with the files in your project, read from the nearest `.manifest.yaml` directory, else the git root, else the model's directory.

| Command                                                            | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `moment sync status <file\|dir>`                                   | Report drift between the model and the implementation. Exits 1 when there is drift; the report still prints on stdout (`--json` too).                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `moment sync propose <file\|dir>`                                  | Record a proposal in `.domain/sync-state.jsonl` for each new difference in an implemented file, such as a field added in code, and print every pending proposal with its id. A missing file is drift but not a proposal. A proposal's id comes from its drift (`prop-` and 16 hex characters of a sha256), so a re-run records only new drift and supersedes pending proposals whose drift is gone. Decided proposals are never touched. `--json` prints `{ proposals, recorded, superseded }`. `--auto-accept` is refused.                                                                      |
| `moment sync accept <file\|dir> (<proposal-id>... \| --all)`       | Accept pending proposals. If any named id is not pending, nothing is recorded and the error names each id and its status. `--all` with nothing pending says so and exits 0. Records one `ImplementationFeedbackRecorded` per proposal and a push-flow saga, commits the `.domain/` logs to the local repository, then advances the sync cursor in a second commit. Prints the edit each proposal implies for the model, with the file and line, e.g. ``add field `region: string` to event `VenueRegistered` at ticketwave.moment:80``. Never edits a `.moment` or `.ts` file, and never pushes. |
| `moment sync reject <file\|dir> <proposal-id>... --reason "<why>"` | Reject pending proposals. `--reason` is required. Same all-or-nothing check, saga and local commits as `accept`; records no feedback.                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `moment reconcile <file\|dir> (--local \| --event <path>)`         | Classify upstream drift as `APPLIED` (Category 1), `DRIFT` (Category 2) or `BREAKING` (Category 3). `--local` compares the model's contexts with the Sift export in `.domain/`; with no `.domain/`, there is nothing to reconcile. `--event <path>` checks the `affectedElements` of a cascade event file against the model. Exactly one of the two is required. Records a `MomentReconcileCompleted` event under `.complai/events/moment/`. Exits 1 on `BREAKING`. `--json` prints `{ outcome, category, success }`.                                                                            |

Sync keeps three append-only logs in `.domain/`, beside the spec file or inside the model directory: `sync-state.jsonl` (proposals, decisions and the cursor), `implementation-feedback.jsonl`, and `push-flow-saga.jsonl`. Every sync command replays them and refuses a corrupted log, naming the file and line; a refused run writes nothing. `accept` and `reject` need a git repository whose own config sets `user.name` and `user.email`, with at least one commit; the actor is that `user.email`, and the feedback's `commitRef` is HEAD. If the local commit fails, the records stay appended, the saga is recorded as aborted, the cursor does not move, and the command exits non-zero.

### Bring a model in

| Command                           | What it does                                                                                                                                                                                                                                                                             |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `moment import --from-sift <dir>` | Import the Sift JSONL event streams in a `.domain/` directory as one `.moment` file per context under `.moment/contexts/`, and write `.moment/.upstream-fingerprint.json`. Output goes beside the `.domain/` directory unless `--output-dir <dir>` is given. `--json` prints the counts. |

### Credentials and quorum

| Command                                             | What it does                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `moment auth login`                                 | Sign in to GitHub with the OAuth device flow: open the printed URL and enter the code. The token is stored in `~/.moment/credentials.json`.                                                                                                                                                                                                                    |
| `moment auth status`                                | Show whether GitHub and quorum credentials are present.                                                                                                                                                                                                                                                                                                        |
| `moment auth logout`                                | Remove the stored GitHub token.                                                                                                                                                                                                                                                                                                                                |
| `moment auth quorum --token <jwt> [--server <url>]` | Store a quorum token and server URL (default `http://localhost:3000`) in `~/.moment/quorum-credentials.json`. `--logout` removes them. `QUORUM_TOKEN` and `QUORUM_SERVER_URL` in the environment work without storing anything and take precedence.                                                                                                            |
| `moment quorum watch <stream>`                      | Poll a quorum stream and append its entries as JSONL to `<out>/<stream>.jsonl`, keeping a cursor in `<out>/.quorum-cursor.json` so the next run resumes. `--out <dir>` (default `.domain`), `--server <url>`, `--interval <ms>` (default 5000, minimum 1000), `--source <name>` (default `quorum`), `--once` to fetch once and exit. Needs quorum credentials. |

## Options

Options apply only to the commands listed. A flag the command does not take is an error: the command runs nothing, prints the flag and the flags it does take, and exits 2. For example, `moment emit-ts model/ --out-dir gen/` fails, because `emit-ts` takes `--out`.

| Option                       | Commands                                                                                    | Effect                                                |
| ---------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `--json`                     | derive, simulate, lint, status, schema status, sync status, sync propose, reconcile, import | JSON on stdout                                        |
| `--out <dir>`                | generate (also `--out-dir`), emit-ts, board, simulate (alias of `--out-dir`), quorum watch  | Output directory. Required for `board`                |
| `--out-dir <dir>`            | simulate, generate, schema emit                                                             | Output directory                                      |
| `--output-dir <dir>`         | import --from-sift                                                                          | Where the `.moment/` directory is written             |
| `--dry-run`                  | emit-ts                                                                                     | List the files and write nothing                      |
| `--all`                      | simulate, serve                                                                             | Every branch combination and negative scenario        |
| `--all`                      | sync accept                                                                                 | Accept every pending proposal                         |
| `--flow <name>`              | simulate                                                                                    | One flow, by its full name                            |
| `--frame <id>`               | board                                                                                       | One frame and the manifest                            |
| `--pointers <file>`          | board                                                                                       | Spec pointers to attach to board nodes                |
| `--reason <why>`             | sync reject                                                                                 | Why the proposals are rejected (required)             |
| `--local` / `--event <path>` | reconcile                                                                                   | Compare with `.domain/`, or with a cascade event file |
| `--port <n>`                 | serve                                                                                       | WebSocket port (default 4321)                         |
| `--project <dir>`            | serve                                                                                       | Serve a model directory as one project                |
| `--dir <path>`               | init, watch                                                                                 | Project directory (default `.`)                       |
| `--name <name>`              | init                                                                                        | Project name                                          |
| `--no-generate`              | watch                                                                                       | Re-parse only                                         |
| `--verbose` / `--quiet`      | status                                                                                      | More detail, or no output                             |

## Exit codes

Every command exits 2 on a flag it does not take, and runs nothing. Every command that reads a model exits 1 when the model does not parse, the path does not exist, or a required argument is missing. Beyond that:

| Command                      | Also exits 1 when                                                        |
| ---------------------------- | ------------------------------------------------------------------------ |
| `test`                       | A case fails                                                             |
| `status`                     | There is drift, or `.domain/` exists without a fingerprint               |
| `sync status`                | There is drift                                                           |
| `sync accept`, `sync reject` | A named id is not pending, a log is corrupted, or the commit fails       |
| `reconcile`                  | The outcome is `BREAKING`                                                |
| `schema emit`                | A field uses a type the model does not declare                           |
| `board`                      | Flow numbering fails, a pointer matches no node, or `--frame` is unknown |
| `lint`                       | Only on parse errors; drift and deprecations are warnings                |

## Examples

### A new project

```bash
moment init --name my-service --dir my-service
cd my-service
# Write .moment files under .moment/contexts and .moment/flows, then:
moment parse .moment/
moment generate .moment/
moment watch          # regenerate on every save
```

### CI

```bash
#!/bin/bash
set -e

moment parse model/         # fails on any error in the project
moment test model/          # fails on a failing case
moment status model/        # fails on drift
moment lint model/ --json   # fails only on parse errors
moment schema emit model/ --out-dir schemas/
```

### Drift between model and code

```bash
moment sync status model/
moment sync propose model/
# Pending 2 proposal(s):
#   prop-86fdf20bb81d9413  ValueObjectFieldAdded ... fieldName: region ...
#   prop-517dc7db83c4bfdb  ValueObjectFieldAdded ... fieldName: note ...

moment sync accept model/ prop-86fdf20bb81d9413
# Make these edits to the specification:
#   prop-86fdf20bb81d9413: add field `region: string` to event `VenueRegistered`
#     at ticketwave.moment:80

moment sync reject model/ prop-517dc7db83c4bfdb --reason "local workaround"
```

### A model from Sift

```bash
moment import --from-sift .domain/
# Imported: 4 context(s), 4 file(s) written from 56 events across 4 JSONL file(s)
moment parse .moment/
```

## Packages it uses

```
@mmmnt/cli
  +-- @mmmnt/core      parsing, project loading, the IR, Sift import
  +-- @mmmnt/derive    test topology, scenarios, event catalog, impact analysis
  +-- @mmmnt/generate  Gherkin, specification documents, AsyncAPI, Cucumber JSON
  +-- @mmmnt/emit-ts   TypeScript types and test scaffolds
  +-- @mmmnt/harness   structural test execution
  +-- @mmmnt/schema    payload JSON Schemas and schema lifecycle
  +-- @mmmnt/sync      drift detection, proposals, reconciliation
  +-- @mmmnt/viz       visualization envelope
  +-- @mmmnt/board     the event-storming board
```

For AI agents, [@mmmnt/mcp](../mcp/README.md) exposes part of this over the Model Context Protocol.

## Contributing

This package is part of the [mmmnt monorepo](https://github.com/mmmnt/mmmnt). See the repository root for contribution guidelines and development setup.

```bash
git clone https://github.com/mmmnt/mmmnt.git
cd mmmnt
pnpm install
pnpm turbo build --filter=@mmmnt/cli
pnpm --filter @mmmnt/cli test
```

## License

[FSL-1.1-Apache-2.0](../../LICENSE.md)
