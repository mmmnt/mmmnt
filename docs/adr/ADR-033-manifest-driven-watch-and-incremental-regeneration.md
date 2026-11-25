# ADR-033: Manifest-Driven Watch and Incremental Regeneration

Migrated from Confluence page 52690945 (version 1, last updated 2026-04-09), https://winnovation.atlassian.net/wiki/spaces/MMMNT/pages/52690945. The Confluence space is private; this file is now the record.

Text at the end of the page that was not part of the ADR was removed during migration.

- **Status:** Proposed

## Context

runWatch in packages/cli/src/commands/watch.ts:42 hardcodes paths: ['.moment/contexts', '.moment/flows'], ignoring the manifest's watch.paths. Its only on-change action is RegenerateOnMomentFileChanged.onFileChanged, which re-parses the file but does not actually regenerate anything. There is no change-to-generator mapping, no cleanup of orphaned outputs, and no reaction to manifest edits. The practical result is that moment watch is a stale-check, not a build loop.

## Decision

- runWatch consumes the manifest. It resolves sources via the same loader as runProjectMode (see ADR-032), watches every resolved source path, every directory under watch.paths, and .manifest.yaml itself unless watch.manifest === false.

- Change → affected subgraph. On a file change, the watcher computes the minimal set of generators impacted by that file (via the DAG) and runs only those. A change to a context file re-runs context-scoped generators for that context plus flow-scoped generators for flows that reference it (via existing IR dependency tracking). A change to a flow file re-runs flow-scoped generators for that flow only.

- Output ledger. A ledger at .moment/.output-ledger.json maps (sourceFile, generator) → { outputs: string[], irHash: string, generatorVersion: string, momentVersion: string }. Before running a generator, the runner compares the current IR hash (and Moment version) to the ledger entry; a match short-circuits the generator. A mismatch invalidates the entry and re-runs. The ledger is the authoritative record of what Moment has written; cleanup only removes files recorded in the ledger.

- Deletion cleanup. When a source file disappears, the watcher reads all ledger entries for that source, deletes the recorded outputs, and purges the ledger entries.

- Manifest changes. When .manifest.yaml changes, the watcher re-resolves sources, stops watchers for removed paths, starts watchers for new paths, and runs a full project build. Generator config changes invalidate every ledger entry for the affected generator.

- Debounce. Debounce windows are per-file and use watch.debounceMs from the manifest. Concurrent changes within the window coalesce into a single run.

- Initial build. watch.initial !== false triggers a full project build before entering the watch loop. This makes moment watch a drop-in replacement for moment generate && moment watch.

- Structured logging. Every watch event produces a single log line: [watch] \<event> \<source> → \<generators> with stable formatting for scripting.

## Consequences

- Positive: moment watch becomes the primary inner-loop command for Moment projects. Edit a .moment file, get updated .ts, .feature, topology, facet output within one debounce window.

- Positive: The ledger eliminates an entire class of "stale output" bugs and enables safe --force and --no-clean escape hatches.

- Positive: Manifest-driven watch composes with the sync/git flow in @mmmnt/sync — deletions cascade through cleanly.

- Negative: The ledger is a new piece of durable state. It must be robust to concurrent writers, partial crashes, and version skew. Corruption recovery is "delete the ledger; next run does a full rebuild."

- Negative: Incremental correctness requires that every generator accepts a stable IR hash. Emitters that embed timestamps or environment data in output must be audited or normalized.

- Negative: Hashing IR on every change adds CPU cost; must remain under the debounce window to be useful.

## Alternatives considered

- Rebuild everything on every change. Rejected for large projects: 24 files × 13 generators per keystroke is untenable even on fast hardware.

- File mtime as the cache key instead of IR hash. Rejected: mtime is noisy on format-on-save editors and under git operations.

- Separate ledger per generator instead of a single file. Rejected for V1: single ledger is simpler and keeps the write-back boundary obvious.

- Push watch responsibility into @mmmnt/sync. Rejected: sync is about upstream reconciliation, not local build cadence. Conflating them obscures both.

## Implementation sketch

- packages/core/src/runner/output-ledger.ts — ledger read/write with atomic replace.

- packages/core/src/runner/ir-hash.ts — canonical IR hash function.

- packages/core/src/runner/change-planner.ts — maps a changed path to affected (source, generator) pairs.

- packages/cli/src/commands/watch.ts — rewritten to consume the manifest, debounce, and invoke the DAG executor from ADR-032.

- packages/core/src/infrastructure/file-watcher.ts — extended to accept dynamic path sets (for manifest-change reconciliation).

## Related

- ADR-032 (project-level execution — this ADR's companion)

- [ADR-022](ADR-022-cascade-execution-architecture.md) §2 (moment status — reads the ledger)

- [ADR-024](ADR-024-git-artifact-retrieval-trees-api-semantic-index.md) (git artifact store — ledger semantics should not conflict)

- PADR-009 (cascade category rules — ensure manifest-driven cleanup doesn't collide with sync reconciliation)
