# ADR-034: Gap Analysis — Project-Level Execution (MMNT-5418)

**Status:** Draft
**Date:** 2026-04-10
**Relates to:** MMNT-5418, ADR-032 (Project-Level Execution Model), ADR-033 (Manifest-Driven Watch), GitHub #135

## Context

MMNT-5418 defines 11 requirements (R1–R11) for project-level execution, generator registry expansion, and watch mode rewiring. ADR-032 and ADR-033 cover the architectural vision. A two-day hardening sprint (PRs #136–#149) shipped prerequisites including disk-write fixes, path-traversal guards, CI gates, and the `serve <facet-dir>` feature.

Before executing against the requirements, this ADR identifies gaps, ambiguities, and unresolved design decisions that need answers. Each gap references the specific requirement it blocks, the question that needs answering, and the risk of proceeding without an answer.

## Gap Analysis

### G1 — Multi-file IR merging strategy
**Blocks:** R2 (Project-Mode Execution)

R2 says "resolve referenced contexts + flows" but doesn't specify how multiple parsed IRs combine into one. `MomentParser.parseContent()` takes a single string and returns one `IntermediateRepresentation`. In a project with 13 contexts and 11 flows across 24 files, the parser runs 24 times.

**Unresolved questions:**
- Is IR merging a flat concatenation of `contexts[]`, `flows[]`, `relationships[]` arrays? (We tested this during the serve sprint — concatenating `.moment` files before parsing works, but that's a parser-level workaround, not an IR-level merge.)
- Do cross-file references (e.g., a flow lane referencing a context defined in another file) resolve during parsing or during a post-merge validation pass?
- If two files declare a context with the same name, is that an error, a merge, or last-writer-wins?
- Where does this code live? `@mmmnt/core` (new `ProjectLoader` class) or `@mmmnt/cli` (in the project-mode dispatch)?

**Recommendation:** New `ProjectLoader` in `@mmmnt/core` that takes a list of file paths, parses each, and produces a single merged IR. Cross-file validation happens as a post-merge pass. Duplicate context names are an error. This is the single biggest prerequisite — nothing else in R2 works without it.

---

### G2 — GeneratorRunContext and GeneratorRunResult contracts
**Blocks:** R1 (Generator Registry)

The `GeneratorDescriptor` interface defines `run: (ctx: GeneratorRunContext) => Promise<GeneratorRunResult>` but neither `GeneratorRunContext` nor `GeneratorRunResult` is specified.

**Unresolved questions:**
- What does `GeneratorRunContext` contain? The merged IR? The derived topology? Both? The manifest config for this specific generator? The resolved output directory?
- How does a generator access the output of an upstream dependency? (e.g., `cucumber-json` depends on `gherkin` — does it receive the gherkin output files, the in-memory gherkin data, or both?)
- What does `GeneratorRunResult` return? A list of files written? Diagnostics? Both? Is it responsible for writing files, or does it return in-memory content and the framework writes?
- Does the framework call `assertPathWithin` on generator outputs, or is each generator responsible for its own path safety?

**Recommendation:** `GeneratorRunContext` should provide `{ ir, topology, manifestDir, outputDir, options, upstreamOutputs: Map<string, GeneratorRunResult> }`. `GeneratorRunResult` should return `{ files: Map<string, string>, diagnostics: Diagnostic[] }` (in-memory content, not pre-written). The framework writes files with the shared `assertPathWithin` guard. This keeps generators pure and path-safety centralized.

---

### G3 — Circular dependency between registry and generator packages
**Blocks:** R1 (Generator Registry)

R1 says the registry lives in `@mmmnt/core`. But concrete `GeneratorDescriptor` instances need to import generator functions from `@mmmnt/derive`, `@mmmnt/emit-ts`, `@mmmnt/generate`, and `@mmmnt/viz`. Those packages already depend on `@mmmnt/core` for the IR types. Adding `@mmmnt/core` → `@mmmnt/derive` creates a circular dependency.

**Unresolved questions:**
- Does the registry hold the descriptors, or does each package register itself at import time?
- If self-registration, what's the entry point that triggers all packages to register? (The CLI? A shared bootstrap module?)
- If the registry is just the `GeneratorDescriptor` interface type (no concrete descriptors), where do the concrete descriptors live?

**Recommendation:** `@mmmnt/core` exports only the `GeneratorDescriptor` interface and a `GeneratorRegistry` class with `register(descriptor)` and `resolve(format)` methods. Each generator package (`@mmmnt/derive`, `@mmmnt/emit-ts`, etc.) exports a `registerGenerators(registry)` function. The CLI's project-mode bootstrap calls all of them. No circular deps.

---

### G4 — `sources` vs `contexts`/`flows` coexistence
**Blocks:** R3 (Manifest Schema Updates)

R3 adds a new `sources` field with glob support alongside the existing `contexts`/`flows` FileRef arrays. The relationship between them is unspecified.

**Unresolved questions:**
- Can a manifest have both `contexts: [...]` and `sources.contexts: [...]`? If so, are they merged or is one preferred?
- Is the existing `contexts`/`flows` format deprecated? If so, what's the migration path?
- Do globs in `sources` resolve relative to the manifest directory (consistent with FileRef paths) or to `--cwd`?

**Recommendation:** `sources` takes priority when present. If `sources` is absent, fall back to `contexts`/`flows`. Both present is a validation error — don't allow ambiguity. Globs resolve relative to the manifest directory (consistent with FileRef). Deprecation notice on `contexts`/`flows` when `sources` is available but don't remove in 0.4.0.

---

### G5 — `moment serve` in project mode
**Blocks:** R2 (Project-Mode Execution)

R2 lists affected commands: `generate`, `derive`, `emit-ts`, `test`, `viz`, `lint`, `simulate`, `cucumber-json`, `parse`. **`serve` is not listed.** But `serve` is the command users run most during development, and it's currently file-scoped.

**Unresolved questions:**
- Does `moment serve` (no args) read the manifest, build the full project, and serve everything over WebSocket?
- Or does it combine with the facet-dir mode from #139 — i.e., `moment generate` bakes the project, then `moment serve <facet-dir>` serves it?
- If serve gains project mode, does it watch for changes (combining R2 + R5)?
- How does the WebSocket payload change for multi-flow projects? Currently `WsInitialLoad` inlines all flows' topologies and scenarios. With 11 flows, that payload could be large.

**Recommendation:** Add `serve` to R2's affected commands. Project-mode `serve` reads the manifest, builds via the generator DAG (topology + facet generators), and serves the result. File changes trigger incremental rebuild + WS push (combining serve with R5's watch rewiring). This replaces the current two-step `simulate → serve` workflow. The existing `serve <facet-dir>` mode (PR #139) becomes the "pre-baked" fallback for CI/demo scenarios where you don't want live derivation.

---

### G6 — Output path collision semantics
**Blocks:** R1 (Generator Registry), R8 (Parallelism)

The risk table mentions "Namespace outputs as `<outputDir>/<format>/<relativeInputPath>.<ext>`" but this isn't formalized in any requirement.

**Unresolved questions:**
- Two generators writing to the same `outputDir` (e.g., `typescript` and `test-scaffold` both writing to `src/generated/`) — who owns which paths?
- The current `TypeScriptEmitter` writes to `src/<context>/<aggregate>.types.ts`. Under the new scheme, does it write to `<outputDir>/<context>/<aggregate>.types.ts` or `<outputDir>/typescript/<context>/<aggregate>.types.ts`?
- If a generator's `outputDir` is explicitly set to the same path as another generator, is that an error?

**Recommendation:** Each generator owns its `outputDir` exclusively. Two generators with the same `outputDir` is a manifest validation error. The path within `outputDir` is the generator's choice (not framework-mandated). The ledger (R6) tracks which generator wrote which file, so cleanup is per-generator even if paths overlap by mistake.

---

### G7 — Ledger versioning and migration
**Blocks:** R6 (Incremental Build and Output Ledger)

R6 defines the ledger schema but doesn't address what happens when the schema changes in a future release.

**Unresolved questions:**
- Does the ledger have a `version` field?
- What happens when a user upgrades Moment and the ledger format has changed? Full rebuild? Migration? Error?
- Is the ledger committed to version control or `.gitignore`d?

**Recommendation:** Ledger includes `{ version: 1, entries: [...] }`. On version mismatch, log a warning and trigger a full rebuild (safe default). Ledger should be `.gitignore`d — it's a local cache, not a shared artifact. Different developers may have different build states.

---

### G8 — Cross-file validation timing
**Blocks:** R2 (Project-Mode Execution), G1 (IR merging)

When 24 files are parsed independently, cross-file references (flow lanes referencing contexts, crossings referencing target contexts by name) can't be validated per-file.

**Unresolved questions:**
- Does the Langium validator run per-file (with false negatives for cross-file refs) or on the merged IR?
- If per-file, is there a separate cross-file validation pass after merging?
- What diagnostics does a cross-file validation failure produce? File + line number pointing at the referencing file, or just the unresolved name?

**Recommendation:** Parse each file independently (Langium validators run per-file, accepting unresolved cross-file refs as warnings rather than errors). After merging, run a dedicated `CrossFileValidator` on the combined IR that re-checks all previously-warned references. This avoids re-architecting the Langium validator while still catching real cross-file errors.

---

### G9 — `test-scaffold` as separate generator (breaking change)
**Blocks:** R1 (Generator Registry), R4 (Default Generators)

R1 says `test-scaffold` becomes a separate generator. Currently, `moment generate` produces BOTH `.feature` files (gherkin) AND `.spec.ts` files (test-scaffold) in one command — this is "Design Principle #2" documented in the codebase.

**Unresolved questions:**
- Does separating `test-scaffold` from `generate` violate Design Principle #2 ("every temporal flow produces BOTH .feature AND .spec.ts")?
- If a manifest includes `gherkin` but not `test-scaffold`, is that a warning? An error? Silently allowed?
- How is this communicated as a breaking change to existing users?

**Recommendation:** Separate the generators but enforce Design Principle #2 as a manifest lint rule, not a hard constraint. If `gherkin` is declared without `test-scaffold` (or vice versa), emit a warning diagnostic: "Design Principle #2 recommends declaring both gherkin and test-scaffold." Don't error — the user may have a legitimate reason to skip one. Document the breaking change in the 0.4.0 CHANGELOG.

---

### G10 — `moment sync status` in project mode
**Blocks:** R2 (Project-Mode Execution)

R2 doesn't list `sync status`, `sync propose`, or `sync accept` in the affected commands. The Non-Goals section says "Replacing @mmmnt/sync cascade reconciliation" is out of scope. But `sync status` IS a common developer workflow command that would benefit from project mode.

**Unresolved questions:**
- Does `moment sync status` (no positional) check drift across ALL generated TypeScript files for all contexts?
- Does it need the full generator DAG, or just the `typescript` generator's output?
- Given that `sync accept` and `sync propose --auto-accept` are currently guarded as "not implemented" (PR #149), is there any point adding project mode to sync commands in 0.4.0?

**Recommendation:** Defer sync commands from 0.4.0 scope. The sync feature has deeper issues (P1 #3 — the SyncState persistence and application pipeline) that need to be resolved before project-mode sync adds value. Revisit in 0.5.0 when the real sync implementation lands.

---

### G11 — `--cwd` vs manifest directory vs output root
**Blocks:** R2, R3, R11

Three different "base directory" concepts appear in the requirements with unclear relationships:
- `--cwd` (R11): the directory from which globs and relative paths are resolved
- Manifest directory (`dirname(manifestPath)`): where the manifest lives, currently used by `ManifestReader` for file-ref validation and our path-traversal guards (#146)
- `output.root` (R3): the base for all generator output directories

**Unresolved questions:**
- Are `--cwd` and the manifest directory always the same? If not, which one wins for glob resolution?
- Is `output.root` relative to the manifest directory or to `--cwd`?
- How do the path-traversal guards from #146 interact with `output.root`? If `output.root` is `../shared-output`, does that fail the validation?

**Recommendation:** `--cwd` defaults to `.` (process cwd). Manifest is loaded from `--cwd/.manifest.yaml` (or `--manifest <path>`). All relative paths in the manifest resolve against the manifest directory (consistent with current behavior and #146's guards). `output.root` is relative to the manifest directory and must pass `assertPathWithinManifestDir` — if you want shared output, use an absolute path (which #146 rejects) or a symlink. This is a deliberate security-over-convenience tradeoff.

---

### G12 — Execution order and determinism across platforms
**Blocks:** R7 (Globs), R8 (Parallelism)

R7 says "Sort results lexicographically after resolution." R8 says "independent nodes run concurrently." These interact: if glob order matters for anything downstream (e.g., the order contexts appear in the merged IR, which affects CHANGELOG ordering, TypeScript barrel exports, etc.), then parallelism can introduce nondeterminism.

**Unresolved questions:**
- Does the IR merge order matter? (e.g., `contexts[0]` is "Ordering" on one run and "Fulfillment" on another)
- If generators run in parallel, are their file-write operations serialized (to avoid partial writes being visible to other generators)?
- Is the ledger written atomically or incrementally?

**Recommendation:** Glob results are sorted lexicographically. IR merge order follows glob order (deterministic). Generator outputs are buffered in memory and written to disk atomically per-generator (all files or none). Ledger is written atomically after all generators complete. This preserves determinism regardless of DAG parallelism.

## Decision

This ADR does not make a single architectural decision. It catalogs 12 gaps that must be resolved before MMNT-5418 execution begins. Each gap includes a recommendation; the final decisions should be recorded as amendments to ADR-032 / ADR-033 or as new focused ADRs.

## Recommended execution order

Based on dependency analysis of the gaps:

```
Phase 1: Foundation (unblocks everything else)
  G1  Multi-file IR merging → new ProjectLoader in @mmmnt/core
  G2  GeneratorRunContext/Result contracts → finalize the interface
  G3  Registry package boundary → self-registration pattern

Phase 2: Schema (unblocks project mode)
  G4  sources vs contexts/flows → migration strategy
  G11 --cwd / manifest dir / output root → resolve base-directory semantics
  G7  Ledger versioning → schema with version field

Phase 3: Command wiring (the bulk of R2)
  G5  serve in project mode → add to R2 scope
  G8  Cross-file validation → CrossFileValidator after merge
  G10 sync deferral → explicitly exclude from 0.4.0

Phase 4: Breaking changes (needs communication plan)
  G9  test-scaffold separation → lint rule, not hard constraint
  G6  Output path collision → exclusive outputDir ownership
  G12 Determinism → sorted globs, atomic writes, atomic ledger
```

## Consequences

- Resolving G1–G3 (Phase 1) is the minimum viable prerequisite for any R2 work. No project-mode command can be implemented until `ProjectLoader` and the registry interface exist.
- G5 (serve in project mode) is the highest-value user-facing addition but depends on Phase 1 + the watch rewiring (R5). It should be the last command wired, not the first.
- G9 (test-scaffold separation) is the only breaking change. It needs a migration guide and a deprecation cycle.
- G10 (sync deferral) reduces scope by ~3 commands, which is significant for the 0.4.0 timeline.
