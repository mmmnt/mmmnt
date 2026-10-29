# @mmmnt/sync

Implementation synchronization with AST diffing, drift detection, and cascade reconciliation.

[![License: FSL-1.1-Apache-2.0](https://img.shields.io/badge/License-FSL--1.1--Apache--2.0-blue.svg)](../../LICENSE.md)
[![npm version](https://img.shields.io/npm/v/@mmmnt/sync.svg)](https://www.npmjs.com/package/@mmmnt/sync)

## Overview

`@mmmnt/sync` monitors the relationship between your `.moment` specification and its TypeScript implementation, detecting when they diverge and providing tools to reconcile the differences. It ensures that your domain model and your codebase remain consistent as both evolve.

The AST diff engine compares the generated TypeScript output from `@mmmnt/emit-ts` against the implementation files on disk, type by type: added, removed and renamed interfaces, and added, removed and retyped fields. Each difference becomes an implementation change proposal whose id is derived from the drift itself, so the same drift always yields the same id. Field-level proposals name the field, its type, and (for a retyped field) its previous type.

For teams using Sift as an upstream domain modeling tool, the Sift event stream reader replays the Sift events in a `.domain/` directory's JSONL files into an import input, used by `moment import --from-sift` and `moment reconcile`. `ReconciliationState` tracks upstream fingerprints and classifies upstream drift into cascade categories -- deterministic re-projection (Category 1), structural drift (Category 2), and breaking change (Category 3). The local Git artifact store reads artifacts working-tree-first, falling back to the committed copy at HEAD.

Implementation changes never modify the specification (IS-01): sync proposes specification updates and the architect makes them. Proposal state lives in three append-only JSONL logs in `.domain/` (ADR-039): `sync-state.jsonl` holds `SyncState` (proposals, decisions with their actor, and the cursor), `implementation-feedback.jsonl` holds the `ImplementationFeedbackJournal` (exactly one `ImplementationFeedbackRecorded` per accepted proposal, IS-04), and `push-flow-saga.jsonl` holds one `PushFlowSaga` per accept/reject run. `JsonlSyncLogStore` replays them through each aggregate's `apply()`, so a log that breaks an invariant is refused by file and line.

## Installation

Requires Node.js 22 or newer.

```bash
npm install @mmmnt/sync
```

Or with other package managers:

```bash
pnpm add @mmmnt/sync
yarn add @mmmnt/sync
```

## Quick Start

```typescript
import { ASTDiffEngine, JsonlSyncLogStore, planDecision } from '@mmmnt/sync';

// Proposals for the drift between generated (expected) and on-disk (actual) TypeScript.
// A proposal's id is derived from its drift, so the same drift keeps the same id.
const proposals = new ASTDiffEngine().generateProposals({ expected, actual });

// Replay the .domain/ logs; a corrupted line throws SyncLogCorruptedError (file + line).
const store = new JsonlSyncLogStore('specs/.domain');
const logs = store.load();
const recorded = proposals
  .filter((p) => logs.syncState.getProposalStatus(p.proposalId) === undefined)
  .map((p) => logs.syncState.recordProposal(p));
store.append({ syncState: recorded });

// Accept: one saga, one feedback event per accepted proposal. The caller commits the logs,
// then records saga.committed(oid) and saga.complete().
const plan = planDecision(logs, {
  kind: 'accept',
  proposalIds: [recorded[0].proposalId],
  actor: 'dev@example.com',
  commitRef: headOid,
});
if ('refused' in plan) throw new Error(plan.refused);
store.append(plan);
```

## Command-Line Workflow

The `moment` CLI (`@mmmnt/cli`) drives the sync lifecycle. Each command takes a `.moment` file or a model directory; the `.domain/` logs live beside the file, or inside the directory.

```bash
moment sync status spec.moment            # drift report: drifted and aligned files
moment sync propose spec.moment           # record new drift as pending proposals; supersede proposals whose drift is gone
moment sync accept spec.moment prop-4b1a1efced680463   # or --all
moment sync reject spec.moment prop-4b1a1efced680463 --reason "the implementation is wrong"
```

`sync accept` and `sync reject` refuse unless every named proposal is pending, and a rejection requires `--reason`. The deciding identity is the repository's own `user.name` and `user.email` from git config; the decision is refused when either is missing or the repository has no commits. Each decision appends to the `.domain/` logs (one feedback record per accepted proposal) and commits exactly those log files locally (`chore(sync): accept N proposal(s)`), then advances the sync cursor in a second commit. Nothing is pushed. Accepting does not edit the specification: the command reports the edit each accepted proposal implies, with the files and lines that declare the construct.

## Key Features

- **AST-level diffing** -- compares generated TypeScript against implementation code at the AST level, not just text, catching structural changes that text diffs miss.
- **Drift detection** -- identifies added, removed, and modified types, fields, and methods between specification and implementation.
- **Cascade reconciliation** -- `ReconciliationState` classifies upstream drift into three categories (deterministic re-projection, structural drift, breaking change), each with its required actions.
- **Persistent sync state** -- proposals, decisions (with the deciding actor) and the sync cursor persist in `.domain/sync-state.jsonl`; drift-derived proposal ids make re-running idempotent.
- **Sift event stream integration** -- replays Sift events from the JSONL files in a `.domain/` directory into an import input for upstream change detection and reconciliation.
- **Implementation feedback journal** -- records exactly one `ImplementationFeedbackRecorded` per accepted proposal in `.domain/implementation-feedback.jsonl`, caused by the proposal and correlated to its push-flow saga.
- **Local decision commits** -- `commitPathsOnly` commits exactly the named files on top of HEAD (like `git commit --only`), leaving everything else the developer modified or staged alone. No push, no network.
- **Implied spec edits** -- `impliedSpecEdit` describes the specification edit an accepted proposal implies and locates the declaring file and line; sync never writes it.
- **Local Git artifact store** -- reads artifacts working-tree-first with a fallback to HEAD, and queries the `.moment/index.json` artifact index.
- **Git remote management** -- supports cloning, pushing, pulling, and branching through `LocalGitRemoteManager` with pluggable credential strategies.
- **Credential resolution** -- layered credential resolver with strategies for environment variables, GitHub CLI, Git credential helpers, and OAuth device flow.
- **Consumption detection** -- scans source files for consumption of known event types and fields, with a confidence level per detection.
- **Proposal generation** -- produces structured change proposals with drift-derived ids; with deprecation metadata, a removed deprecated field also yields a proposal for its replacement.

## API Reference

### Diff Engine

| Export | Description |
|--------|-------------|
| `ASTDiffEngine` | Compares generated (expected) TypeScript against implementation (actual) source, both given as maps of file path to source text. `detectDrift(DetectDriftInput)` returns a `DriftReport`; `generateProposals(GenerateProposalsInput)` returns `ImplementationChangeProposal[]`; `detectConsumption(DetectConsumptionInput)` returns a `ConsumptionDetectionResult`. |

### Sync State

| Export | Description |
|--------|-------------|
| `SyncState` | Event-sourced proposal lifecycle (pending → accepted \| rejected \| superseded) and sync cursor, persisted in `.domain/sync-state.jsonl`. Events: `ProposalRecorded`, `ProposalAccepted` and `ProposalRejected` (both carrying `actor`), `ProposalSkipped` (superseded: its drift is gone), and `CursorAdvanced`. |
| `JsonlSyncLogStore` | Loads (replays) and appends the three `.domain/` logs. Throws `SyncLogCorruptedError` naming the file and line. |
| `planDecision` | Plans one accept or reject run: refuses unless every named proposal is pending; returns the decision, feedback and saga events through `RecordingComplete`. |
| `ReconciliationState` | Tracks upstream fingerprints and reconciliation progress. Accepts `DetectUpstreamDriftInput`, `StartReconciliationInput`, and `CompleteReconciliationInput`. |

### Feedback

| Export | Description |
|--------|-------------|
| `ImplementationFeedbackJournal` | Records feedback for accepted proposals via `RecordImplementationFeedbackInput` (IFJ-01..04), and replays recorded events through `apply()`. Produces `ImplementationFeedbackRecorded` events. |
| `impliedSpecEdit` / `locateDeclarations` | The spec edit an accepted proposal implies, by feedback type, with every file and line declaring the construct (an exact-text search for `value-object Y`, `event Y`, `command Y`, `aggregate "Y"`). |

### Reconciliation

| Export | Description |
|--------|-------------|
| `PushFlowSaga` | One accept/reject run: Diffing → Proposing → AwaitingConfirmation → Recording → Committing → Complete (or Aborted). Enforces IS-04: the recorded count equals the accepted count. |

### Event Stream

| Export | Description |
|--------|-------------|
| `SiftEventStreamReader` | `read(domainDir)` replays the Sift events in every `.jsonl` file of a `.domain/` directory into an import input. Returns `SiftEventStreamReadResult` (input, events processed, files read, errors). |

### Infrastructure

| Export | Description |
|--------|-------------|
| `LocalGitArtifactStore` | Reads artifacts working-tree-first, falling back to the git object store at HEAD, and reads the `.moment/index.json` artifact index. |
| `LocalGitArtifactWriter` | Writes and removes artifact files and the artifact index, and commits them with a configured author. |
| `resolveRepoIdentity` | The repo holding a path, with its own `user.name`, `user.email` and HEAD; a refusal message when any is missing. |
| `commitPathsOnly` | Commits exactly the named paths on top of HEAD, leaving the rest of the working tree and index alone. |
| `LocalGitRemoteManager` | Manages Git remote operations (clone, push, pull, branch) with pluggable credential strategies. |
| `EnvCredentialStrategy` | Resolves Git credentials from `MOMENT_GITHUB_TOKEN` or `GITHUB_TOKEN`. |
| `GhCliCredentialStrategy` | Resolves Git credentials from the GitHub CLI (`gh auth token`). |
| `GitCredentialHelperStrategy` | Resolves Git credentials from the configured Git credential helper (`git credential fill`). |
| `OAuthDeviceFlowStrategy` | Resolves Git credentials via OAuth device flow for interactive authentication. |
| `LayeredCredentialResolver` | Chains multiple credential strategies, trying each in order until one succeeds. |

### Key Types

| Type | Description |
|------|-------------|
| `ASTDifference` | A single difference between generated and implementation ASTs. |
| `TypeLevelChange` | A type-level change (added, removed, modified interface or class). |
| `DiffPoint` | A specific point of difference with path and description. |
| `DriftPoint` | A detected drift point with file, symbol, context, description, and direction (`implementation-added`, `implementation-removed`, `specification-added`, `specification-removed`). |
| `DriftReport` | Aggregated drift report: scope, drift points, drifted and aligned file counts, and timestamp. |
| `ImplementationChangeProposal` | A proposed specification change: drift-derived `proposalId`, proposed feedback event type, payload, source file, and the originating `ASTDifference`. |
| `FeedbackEventType` | The feedback event a proposal implies, one of `FEEDBACK_EVENT_TYPES` (for example `ValueObjectFieldAdded`, `ValueObjectFieldRevised`). |
| `ProposalStatus` | `pending`, `accepted`, `rejected`, or `superseded`. |
| `CascadeCategory` | Classification of upstream drift: `1` (deterministic re-projection), `2` (structural drift), or `3` (breaking change). |
| `CascadeClassification` | A category with its description and required actions. |
| `ReconciliationResult` | Outcome of a reconciliation: files updated, conflicts resolved, and cascade category. |
| `SyncCursor` | Specification hash, timestamp, and last processed file at which spec and implementation were last reconciled. |
| `SourceAttribution` | Provenance of a change (`source`). |
| `SiftEventEnvelope` | A parsed upstream Sift event with id, type, version, correlation and causation ids, timestamp, and typed payload. |

## Examples

### Detecting Implementation Drift

```typescript
import { ASTDiffEngine } from '@mmmnt/sync';

// expected: file path -> generated TypeScript (e.g. TypeScriptEmitter output files)
// actual:   file path -> implementation source read from disk
const drift = new ASTDiffEngine().detectDrift({ expected, actual });

if (drift.driftPoints.length === 0) {
  console.log('No drift detected.');
} else {
  console.log(`${drift.totalDrifted} drifted, ${drift.totalAligned} aligned`);
  for (const point of drift.driftPoints) {
    console.log(`  [${point.driftDirection}] ${point.filePath} ${point.aggregateName}`);
    console.log(`    ${point.description}`);
  }
}
```

### Committing a Decision Locally

```typescript
import { commitPathsOnly, resolveRepoIdentity } from '@mmmnt/sync';

const identity = await resolveRepoIdentity('specs');
if (typeof identity === 'string') throw new Error(identity);

const oid = await commitPathsOnly({
  root: identity.root,
  paths: ['specs/.domain/sync-state.jsonl', 'specs/.domain/push-flow-saga.jsonl'],
  message: 'chore(sync): accept 1 proposal(s)\n\nprop-4b1a1efced680463\n',
  author: { name: identity.name, email: identity.email },
});
```

### Reading Sift Event Streams

```typescript
import { SiftEventStreamReader } from '@mmmnt/sync';

const result = new SiftEventStreamReader().read('.domain');

console.log(`Replayed ${result.eventsProcessed} events from ${result.filesRead} file(s)`);
for (const block of result.input.buildingBlocks) {
  console.log(`  ${block.contextName}: ${block.aggregates.length} aggregate(s)`);
}
for (const error of result.errors) console.warn(error);
```

## Integration

`@mmmnt/sync` depends on `@mmmnt/emit-ts` for the generated TypeScript baseline (which transitively depends on `@mmmnt/core` and `@mmmnt/derive`). It interacts with:

```
@mmmnt/core --> @mmmnt/derive --> @mmmnt/emit-ts --> @mmmnt/sync
                                                          |
                                                          +-- @mmmnt/cli  (exposed via `moment sync status|propose|accept|reject`, `moment reconcile`, `moment import --from-sift`, `moment lint`, `moment status`)
                                                          +-- @mmmnt/mcp  (exposed via `moment_status`, `moment_reconcile`, `moment_import` tools)
```

## Contributing

This package is part of the [mmmnt monorepo](https://github.com/mmmnt/mmmnt). See [CONTRIBUTING.md](../../CONTRIBUTING.md) for development setup and contribution guidelines.

```bash
git clone https://github.com/mmmnt/mmmnt.git
cd mmmnt
pnpm install
pnpm turbo build --filter=@mmmnt/sync
pnpm --filter @mmmnt/sync test
```

## License

[FSL-1.1-Apache-2.0](../../LICENSE.md)
