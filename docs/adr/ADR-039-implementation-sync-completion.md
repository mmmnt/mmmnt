# ADR-039: Implementation Sync Completion: persisted proposals, accept and reject, local commit, located spec edits

Rebuilt on 2026-11-24 from PR #181, the 0.6.0 release notes and the code; the original ADR document did not survive.

- **Status:** Accepted. The old wiki ADR index lists it as Accepted. No ruling text survives.
- **Date:** 2026-10-24, as the old wiki ADR index gives it.
- **Landed in:** e5b7fc1 (#181), merged 2026-10-29. Released in the `@mmmnt/*` 0.6.0 group.
- **Section numbers:** the section numbers below are the ones the code comments and tests cite (`ADR-039 §1` to `§5`). The headings are descriptive. The original wording of each section is lost.

## What this record can and cannot say

The decision text is gone. What survives is what the change did: the commits of #181, the changeset, the 0.6.0 changelog entry of `@mmmnt/core`, the summary in the old wiki ADR index, and the code that cites this ADR. This file states that. It does not restate context, alternatives or rationale that no source records.

## Summary (old wiki ADR index)

`moment sync propose` persists drift proposals in append-only JSONL logs in `.domain/`. `moment sync accept` and `moment sync reject` decide them with the deciding identity from git, record feedback in an append-only journal, and commit exactly the paths they name to the local repository. Implementation changes never edit the specification; `accept` prints the spec edit each proposal implies.

## Decision, as built

### §1. Three append-only logs in `.domain/`, and the deciding actor

Sync keeps three append-only JSONL logs in `.domain/`:

- `sync-state.jsonl` (sync state records),
- `implementation-feedback.jsonl` (the feedback journal),
- `push-flow-saga.jsonl` (push-flow records).

Loading replays every record through its aggregate's `apply()`, so a log that breaks an invariant is refused, naming the file and line. Accepted and rejected proposals carry the deciding actor: the repository's git `user.email`. Records written before this change have no actor.

### §2. Persisted proposals with stable ids

`moment sync propose` records implementation change proposals in `.domain/sync-state.jsonl`. A proposal's id is derived from its drift, so the same drift yields the same id on every run. A re-run records only new drift, and supersedes pending proposals whose drift is gone. A field-level proposal names the field, its type and its previous type.

### §3. Accept and reject

`moment sync accept` and `moment sync reject` decide pending proposals by id (`accept --all` takes every pending one). Every named proposal must be pending, or the whole run is refused and nothing is written. A run drives one push-flow saga. Each accepted proposal yields exactly one implementation feedback event. A rejection requires a reason and records no feedback.

### §4. Local commit and the sync cursor

A decision is committed to the local repository as the repository's own identity, with the decided ids in the commit body. The commit holds exactly the named paths, the `.domain/` sync logs, on top of HEAD. The working tree is left alone: a modified implementation file stays unstaged and uncommitted. There is no push and no network. A decided run then advances the sync cursor to the spec hash, in a commit of its own. If the commit fails, the records are kept, the saga is aborted, the cursor is left where it was, and the command exits non-zero.

### §5. The implied spec edit

Sync never edits the specification. `sync accept` prints the spec edit each accepted proposal implies, with every file and line that declares the construct. Declarations are found by an exact-text search of each `.moment` file (for `value-object Y`, `event Y`, `command Y` or `aggregate "Y"`). A construct declared in no file is printed as such. The architect makes the edit.

## Consequences

- The Sift event reader skips the `sync-state`, `implementation-feedback` and `push-flow-saga` logs that `moment sync` writes into `.domain/`. Before #183 (0.6.0 patch) it reported them line by line as malformed Sift events.
- `moment sync status` exits 1 when the implementation has drifted, so CI can gate on it. This came in #184, also in 0.6.0.

## Sources

- PR #181 body and its squash commit e5b7fc1.
- `.changeset/adr-037-039.md` and the 0.6.0 entry in `packages/core/CHANGELOG.md` (including #183 and #184). The 0.6.0 entry in `packages/cli/CHANGELOG.md` records only the dependency bumps.
- The old wiki `ADR-Index.md` at d8da1b8.
- Code at e5b7fc1 in `packages/sync` (`jsonl-sync-log-store.ts`, `proposal-id.ts`, `sync-decision.ts`, `local-git-sync-committer.ts`, `spec-edit.ts`, `sync-state-events.ts`) and in `packages/cli` (`sync-propose.ts`, `sync-reject.ts`, `lib/sync-decide.ts`, `sync-accept.test.ts`).
