# ADR-024: Git Artifact Retrieval — Trees API + Semantic Index

Migrated from Confluence page 44793858 (version 1, last updated 2026-03-31), https://winnovation.atlassian.net/wiki/spaces/MMMNT/pages/44793858. The Confluence space is private; this file is now the record.

- **Status:** Proposed
- **Date:** 2026-03-31
- **Author:** Claude (AI agent session)
- **Scope:** @mmmnt/sync, @mmmnt/cli, @mmmnt/mcp, platform
- **Supersedes:** None
- **Relates to:** [ADR-022](ADR-022-cascade-execution-architecture.md) (Cascade Execution Architecture), ADR-029 (Document Storage & Provider Projection, Sift), PADR-009-PLAT (Cascade Execution Infrastructure)

## Context

Moment's CLI and cloud services need to read implementation artifacts (TypeScript files, decision documents, generated code) to perform drift detection, sync operations, and reconciliation. Three problems make naive file reads untenable:

- AI context limits: Decision files, specifications, and generated artifacts will exceed AI agent context windows. Full-file reads of all project documentation cannot fit in a single session. The filesystem is not a scalable retrieval surface for AI-assisted workflows.

- Service token/size limits: External services (Confluence, Jira APIs) impose payload size limits that are hit daily in this project. Documentation cannot scale through these services alone.

- Deployment context divergence: The CLI operates on a local git working tree (readFileSync), but Moment Cloud operates remotely via GitHub API. A unified retrieval abstraction is needed so commands like sync status work identically in both contexts.

[ADR-029](ADR-029-moment-m6-output-changes-facet-integration-impact.md) (Sift) established that git is a projection target, not primary storage. [ADR-022](ADR-022-cascade-execution-architecture.md) established that .moment files and generated artifacts live in git repositories. PADR-009-PLAT established that the platform uses GitHub installation tokens to interact with git-resident artifacts. What's missing is the retrieval protocol — how consumers query and fetch specific artifacts without loading everything.

## Decision

### 1. Git Repository as Artifact Store

Each customer project has a dedicated git repository (created on GitHub account connection). All Moment artifacts are stored in this repository:

- .moment/ — specification files

- .moment/generated/ — emitted TypeScript, Gherkin, topology files

- .moment/index.json — semantic index (see Decision 3)

- .domain/ — event-sourced aggregate journals (JSONL)

### 2. GitHub Trees API for Structure Discovery

Consumers discover available artifacts using the GitHub Git Trees API:

```
GET /repos/{owner}/{repo}/git/trees/{tree_sha}?recursive=1
```

This returns the full repository tree (paths + blob SHAs) in a single API call without cloning. Consumers use this to:

- Enumerate all .moment files and generated artifacts

- Determine which blobs to fetch based on path patterns

- Detect structural changes by comparing tree SHAs across commits

Individual file content is fetched via the Blobs API:

```
GET /repos/{owner}/{repo}/git/blobs/{blob_sha}
```

### 3. Semantic Index File (.moment/index.json)

A semantic index is maintained alongside artifacts in the repository. It is regenerated on every moment generate or moment derive invocation and committed with the artifacts.

```
interface MomentArtifactIndex {
  readonly version: 1;
  readonly generatedAt: string;           // ISO-8601
  readonly specHash: string;              // SHA-256 of concatenated .moment files

  readonly contexts: readonly ContextIndexEntry[];
  readonly flows: readonly FlowIndexEntry[];
  readonly artifacts: readonly ArtifactIndexEntry[];
  readonly decisions: readonly DecisionIndexEntry[];
}

interface ContextIndexEntry {
  readonly name: string;
  readonly specPath: string;              // e.g., ".moment/contexts/ordering.moment"
  readonly generatedPaths: readonly string[];  // e.g., [".moment/generated/ordering.ts"]
  readonly keywords: readonly string[];   // extracted from context, aggregates, events
}

interface FlowIndexEntry {
  readonly name: string;
  readonly contextName: string;
  readonly specPath: string;
  readonly steps: number;
}

interface ArtifactIndexEntry {
  readonly path: string;                  // relative to repo root
  readonly type: 'spec' | 'typescript' | 'gherkin' | 'topology' | 'journal';
  readonly contextName?: string;
  readonly generatedFrom?: string;        // spec path that produced this artifact
  readonly blobSha?: string;              // populated by CI/post-commit hook
}

interface DecisionIndexEntry {
  readonly code: string;                  // e.g., "SR-01", "PADR-004"
  readonly summary: string;
  readonly sourcePath: string;            // file containing the decision
  readonly lineNumber?: number;
}
```

### 4. GitArtifactStore Interface

All artifact reads go through a GitArtifactStore interface. Two implementations:

