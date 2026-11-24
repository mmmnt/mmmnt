# @mmmnt/sync

Detects drift between a Moment model and its TypeScript implementation, records it as proposals, and records the decision on each one.

[![License: FSL-1.1-Apache-2.0](https://img.shields.io/badge/License-FSL--1.1--Apache--2.0-blue.svg)](../../LICENSE.md)
[![npm version](https://img.shields.io/npm/v/@mmmnt/sync.svg)](https://www.npmjs.com/package/@mmmnt/sync)

## Overview

`@mmmnt/emit-ts` generates TypeScript types from a model. `@mmmnt/sync` compares that generated code (expected) with the implementation on disk (actual), type by type, and reports where they differ. Each difference becomes an implementation change proposal. A proposal's id is derived from the drift, so the same drift always has the same id.

Sync never edits the specification (IS-01). When an architect accepts a proposal, sync records the decision and reports the edit it implies, with the file and line that declare the construct. The architect makes the edit.

Decisions live in three append-only JSONL logs in `.domain/` (ADR-039):

| Log                             | Holds                                                                                                       |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `sync-state.jsonl`              | `SyncState`: proposals, decisions with the deciding actor, and the sync cursor                              |
| `implementation-feedback.jsonl` | `ImplementationFeedbackJournal`: exactly one `ImplementationFeedbackRecorded` per accepted proposal (IS-04) |
| `push-flow-saga.jsonl`          | One `PushFlowSaga` per accept or reject run                                                                 |

`JsonlSyncLogStore` replays each log through its aggregate's `apply()`, so a log that breaks an invariant is refused, naming the file and line.

The package also reads Sift event streams (`SiftEventStreamReader`, used by `moment import --from-sift` and `moment reconcile`), tracks upstream reconciliation (`ReconciliationState`), and wraps local git: reading artifacts, committing the sync logs, and resolving credentials.

## Installation

Requires Node.js 22 or newer.

```bash
npm install @mmmnt/sync
```

## Command-line workflow

The `moment` CLI (`@mmmnt/cli`) drives the sync lifecycle. Each command takes a `.moment` file or a model directory.

```bash
moment sync status spec/ticketwave.moment            # Drift detected: 1 drifted, 39 aligned
moment sync propose spec/ticketwave.moment           # record new drift as pending proposals
moment sync accept spec/ticketwave.moment prop-e02b7bd27ba948db   # or --all
moment sync reject spec/ticketwave.moment prop-dde1e5fa712bf6e6 --reason "reason stays a string"
```

| Command        | What it does                                                                                                                                                                                                             |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `sync status`  | Prints the drifted and aligned file counts. Exits 1 when anything has drifted. `--json` prints the `DriftReport`.                                                                                                        |
| `sync propose` | Records each new drift as a pending proposal, and supersedes pending proposals whose drift is gone. Decided proposals are left alone. `--json` prints `{ proposals, recorded, superseded }`. `--auto-accept` is refused. |
| `sync accept`  | Accepts the named pending proposals, or every pending one with `--all`, and prints the specification edit each implies.                                                                                                  |
| `sync reject`  | Rejects the named pending proposals. `--reason` is required.                                                                                                                                                             |

Where the files are:

- The generated files are compared with files at the same paths under the project root: the nearest directory above the spec with a `.manifest.yaml`, else the git root, else the spec's own directory. Files are read from the working tree first, then from HEAD.
- The `.domain/` logs sit beside a `.moment` file, or inside a model directory.

`sync accept` and `sync reject` refuse the whole run unless every named proposal is pending. The deciding identity is the repository's own `user.name` and `user.email` from git config, and the actor recorded is the email. The run is refused when either is missing or the repository has no commits. A run appends to the logs and commits only those log files, as `chore(sync): accept N proposal(s)` or `chore(sync): reject N proposal(s)`. It then advances the sync cursor in a second commit, `chore(sync): advance the sync cursor`. Nothing is pushed.

An accept prints the edit to make, for example:

```
Accepted 1 proposal(s) — committed da73b82:
  prop-e02b7bd27ba948db

Make these edits to the specification:
  prop-e02b7bd27ba948db: add field `channel: string` to command `ExtendHold`
    at ticketwave.moment:183
```

## What the diff compares

The diff reads the exported interfaces, type aliases and enums of each file present on both sides.

| Change in the implementation                    | Drift direction          | Proposal                                                     |
| ----------------------------------------------- | ------------------------ | ------------------------------------------------------------ |
| A field or enum member added                    | `implementation-added`   | `ValueObjectFieldAdded`                                      |
| A field or enum member removed                  | `implementation-removed` | `ValueObjectFieldRemoved`                                    |
| A field retyped, or a type alias changed        | `specification-added`    | `ValueObjectFieldRevised`                                    |
| An exported type added                          | `implementation-added`   | `ValueObjectDefined`                                         |
| An exported type removed                        | `implementation-removed` | `ValueObjectRemoved`                                         |
| A symbol changed kind (interface to type alias) | `specification-added`    | `ValueObjectFieldRevised`, with `requiresManualReview: true` |

A generated file with no counterpart on disk, or a file only on disk, is a drift point in `detectDrift` but yields no proposal. With `DeprecationMetadata` (a map of deprecated field to replacement field), a removed deprecated field also yields a `ValueObjectFieldAdded` proposal for its replacement.

## Library use

The CLI is a thin layer over these exports. This is `sync propose` followed by `sync accept`:

```typescript
import { readFileSync } from 'node:fs';
import { MomentParser } from '@mmmnt/core';
import { TypeScriptEmitter } from '@mmmnt/emit-ts';
import {
  ASTDiffEngine,
  JsonlSyncLogStore,
  LocalGitArtifactStore,
  commitPathsOnly,
  planDecision,
  resolveRepoIdentity,
} from '@mmmnt/sync';

const path = 'spec/ticketwave.moment';
const { ir } = await new MomentParser().parseContent(readFileSync(path, 'utf-8'), path);
if (!ir) throw new Error('The specification has errors');

// Expected: the generated TypeScript. Actual: the same paths, read from the repository.
const expected = new TypeScriptEmitter().emit(ir, { scope: { level: 'system' } }).files;
const identity = await resolveRepoIdentity('spec');
if (typeof identity === 'string') throw new Error(identity);
// readArtifacts throws when a file is missing; the CLI skips missing files instead.
const actual = await new LocalGitArtifactStore(identity.root).readArtifacts([...expected.keys()]);

const proposals = new ASTDiffEngine().generateProposals({ expected, actual });

// Replay the .domain/ logs; a corrupted line throws SyncLogCorruptedError (file and line).
const store = new JsonlSyncLogStore('spec/.domain');
const logs = store.load();
const recorded = proposals
  .filter((p) => logs.syncState.getProposalStatus(p.proposalId) === undefined)
  .map((p) => logs.syncState.recordProposal(p));
store.append({ syncState: recorded });

// Accept: one saga, one feedback event per accepted proposal.
const plan = planDecision(logs, {
  kind: 'accept',
  proposalIds: recorded.map((e) => e.proposalId),
  actor: identity.email,
  commitRef: identity.head,
});
if ('refused' in plan) throw new Error(plan.refused);
store.append(plan);

// Commit only the logs. The caller then records plan.saga.committed(oid) and plan.saga.complete().
const oid = await commitPathsOnly({
  root: identity.root,
  paths: [
    'spec/.domain/sync-state.jsonl',
    'spec/.domain/implementation-feedback.jsonl',
    'spec/.domain/push-flow-saga.jsonl',
  ],
  message: `chore(sync): accept ${plan.proposals.length} proposal(s)\n`,
  author: { name: identity.name, email: identity.email },
});
```

`commitPathsOnly` takes paths relative to `root`, `/`-separated. It commits exactly those files on top of HEAD, as `git commit --only` would, and leaves everything else in the working tree and index alone.

### Reporting drift

```typescript
import { ASTDiffEngine } from '@mmmnt/sync';

// expected and actual are maps of file path to source text, as above.
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
// 1 drifted, 39 aligned
//   [implementation-added] src/inventory/seat-hold.types.ts ExtendHold
//     Field 'channel' (readonly string) was added to 'ExtendHold'
```

### Reading a Sift event stream

```typescript
import { SiftEventStreamReader } from '@mmmnt/sync';

const result = new SiftEventStreamReader().read('.domain');

console.log(`Replayed ${result.eventsProcessed} events from ${result.filesRead} file(s)`);
for (const block of result.input.buildingBlocks) {
  console.log(`  ${block.contextName}: ${block.aggregates.length} aggregate(s)`);
}
for (const error of result.errors) console.warn(error);
```

`read(domainDir)` replays the Sift events in every `.jsonl` file of the directory into an import input. A missing directory is reported in `errors`, not thrown.

## API reference

### Diff and proposals

| Export                              | Description                                                                                                                                                                                                                                                                                                   |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ASTDiffEngine`                     | `detectDrift(DetectDriftInput)` returns a `DriftReport`. `generateProposals(GenerateProposalsInput)` returns `ImplementationChangeProposal[]`. `detectConsumption(DetectConsumptionInput)` scans source files for reads of known event types and fields, each with a confidence of `high`, `medium` or `low`. |
| `impliedSpecEdit(proposal, files)`  | The specification edit an accepted proposal implies, with every file and line that declares the construct. `files` maps path to `.moment` text.                                                                                                                                                               |
| `locateDeclarations(symbol, files)` | An exact-text search for `value-object Y`, `event Y`, `command Y` or `aggregate "Y"`.                                                                                                                                                                                                                         |
| `FEEDBACK_EVENT_TYPES`              | The feedback event types a proposal can imply.                                                                                                                                                                                                                                                                |

### State and decisions

| Export                                                           | Description                                                                                                                                                                                                                              |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SyncState`                                                      | Proposal lifecycle (pending, then accepted, rejected or superseded) and the sync cursor. Events: `ProposalRecorded`, `ProposalAccepted`, `ProposalRejected`, `ProposalSkipped` (superseded: the drift is gone) and `CursorAdvanced`.     |
| `ImplementationFeedbackJournal`                                  | Records one `ImplementationFeedbackRecorded` per accepted proposal (`RecordImplementationFeedbackInput`) and replays them through `apply()`.                                                                                             |
| `PushFlowSaga`                                                   | One accept or reject run: Diffing, Proposing, AwaitingConfirmation, Recording, Committing, Complete, or Aborted. The recorded count must equal the accepted count (IS-04).                                                               |
| `planDecision(logs, input)`                                      | Plans one accept or reject run. Returns a `DecisionPlan` (the proposals and the sync-state, feedback and saga events, with the saga at Committing), or `{ refused }` when a proposal is not pending or a rejection has no reason.        |
| `JsonlSyncLogStore`                                              | `load()` replays the three logs into `SyncLogs`. `append(SyncLogAppend)` appends events. `paths` lists the three files.                                                                                                                  |
| `SyncLogCorruptedError`                                          | Thrown by `load()`, with `file` and `line`.                                                                                                                                                                                              |
| `SYNC_STATE_LOG`, `IMPLEMENTATION_FEEDBACK_LOG`, `PUSH_FLOW_LOG` | The three log file names.                                                                                                                                                                                                                |
| `ReconciliationState`                                            | Tracks upstream fingerprints and reconciliation progress: `detectUpstreamDrift`, `startReconciliation`, `completeReconciliation`. Classifies drift into cascade category 1 (re-projection), 2 (structural drift) or 3 (breaking change). |

### Sift event stream

| Export                  | Description                                                                                                 |
| ----------------------- | ----------------------------------------------------------------------------------------------------------- |
| `SiftEventStreamReader` | `read(domainDir)` returns a `SiftEventStreamReadResult`: `input`, `eventsProcessed`, `filesRead`, `errors`. |

### Git

| Export                        | Description                                                                                                                                                                                                                     |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `resolveRepoIdentity(path)`   | The repository holding `path`: `root`, `name`, `email` and `head`. Returns a refusal message instead when any is missing.                                                                                                       |
| `commitPathsOnly(input)`      | Commits exactly the named paths on top of HEAD. Returns the commit oid.                                                                                                                                                         |
| `LocalGitArtifactStore`       | `new LocalGitArtifactStore(root, ref = 'HEAD')`. With HEAD it reads the working tree first and falls back to the commit; with another ref it reads that commit. Also reads and queries the `.moment/index.json` artifact index. |
| `LocalGitArtifactWriter`      | Writes and removes artifact files and the artifact index, and commits them with a configured author.                                                                                                                            |
| `LocalGitRemoteManager`       | `clone`, `push`, `pull`, `createBranch`, `checkout`, `currentBranch` and `listRemoteBranches`, with credentials from a `CredentialResolver`.                                                                                    |
| `LayeredCredentialResolver`   | Tries each `CredentialStrategy` in order. Throws when none returns credentials.                                                                                                                                                 |
| `EnvCredentialStrategy`       | A token from `MOMENT_GITHUB_TOKEN`, else `GITHUB_TOKEN`.                                                                                                                                                                        |
| `GhCliCredentialStrategy`     | A token from `gh auth token`.                                                                                                                                                                                                   |
| `GitCredentialHelperStrategy` | Credentials from `git credential fill` for a host (default `github.com`).                                                                                                                                                       |
| `OAuthDeviceFlowStrategy`     | A token cached in `~/.moment/credentials.json` (written by `moment auth login`). It ignores the file when others can read it, and ignores an expired token.                                                                     |

### Types

| Type                                                                                             | Description                                                                                                                         |
| ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `DriftReport`                                                                                    | `scope`, `driftPoints`, `totalDrifted`, `totalAligned`, `timestamp`                                                                 |
| `DriftPoint`                                                                                     | `filePath`, `aggregateName` (the symbol), `contextName`, `driftDirection`, `description`                                            |
| `DriftDirection`                                                                                 | `implementation-added`, `implementation-removed`, `specification-added` or `specification-removed`                                  |
| `ImplementationChangeProposal`                                                                   | `proposalId`, `proposedEventType`, `proposedPayload`, `sourceFile`, the originating `sourceDifference`, and `dualPopulationApplied` |
| `FeedbackEventType`                                                                              | One of `FEEDBACK_EVENT_TYPES`                                                                                                       |
| `ProposalStatus`                                                                                 | `pending`, `accepted`, `rejected` or `superseded`                                                                                   |
| `SyncCursor`                                                                                     | The specification hash, timestamp and last processed file at which spec and implementation were last reconciled                     |
| `CascadeCategory`, `CascadeClassification`, `ReconciliationResult`                               | Upstream drift classification and the outcome of a reconciliation                                                                   |
| `SyncStateRecord`, `ImplementationFeedbackRecord`, `PushFlowRecord`, `ReconciliationStateRecord` | Record shapes of the JSONL logs                                                                                                     |
| `SiftEventEnvelope`, `SiftEventType`, `SiftEventPayload`                                         | A parsed Sift event and its payload types                                                                                           |

## Integration

`@mmmnt/sync` depends on `@mmmnt/emit-ts` for the generated TypeScript (and through it on `@mmmnt/core`) and on `isomorphic-git` for local git.

| Consumer     | Uses                                                                                                                           |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `@mmmnt/cli` | `moment sync status\|propose\|accept\|reject`, `moment lint`, `moment status`, `moment reconcile`, `moment import --from-sift` |
| `@mmmnt/mcp` | The `moment_status`, `moment_reconcile` and `moment_import` tools                                                              |

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for what changed in each release.

## Contributing

This package is part of the [mmmnt monorepo](https://github.com/mmmnt/mmmnt). See [CONTRIBUTING.md](../../CONTRIBUTING.md) for development setup.

```bash
pnpm install
pnpm turbo build --filter=@mmmnt/sync
pnpm --filter @mmmnt/sync test
```

## License

[FSL-1.1-Apache-2.0](../../LICENSE.md)
