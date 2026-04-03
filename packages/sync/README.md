# @mmmnt/sync

Implementation synchronization with AST diffing, drift detection, and cascade reconciliation.

[![License: FSL-1.1-Apache-2.0](https://img.shields.io/badge/License-FSL--1.1--Apache--2.0-blue.svg)](../../LICENSE.md)
[![npm version](https://img.shields.io/npm/v/@mmmnt/sync.svg)](https://www.npmjs.com/package/@mmmnt/sync)

## Overview

`@mmmnt/sync` monitors the relationship between your `.moment` specification and its TypeScript implementation, detecting when they diverge and providing tools to reconcile the differences. It ensures that your domain model and your codebase remain consistent as both evolve.

The AST diff engine compares the generated TypeScript output from `@mmmnt/emit-ts` against the actual implementation files on disk, producing a structured diff that identifies added, removed, and modified types, fields, and methods. The sync state tracker maintains a persistent record of when specifications and implementations were last aligned, so drift can be detected incrementally rather than requiring a full comparison each time.

For teams using Sift as an upstream domain modeling tool, the Sift event stream reader watches for new events in the `.complai/events/moment/` directory and feeds them into the reconciliation pipeline. The push flow saga orchestrates the end-to-end reconciliation process, classifying changes into categories -- clean applies (Category 1), manageable drift (Category 2), and breaking changes (Category 3) -- and producing actionable reconciliation plans. The local Git artifact store manages versioned snapshots of generated artifacts for comparison and rollback, while the implementation feedback journal records developer decisions about proposals for future learning.

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
import { ASTDiffEngine, SyncState } from '@mmmnt/sync';

// Detect drift between specification output and implementation
const differ = new ASTDiffEngine();
const diff = await differ.diff({
  generatedDir: './generated/',
  implementationDir: './src/domain/',
});

if (diff.hasDrift) {
  console.log(`Drift detected: ${diff.changes.length} changes`);
  for (const change of diff.changes) {
    console.log(`  [${change.type}] ${change.path}: ${change.summary}`);
  }
} else {
  console.log('Specification and implementation are in sync.');
}

// Check persistent sync state
const state = new SyncState();
await state.load('.moment/sync-state.json');
console.log(`Last synced: ${state.lastSyncTimestamp}`);
```

## Key Features

- **AST-level diffing** -- compares generated TypeScript against implementation code at the AST level, not just text, catching structural changes that text diffs miss.
- **Drift detection** -- identifies added, removed, and modified types, fields, and methods between specification and implementation.
- **Cascade reconciliation** -- the push flow saga classifies changes into three categories: clean applies, manageable drift, and breaking changes requiring manual intervention.
- **Persistent sync state** -- tracks specification-implementation alignment timestamps and fingerprints for incremental drift detection.
- **Sift event stream integration** -- reads JSONL event signals from `.complai/events/moment/` for upstream change detection and reconciliation triggering.
- **Implementation feedback journal** -- records developer decisions (accept, reject, skip) about change proposals, building a history for future reconciliation improvements.
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
| `SyncState` | Persistent record of specification-implementation alignment timestamps and fingerprints. Event-sourced aggregate with `ProposalRecorded`, `ProposalAccepted`, `ProposalRejected`, `ProposalSkipped`, and `CursorAdvanced` events. |
| `ReconciliationState` | Tracks upstream fingerprints and reconciliation progress. Accepts `DetectUpstreamDriftInput`, `StartReconciliationInput`, and `CompleteReconciliationInput`. |

### Feedback

| Export | Description |
|--------|-------------|
| `ImplementationFeedbackJournal` | Records developer decisions about change proposals via `RecordImplementationFeedbackInput`. Produces `ImplementationFeedbackRecorded` events. |

### Reconciliation

| Export | Description |
|--------|-------------|
| `PushFlowSaga` | Orchestrates end-to-end reconciliation, classifying changes as Category 1 (applied), Category 2 (drift), or Category 3 (breaking). Produces a sequence of saga events tracking progress. |

### Event Stream

| Export | Description |
|--------|-------------|
| `SiftEventStreamReader` | Reads JSONL event signals from `.complai/events/moment/` for upstream change detection. Returns `SiftEventStreamReadResult`. |

### Infrastructure

| Export | Description |
|--------|-------------|
| `LocalGitArtifactStore` | Manages versioned snapshots of generated artifacts using the local Git repository for comparison and rollback. |
| `LocalGitArtifactWriter` | Writes artifact files to the local Git repository with commit metadata. |
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

### Running Cascade Reconciliation

```typescript
import { PushFlowSaga } from '@mmmnt/sync';

const saga = new PushFlowSaga();
const result = await saga.execute({
  specPath: 'path/to/spec.moment',
  implementationDir: './src/domain/',
});

console.log(`Outcome: ${result.outcome}`);

switch (result.outcome) {
  case 'APPLIED':
    console.log('All changes applied cleanly (Category 1).');
    break;
  case 'DRIFT':
    console.log('Manageable drift detected (Category 2). Review proposed changes:');
    for (const action of result.actions) {
      console.log(`  ${action.description}`);
    }
    break;
  case 'BREAKING':
    console.log('Breaking changes require manual intervention (Category 3):');
    for (const action of result.actions) {
      console.log(`  ${action.description}`);
    }
    break;
}
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
                                                          +-- @mmmnt/cli      (exposed via `moment sync`, `moment reconcile`, `moment status`)
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