```
interface GitArtifactStore {
  /** Get the artifact index for the repository */
  getIndex(): Promise<MomentArtifactIndex>;

  /** Read a single artifact by path */
  readArtifact(path: string): Promise<string>;

  /** Read multiple artifacts by path (batch) */
  readArtifacts(paths: readonly string[]): Promise<Map<string, string>>;

  /** List artifacts matching a glob pattern */
  listArtifacts(pattern: string): Promise<readonly string[]>;

  /** Query artifacts by context name */
  queryByContext(contextName: string): Promise<readonly ArtifactIndexEntry[]>;
}
```

LocalGitArtifactStore — CLI context. Reads from the local working tree using fs.readFileSync. The index is read from .moment/index.json on disk.

RemoteGitArtifactStore — Cloud context. Uses GitHub Trees API for discovery and Blobs API for content. Authenticates via GitHub App installation token (per PADR-009-PLAT).

### 5. Retrieval Protocol for AI Sessions

AI agents (MCP server, Claude Code sessions) use the GitArtifactStore interface with scoped retrieval:

- Index first: Always read .moment/index.json first (~small payload)

- Query by relevance: Use queryByContext() or keyword matching on index entries to identify which artifacts are needed

- Fetch selectively: Read only the artifacts identified by the query — never the full corpus

- Decision code lookup: Use DecisionIndexEntry to locate specific architectural decisions without scanning all files

This solves the AI context limit problem: the index is small enough to always fit in context, and selective fetches keep total token usage bounded.

### 6. Index Maintenance

The index is regenerated automatically:

- CLI: moment generate and moment derive commands regenerate .moment/index.json as part of their output

- CI: Post-commit hook or CI step validates index freshness (compare specHash against actual .moment files)

- Cloud: Platform regenerates index on cascade events before committing artifacts

If the index is stale or missing, consumers fall back to tree enumeration + path-based heuristics.

## Consequences

### What becomes easier

- AI-assisted workflows: Agents can retrieve only relevant artifacts, staying within context limits

- Cross-context parity: CLI and cloud use the same retrieval interface, same query semantics

- Drift detection: sync status queries the index for generated paths, fetches expected + actual via the store

- Decision traceability: Decision codes are indexed and queryable without scanning source files

### What becomes harder

- Index maintenance: Every artifact-producing command must regenerate the index. Stale indexes degrade query quality.

- Additional abstraction: Commands that previously did readFileSync now go through GitArtifactStore

### What this enables

- Moment Cloud: Remote artifact access without cloning repositories

- MCP server: Scoped artifact retrieval for AI tool calls

- Scalable documentation: Decisions and specs grow without hitting context or API limits

## Alternatives Considered

### 1. Git-backed GraphQL projection (rejected)

Project artifacts into a queryable GraphQL layer rebuilt on push events. Rejected: heavy infrastructure, requires a separate service, and the Trees API + index achieves the same query capability with zero additional infrastructure.

### 2. Chunked artifact protocol (rejected)

Split each artifact into frontmatter + section files. Rejected: fragments the repository structure, complicates authoring, and the semantic index solves the same problem (selective retrieval) without changing the file layout.

### 3. MCP-based retrieval server (rejected as primary)

Build an MCP server wrapping git access. Rejected as primary retrieval mechanism: ties the solution to AI tooling. However, the MCP server SHOULD use GitArtifactStore as its backend — this is a consumer, not the abstraction itself.

### 4. Direct filesystem reads (status quo, rejected)

Continue using readFileSync for all artifact access. Rejected: doesn't work for cloud context, doesn't solve AI context limits, couples CLI to local filesystem.

## Cascade Impact

| ADR                                                                                  | Impact                                                             |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| [ADR-022](ADR-022-cascade-execution-architecture.md)                                 | Cascade targets now read via GitArtifactStore instead of direct fs |
| [ADR-023](ADR-023-simulation-output-contracts-topology-emission-and-trace-format.md) | Simulation output artifacts indexed in .moment/index.json          |
| PADR-009-PLAT                                                                        | Platform uses RemoteGitArtifactStore for cascade execution         |
| [ADR-029](ADR-029-moment-m6-output-changes-facet-integration-impact.md) (Sift)       | Aligns with git-as-projection-target; adds structured retrieval    |

## Relationship to Existing ADRs

| ADR                                                                                  | Relationship                                                |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| [ADR-022](ADR-022-cascade-execution-architecture.md)                                 | Extends: adds retrieval protocol to cascade execution       |
| [ADR-029](ADR-029-moment-m6-output-changes-facet-integration-impact.md) (Sift)       | Implements: git as projection target with structured access |
| PADR-009-PLAT                                                                        | Consumes: platform uses RemoteGitArtifactStore              |
| [ADR-023](ADR-023-simulation-output-contracts-topology-emission-and-trace-format.md) | Inputs: simulation artifacts are indexed entries            |

## Version History

| Version | Date       | Changes          |
| ------- | ---------- | ---------------- |
| 0.1     | 2026-03-31 | Initial proposal |
