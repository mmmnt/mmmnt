# @mmmnt/sync

Implementation synchronization with AST diffing, drift detection, and cascade reconciliation.

[![License: FSL-1.1-Apache-2.0](https://img.shields.io/badge/License-FSL--1.1--Apache--2.0-blue.svg)](../../LICENSE.md)
[![npm version](https://img.shields.io/npm/v/@mmmnt/sync.svg)](https://www.npmjs.com/package/@mmmnt/sync)

## Overview

`@mmmnt/sync` monitors the relationship between your `.moment` specification and its TypeScript implementation, detecting when they diverge and providing tools to reconcile the differences. It ensures that your domain model and your codebase remain consistent as both evolve.

The AST diff engine compares the generated TypeScript output from `@mmmnt/emit-ts` against the actual implementation files on disk, producing a structured diff that identifies added, removed, and modified types, fields, and methods. The sync state tracker maintains a persistent record of when specifications and implementations were last aligned, so drift can be detected incrementally rather than requiring a full comparison each time.

For teams using Sift as an upstream domain modeling tool, the Sift event stream reader watches for new events in the `.complai/events/moment/` directory and feeds them into the reconciliation pipeline. The push flow saga orchestrates the end-to-end reconciliation process, classifying changes into categories -- clean applies (Category 1), manageable drift (Category 2), and breaking changes (Category 3) -- and producing actionable reconciliation plans. The local Git artifact store manages versioned snapshots of generated artifacts for comparison and rollback.

Implementation changes never modify the specification (IS-01): sync proposes specification updates and the architect makes them. Proposal state lives in three append-only JSONL logs in `.domain/` (ADR-039): `sync-state.jsonl` holds `SyncState` (proposals, decisions with their actor, and the cursor), `implementation-feedback.jsonl` holds the `ImplementationFeedbackJournal` (exactly one `ImplementationFeedbackRecorded` per accepted proposal, IS-04), and `push-flow-saga.jsonl` holds one `PushFlowSaga` per accept/reject run. `JsonlSyncLogStore` replays them through each aggregate's `apply()`, so a log that breaks an invariant is refused by file and line.

## Installation

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

## Key Features

- **AST-level diffing** -- compares generated TypeScript against implementation code at the AST level, not just text, catching structural changes that text diffs miss.
- **Drift detection** -- identifies added, removed, and modified types, fields, and methods between specification and implementation.
- **Cascade reconciliation** -- the push flow saga classifies changes into three categories: clean applies, manageable drift, and breaking changes requiring manual intervention.
- **Persistent sync state** -- proposals, decisions (with the deciding actor) and the sync cursor persist in `.domain/sync-state.jsonl`; drift-derived proposal ids make re-running idempotent.
- **Sift event stream integration** -- reads JSONL event signals from `.complai/events/moment/` for upstream change detection and reconciliation triggering.
- **Implementation feedback journal** -- records exactly one `ImplementationFeedbackRecorded` per accepted proposal in `.domain/implementation-feedback.jsonl`, caused by the proposal and correlated to its push-flow saga.
- **Local decision commits** -- `commitPathsOnly` commits exactly the named files on top of HEAD (like `git commit --only`), leaving everything else the developer modified or staged alone. No push, no network.
- **Implied spec edits** -- `impliedSpecEdit` describes the specification edit an accepted proposal implies and locates the declaring file and line; sync never writes it.
- **Local Git artifact store** -- manages versioned snapshots of generated artifacts using the local Git repository for comparison and rollback.
- **Git remote management** -- supports cloning, pushing, pulling, and branching through `LocalGitRemoteManager` with pluggable credential strategies.
- **Credential resolution** -- layered credential resolver with strategies for environment variables, GitHub CLI, Git credential helpers, and OAuth device flow.
- **Consumption detection** -- identifies which downstream services consume specific types, informing change impact analysis.
- **Proposal generation** -- produces structured change proposals with source attribution and deprecation metadata.

## API Reference

### Diff Engine

| Export | Description |
|--------|-------------|
| `ASTDiffEngine` | Compares generated TypeScript output against implementation files, producing a structured diff of additions, removals, and modifications. Accepts `DetectDriftInput`, `GenerateProposalsInput`, and `DetectConsumptionInput`. |

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
| `SiftEventStreamReader` | Reads JSONL event signals from `.complai/events/moment/` for upstream change detection. Returns `SiftEventStreamReadResult`. |

### Infrastructure

| Export | Description |
|--------|-------------|
| `LocalGitArtifactStore` | Manages versioned snapshots of generated artifacts using the local Git repository for comparison and rollback. |
| `LocalGitArtifactWriter` | Writes artifact files to the local Git repository with commit metadata. |
| `resolveRepoIdentity` | The repo holding a path, with its own `user.name`, `user.email` and HEAD; a refusal message when any is missing. |
| `commitPathsOnly` | Commits exactly the named paths on top of HEAD, leaving the rest of the working tree and index alone. |
| `LocalGitRemoteManager` | Manages Git remote operations (clone, push, pull, branch) with pluggable credential strategies. |
| `EnvCredentialStrategy` | Resolves Git credentials from environment variables. |
| `GhCliCredentialStrategy` | Resolves Git credentials from the GitHub CLI (`gh auth token`). |
| `GitCredentialHelperStrategy` | Resolves Git credentials from the Git credential helper. |
| `OAuthDeviceFlowStrategy` | Resolves Git credentials via OAuth device flow for interactive authentication. |
| `LayeredCredentialResolver` | Chains multiple credential strategies, trying each in order until one succeeds. |

### Key Types

| Type | Description |
|------|-------------|
| `ASTDifference` | A single difference between generated and implementation ASTs. |
| `TypeLevelChange` | A type-level change (added, removed, modified interface or class). |
| `DiffPoint` | A specific point of difference with path and description. |
| `DriftPoint` | A detected drift point with direction (spec-ahead or impl-ahead). |
| `DriftReport` | Aggregated drift report with all drift points and summary. |
| `ImplementationChangeProposal` | A proposed change to reconcile drift, with source attribution. |
| `CascadeCategory` | Classification of a change: Category 1 (clean), 2 (drift), or 3 (breaking). |
| `CascadeClassification` | A classified change with category and reconciliation guidance. |
| `ReconciliationResult` | Outcome of a reconciliation run with category, actions, and message. |
| `SyncCursor` | Position tracker for incremental event stream processing. |
| `SourceAttribution` | Provenance metadata linking a change to its source (spec change, upstream event). |
| `SiftEventEnvelope` | A parsed upstream Sift event with type, timestamp, and typed payload. |

## Examples

### Detecting Implementation Drift

```typescript
import { ASTDiffEngine } from '@mmmnt/sync';

const differ = new ASTDiffEngine();
const drift = await differ.detectDrift({
  generatedDir: './generated/',
  implementationDir: './src/domain/',
});

if (drift.points.length === 0) {
  console.log('No drift detected.');
} else {
  console.log(`Found ${drift.points.length} drift points:`);
  for (const point of drift.points) {
    console.log(`  [${point.direction}] ${point.path}`);
    console.log(`    ${point.summary}`);
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

const reader = new SiftEventStreamReader();
const result = await reader.read({
  projectDir: '.',
  since: '2026-04-01T00:00:00Z',
});

console.log(`Found ${result.events.length} upstream events`);
for (const event of result.events) {
  console.log(`  ${event.type} at ${event.timestamp}`);
  console.log(`    Payload: ${JSON.stringify(event.payload)}`);
}
```

## Integration

`@mmmnt/sync` depends on `@mmmnt/emit-ts` for the generated TypeScript baseline (which transitively depends on `@mmmnt/core` and `@mmmnt/derive`). It interacts with:

```
@mmmnt/core --> @mmmnt/derive --> @mmmnt/emit-ts --> @mmmnt/sync
                                                          |
                                                          +-- @mmmnt/schema   (lifecycle context for drift decisions)
                                                          +-- @mmmnt/harness  (test results inform drift impact)
                                                          +-- @mmmnt/cli      (exposed via `moment sync status|propose|accept|reject`, `moment reconcile`, `moment status`)
                                                          +-- @mmmnt/mcp      (exposed via `moment_status`, `moment_reconcile` tools)
```

## Contributing

This package is part of the [mmmnt monorepo](https://github.com/mmmnt/mmmnt). See the repository root for contribution guidelines, development setup, and the code of conduct.

```bash
git clone https://github.com/mmmnt/mmmnt.git
cd mmmnt
pnpm install
pnpm turbo build --filter=@mmmnt/sync
pnpm --filter @mmmnt/sync test
```

## License

[FSL-1.1-Apache-2.0](../../LICENSE.md)
