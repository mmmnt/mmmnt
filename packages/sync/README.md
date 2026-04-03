# @mmmnt/sync

Implementation sync engine -- drift detection, AST diffing, reconciliation, and Sift event stream integration for keeping specifications and code in alignment.

[![License: FSL-1.1-Apache-2.0](https://img.shields.io/badge/License-FSL--1.1--Apache--2.0-blue.svg)](../../LICENSE.md)
[![npm version](https://img.shields.io/npm/v/@mmmnt/sync.svg)](https://www.npmjs.com/package/@mmmnt/sync)

## Overview

`@mmmnt/sync` monitors the relationship between your `.moment` specification and its TypeScript implementation, detecting when they diverge and providing tools to reconcile the differences. It ensures that your domain model and your codebase remain consistent as both evolve.

The AST diff engine compares the generated TypeScript output from `@mmmnt/emit-ts` against the actual implementation files on disk, producing a structured diff that identifies added, removed, and modified types, fields, and methods. The sync state tracker maintains a persistent record of when specifications and implementations were last aligned, so drift can be detected incrementally rather than requiring a full comparison each time.

For teams using Sift as an upstream domain modeling tool, the Sift event stream reader watches for new events in the `.complai/events/moment/` directory and feeds them into the reconciliation pipeline. The push flow saga orchestrates the end-to-end reconciliation process, classifying changes into categories -- clean applies, manageable drift, and breaking changes -- and producing actionable reconciliation plans. The local Git artifact store manages versioned snapshots of generated artifacts for comparison and rollback.

## Installation

```bash
npm install @mmmnt/sync
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

### Reconciliation

```typescript
import { ReconciliationState, PushFlowSaga } from '@mmmnt/sync';

const saga = new PushFlowSaga();
const result = await saga.execute({
  specPath: 'path/to/spec.moment',
  implementationDir: './src/domain/',
});

console.log(`Outcome: ${result.outcome}`);
// "APPLIED" — changes merged cleanly (Category 1)
// "DRIFT"   — manageable drift detected (Category 2)
// "BREAKING" — breaking changes require manual intervention (Category 3)

if (result.outcome !== 'APPLIED') {
  for (const action of result.actions) {
    console.log(`  Action: ${action.description}`);
  }
}
```

### Sift Event Stream Integration

```typescript
import { SiftEventStreamReader } from '@mmmnt/sync';

const reader = new SiftEventStreamReader();
const events = await reader.read({
  projectDir: '.',
  since: '2026-04-01T00:00:00Z',
});

console.log(`Found ${events.length} new upstream events`);
for (const event of events) {
  console.log(`  ${event.type} at ${event.timestamp}`);
}
```

### Local Git Artifact Store

```typescript
import { LocalGitArtifactStore } from '@mmmnt/sync';

const store = new LocalGitArtifactStore();
await store.snapshot({
  generatedDir: './generated/',
  label: 'pre-reconciliation',
});

// After reconciliation, compare against the snapshot
const delta = await store.compareWithSnapshot('pre-reconciliation', './generated/');
console.log(`Files changed since snapshot: ${delta.changedFiles.length}`);
```

## API Reference

### Diff Engine

| Export | Description |
|--------|-------------|
| `ASTDiffEngine` | Compares generated TypeScript output against implementation files, producing a structured diff of additions, removals, and modifications. |

### Sync State

| Export | Description |
|--------|-------------|
| `SyncState` | Persistent record of specification-implementation alignment timestamps and fingerprints. |
| `ReconciliationState` | Tracks the progress and outcome of an in-flight reconciliation operation. |

### Reconciliation

| Export | Description |
|--------|-------------|
| `PushFlowSaga` | Orchestrates end-to-end reconciliation, classifying changes as Category 1 (applied), Category 2 (drift), or Category 3 (breaking). |

### Event Stream

| Export | Description |
|--------|-------------|
| `SiftEventStreamReader` | Reads JSONL event signals from `.complai/events/moment/` for upstream change detection. |

### Artifact Management

| Export | Description |
|--------|-------------|
| `LocalGitArtifactStore` | Manages versioned snapshots of generated artifacts using the local Git repository for comparison and rollback. |

### Key Types

| Type | Description |
|------|-------------|
| `ASTDiff` | Structured diff result with changes, drift status, and summary. |
| `DiffChange` | A single change entry with type (added/removed/modified), path, and description. |
| `ReconciliationOutcome` | Enum: `APPLIED`, `DRIFT`, `BREAKING`. |
| `ReconciliationPlan` | List of actions required to reconcile specification and implementation. |
| `SiftEvent` | A parsed upstream event with type, timestamp, and payload. |

## Integration

`@mmmnt/sync` depends on `@mmmnt/emit-ts` for the generated TypeScript baseline. It interacts with:

- **@mmmnt/schema** provides lifecycle context so that expected schema transitions are not flagged as unexpected drift.
- **@mmmnt/harness** test results inform whether drift has caused behavioral regressions.
- **@mmmnt/mcp** exposes sync status and reconciliation through the `moment_status` and `moment_reconcile` tools.
- **@mmmnt/cli** exposes sync operations via the `moment sync`, `moment reconcile`, and `moment status` commands.

## License

[FSL-1.1-Apache-2.0](../../LICENSE.md)
