# ADR-022: Cascade Execution Architecture — Moment

Migrated from Confluence page 23396354 (version 1, last updated 2026-03-16), https://winnovation.atlassian.net/wiki/spaces/MMMNT/pages/23396354. The Confluence space is private; this file is now the record.

- **Status:** Proposed
- **Version:** 1.0
- **Date:** 2026-03-16
- **Parent ADR:** PADR-009: Cascade Execution Architecture
- **Parent Version:** 0.4

## Context

Moment is the only Complai product with a local CLI deployment. This gives it a unique position in the cascade execution architecture: Moment is both the primary cascade target (.moment files in git repositories are downstream of Sift domain specifications) and the only product that must deliver cascade awareness without any cloud dependency (Design Principle #15).

PADR-009 establishes three concerns that bind to Moment:

- Pattern C (Free Tier) — Local status checking and reconciliation using moment status and moment reconcile --local. These commands must operate on local files only, with no network calls and no Complai account.

- Pattern A (Paid Tier) — CI-initiated cascade PRs. The moment reconcile --event cascade-event.json command classifies cascades and produces deterministic changes, drift diagnostics, or breaking change reports for the GitHub Action workflow.

- @mmmnt/mcp server — A local MCP server wrapping the Moment CLI, published under the @mmmnt npm org, open-source under FSL-1.1-Apache-2.0. This is the AI agent integration surface for both free and paid tiers.

All three concerns converge on the @mmmnt/sync package, which owns the AST diffing, fingerprinting, and reconciliation logic that powers both the CLI commands and the MCP tools.

## Inherited Decisions

The following decisions from PADR-009 are adopted by Moment without modification:

- Cascade category classification — Category 1 (deterministic re-projection), Category 2 (structural drift), Category 3 (breaking change). Moment's reconciliation logic classifies incoming cascades into these categories.

- CascadeRequired event payload — Moment consumes the CascadeRequired event (Cloud path) or performs local diffing (Pattern C) to determine what changed upstream.

- Product tier boundary — All Moment CLI tools and @mmmnt/mcp are available on the free tier. Cloud cascade intelligence (Trace graph, cross-product provenance) is paid tier only.

- Local event signaling — .complai/events/moment/ directory for JSONL completion events. @mmmnt/mcp exposes a get-events tool to read from this directory.

- Git hook integration — moment status --quiet as post-merge or pre-commit hook. Warns but does not block (violations never block).

## Moment-Specific Decisions

### 1. @mmmnt/sync — Reconciliation Engine

The @mmmnt/sync package is the reconciliation engine for all cascade operations. It owns AST diffing, upstream fingerprint comparison, cascade category classification, and deterministic change application.

Upstream fingerprint tracking: When moment import --from-sift runs ([ADR-017](ADR-017-sift-to-moment-import-translation.md)), @mmmnt/sync records a fingerprint of the Sift specification state in .moment/.upstream-fingerprint.json. This fingerprint captures the content hash of the Sift output at import time. Subsequent moment status calls compare the current Sift output fingerprint against this stored value.

Fingerprint file structure:

```
{
  "sift": {
    "specificationId": "spec_abc123",
    "contentHash": "sha256:e3b0c44298fc...",
    "importedAt": "2026-03-16T10:30:00Z",
    "boundedContextCount": 5,
    "aggregateCount": 12,
    "domainEventCount": 34
  }
}
```

Cascade classification logic (Pattern C — local diff):

When moment reconcile --local runs without a CascadeRequired event, @mmmnt/sync performs a local diff:

- Reads the current Sift output from .domain/ (the Sift Published Language directory per Sift ADR-025).

- Compares against .moment/.upstream-fingerprint.json.

- If fingerprints match → no upstream change → exit code 0.

- If fingerprints differ → diffs the Sift specification at the element level (bounded contexts, aggregates, domain events, invariants, policies, sagas, projections, terms).

- Classifies each changed element:

- Added element with no .moment file references → Category 2 (drift — new element exists upstream but no temporal flow models it).

- Modified element where .moment file references are still structurally valid → Category 1 (deterministic — update the element reference in the AST, re-validate).

- Removed element where .moment files still reference it → Category 3 (breaking — upstream element no longer exists, AST references are dangling).

- Modified element where .moment file references may be semantically stale → Category 2 (drift — human judgment needed to determine if the temporal model needs updating).

Cascade classification logic (Pattern A — CascadeRequired event):

When moment reconcile --event cascade-event.json runs with a CascadeRequired event payload, the affectedElements array provides surgical classification without requiring a full diff:

- Parse affectedElements[] from the event payload.

- For each affected element, locate .moment files that reference it (via the AST cross-reference index maintained by @mmmnt/core).

- Apply the same classification rules as local diff, but scoped to only the affected elements.

- If no .moment files reference any affected element → APPLIED with no changes (upstream change doesn't touch Moment's scope).

### 2. moment status Command

Package: @mmmnt/sync (logic), @mmmnt/cli (command registration)

Behavior:

| Flag      | Output                                                                                                                                                                | Exit Code                         |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| (none)    | Human-readable summary: "Upstream Sift spec has changed since your last import. N elements added, M modified, K removed. Run moment import --from-sift to reconcile." | 0 if in sync, 1 if drift detected |
| --verbose | Element-level detail: which bounded contexts, aggregates, domain events changed, with change type (added/modified/removed)                                            | Same as above                     |
| --quiet   | No output                                                                                                                                                             | 0 if in sync, 1 if drift detected |
| --json    | Machine-readable JSON with full diff detail                                                                                                                           | Same as above                     |

No network calls. moment status reads only from:

- .moment/ — the local Moment specification files

- .moment/.upstream-fingerprint.json — the stored upstream fingerprint

- .domain/ — the current Sift Published Language output (if present)

No Complai account required. Design Principle #15 compliance.

No .domain/ directory: If no .domain/ directory exists (hand-authored .moment files with no Sift upstream), moment status reports "No upstream source configured" and exits 0. Moment is fully functional without Sift.

### 3. moment reconcile Command

Package: @mmmnt/sync (logic), @mmmnt/cli (command registration)

Two modes:

moment reconcile --local (Pattern C — free tier):

- Runs the local diff classification (§1 above).

- Category 1 changes: applies deterministic updates to .moment AST nodes (e.g., updates element name references, adjusts aggregate boundary references). Writes updated .moment files. Reports changes applied.

- Category 2 changes: generates a diagnostic report listing which .moment files may be stale and why. Does not modify files. Reports drift.

- Category 3 changes: generates a breaking change report listing dangling references. Does not modify files. Exits with code 1.

- Updates .moment/.upstream-fingerprint.json to reflect the current Sift output state.

moment reconcile --event \<path> (Pattern A — paid tier CI):

- Reads the CascadeRequired event payload from the specified file path.

- Runs the event-based classification (§1 above).

- Produces the same three outcomes as --local, but scoped to affected elements only.

- Exits with:

- Code 0 + stdout APPLIED — Category 1 only. Files modified. CI workflow opens a PR with cascade/deterministic label.

- Code 0 + stdout DRIFT — Category 2 present. Diagnostic generated. CI workflow opens a draft PR with cascade/drift and needs-review labels.

- Code 1 + stdout BREAKING — Category 3 present. Breaking report generated. CI workflow opens a PR with failing checks and cascade/breaking label.

Multi-category handling: When a single reconciliation produces mixed categories, the highest category wins (per PADR-009 §2.7). If any element is Category 3, the overall result is BREAKING. If any element is Category 2 and none are Category 3, the overall result is DRIFT. Only if all changes are Category 1 is the result APPLIED.

### 4. @mmmnt/mcp — Local MCP Server

Package: @mmmnt/mcp in the mmmnt/mmmnt GitHub monorepo.

License: FSL-1.1-Apache-2.0 ([ADR-013](ADR-013-software-license-fsl-1-1-apache-2-0.md)).

Published: @mmmnt npm org (listenrightmeeow — two e's).

Protocol: MCP (Model Context Protocol). Runs as a local stdio or SSE server on the developer's machine.

Dependencies: @mmmnt/core, @mmmnt/sync, @mmmnt/derive, @mmmnt/generate, @mmmnt/viz, @mmmnt/cli (re-uses CLI command implementations, does not shell out).

Tool inventory:

| MCP Tool   | CLI Equivalent                  | Description                                                                                                             | Category |
| ---------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | -------- |
| import     | moment import --from-sift       | Import Sift domain spec into .moment files. Returns import summary with element counts.                                 | Write    |
| validate   | moment validate                 | Validate .moment files against schema and upstream references. Returns validation result with any rule violations.      | Read     |
| emit-ts    | moment emit-ts                  | Generate TypeScript projections from .moment files. Returns generation summary with file count and coverage.            | Write    |
| viz        | moment viz                      | Generate visual diagrams of temporal flows. Returns diagram output path or SVG content.                                 | Read     |
| status     | moment status --json            | Check for upstream drift against local Sift output. Returns JSON diff with element-level detail.                        | Read     |
| reconcile  | moment reconcile --local --json | Apply deterministic cascade changes, report drift/breaking. Returns reconciliation result with category classification. | Write    |
| get-events | reads .complai/events/moment/   | Return local event stream for AI agent consumption. Returns JSONL events with optional time range filter.               | Read     |

Implementation pattern: Each MCP tool delegates to the same command implementation used by the CLI. The MCP server does not shell out to the moment binary — it imports the command modules directly from @mmmnt/cli and invokes them programmatically. This ensures identical behavior between CLI and MCP invocations and avoids process spawning overhead.

Tool descriptions: Each tool includes a rich description string that serves as the AI agent's primary documentation. Descriptions follow the same convention as PADR-009 §5.2 Cosmo MCP Gateway operation descriptions — they explain what the tool does, what it returns, and when to use it. Well-written descriptions are the entire AI integration for the local server, just as well-written .graphql operation descriptions are the entire AI integration for the cloud server.

Error handling: All tools return structured error objects with errorCode, message, and context fields. The MCP server never crashes on invalid input — it returns a tool error response per the MCP protocol specification.

Tier availability: Free and paid. @mmmnt/mcp is open-source, part of the @mmmnt monorepo, and requires no Complai account. It is the AI agent integration surface for Design Principle #15 compliance.

### 5. Local Event Signaling

Directory: .complai/events/moment/ in the project root.

Format: JSONL. One event per line. Files named by timestamp: {ISO-8601-timestamp}.jsonl.

Events emitted locally:

| Event                     | Trigger                            | Key Fields                                                                   |
| ------------------------- | ---------------------------------- | ---------------------------------------------------------------------------- |
| MomentReconcileCompleted  | moment reconcile finishes          | reconcileResult (APPLIED/DRIFT/BREAKING), affectedFileCount, categorySummary |
| MomentImportCompleted     | moment import --from-sift finishes | importedElementCount, specificationId, newFileCount                          |
| MomentValidationCompleted | moment validate finishes           | validationResult, ruleViolationCount                                         |
| MomentEmitTsCompleted     | moment emit-ts finishes            | generatedFileCount, specificationId                                          |

These events follow the ComplaiEventEnvelope structure ([ADR-021](ADR-021-event-payload-contract.md)) with ses_local_{userId} session identity. The @mmmnt/mcp get-events tool reads from this directory, enabling AI agents to poll for completion signals.

Relationship to cloud events: These local events are the file system equivalent of the Kafka events listed in [ADR-021](ADR-021-event-payload-contract.md). Same envelope structure, different transport. When Moment Cloud sync is implemented (post-V1), these local events can be synced via the SyncAnchor ([ADR-021](ADR-021-event-payload-contract.md) sync rebinding protocol).

### 6. Git Hook Integration

Hook: post-merge (recommended) or pre-commit.

Command: moment status --quiet

Behavior: Returns exit code 0 if in sync with upstream, exit code 1 if drift detected. No output in quiet mode.

Installation: Manual. Developer adds to .git/hooks/post-merge or configures via Husky/lefthook. Moment does not auto-install hooks — consistent with the "violations never block" principle.

pre-commit usage: When used as a pre-commit hook, moment status --quiet warns the developer that upstream drift exists before they commit. The hook returns a non-zero exit code as a warning, but the developer can bypass with --no-verify if they intentionally commit while drift exists. This preserves developer agency.

## Consequences

Positive:

- Moment delivers complete cascade awareness on the free tier via moment status and moment reconcile --local. No cloud dependency. No account required. Design Principle #15 preserved.

- @mmmnt/mcp gives AI agents full local control over Moment operations. The agent can check status, import, reconcile, validate, generate TypeScript, and read the event stream — all without cloud connectivity.

- The same @mmmnt/sync reconciliation engine powers both Pattern C (local) and Pattern A (CI). No divergent logic paths.

- Git hooks provide passive drift awareness without disrupting existing workflows. The developer sees a warning at the natural checkpoint (post-merge or pre-commit) rather than needing to remember to run a command.

- Local event signaling in .complai/events/moment/ enables deterministic automation scripts (PADR-009 §5.4 Consumer 2) to sequence operations based on Moment completion events.

- MCP tool implementations share code with CLI commands — no behavior divergence between the two invocation paths.

Negative:

- The upstream fingerprint file (.moment/.upstream-fingerprint.json) is a local state artifact that can become stale if the developer modifies .domain/ output manually without running moment import. Mitigated by: moment status always compares against the live .domain/ directory, not just the fingerprint — the fingerprint is the "last known import point," not the "expected state."

- Local cascade classification without affectedElements (Pattern C) requires a full diff of the Sift specification. For large specifications, this may be slower than the event-driven classification (Pattern A). Mitigated by: the diff operates on the AST cross-reference index (@mmmnt/core), not raw file comparison — element-level diffing is O(n) in element count, not file size.

- .complai/events/moment/ directory accumulates event files over time. No automatic cleanup. Mitigated by: event files are small (JSONL, typically <1KB per file) and can be safely deleted — they are signals, not source of truth.

## Relationship to Existing ADRs

| ADR                                                                                         | Relationship                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [ADR-017](ADR-017-sift-to-moment-import-translation.md) (Sift-to-Moment Import Translation) | [ADR-017](ADR-017-sift-to-moment-import-translation.md) defines SiftSpecificationImporter in @mmmnt/core. This ADR extends that import with upstream fingerprint tracking and reconciliation. moment reconcile builds on the same AST manipulation primitives as moment import --from-sift. |
| [ADR-021](ADR-021-event-payload-contract.md) (Event Payload Contract — Moment)              | Local event signaling (§5) follows the same ComplaiEventEnvelope structure defined in [ADR-021](ADR-021-event-payload-contract.md). Local events use ses_local_{userId} session identity per [ADR-021](ADR-021-event-payload-contract.md)'s CLI session identity pattern.                   |
| [ADR-013](ADR-013-software-license-fsl-1-1-apache-2-0.md) (Software License)                | @mmmnt/mcp is published under FSL-1.1-Apache-2.0, consistent with all @mmmnt packages.                                                                                                                                                                                                      |
| [ADR-018](ADR-018-completion-assurance-pipeline.md) (Completion Assurance)                  | MomentReconcileCompleted and MomentValidationCompleted events feed into the completion assurance pipeline (PADR-001). The local event files serve as the CLI-side assurance evidence.                                                                                                       |
| Moment Design Principle #15                                                                 | All operations in this ADR work without Complai cloud services. @mmmnt/mcp is independent. Pattern C is fully local.                                                                                                                                                                        |
| Moment Design Principle #16                                                                 | Sift is one optional input path. moment status gracefully handles the absence of .domain/ (no Sift upstream). Reconciliation only applies when Sift is the upstream source.                                                                                                                 |

## Version History

| Version | Date       | Changes                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.0     | 2026-03-16 | Initial publication. Binds PADR-009 v0.4 to Moment. Establishes @mmmnt/sync reconciliation engine with upstream fingerprint tracking, cascade category classification (local diff and event-driven), moment status command (4 output modes), moment reconcile command (2 modes: --local and --event), @mmmnt/mcp server with 7 MCP tools, local event signaling in .complai/events/moment/, and git hook integration. |
