# Moment Toolchain Audit — Documented vs Built vs Working

**Date:** 2026-07-14
**Version audited:** v0.3.1, built from `main` @ `077e956` (12/12 packages compile clean, ~17s)
**Method:** End-to-end execution of every CLI command against a purpose-built pseudo-product
("VoltGrid", an EV-charging domain: 3 contexts, 9 commands, 7 events, 1 saga, 2 policies with
`chains-to`, 1 service, 1 flow with branch/terminal lanes, crossings with contracts, and every
documented grammar modifier), cross-referenced against the full MMMNT Confluence corpus
(PRD v0.11, ADR-001–036, DDD Passes 1–6, Grammar Reference v2, MMNT-5418).
**Recorded in flmnt** (`mmmnt/moment` workspace): entries `e2e-audit-matrix` (0121909b),
`doc-vs-built-gaps` (dd7eeac1), `go-portability-assessment` (f5135ef0), plus mistake entries
`mcp-startup-crash` (e8308b52), `sync-semantics-cluster` (cd206b3f), `doc-impl-gaps` (c5efb869).

Legend: ✅ works · 🔶 partial / works with caveats · ❌ missing or broken

---

## 1. CLI Commands — Documented vs Built vs Working

| Command | Documented in | Status | Audit result |
|---|---|---|---|
| `init` | PRD §5.12, ADR-006 | ✅ | Scaffolds project + manifest |
| `parse` | PRD §5.12 | 🔶 | Works (3 ctx + 1 flow); diagnostics carry **no source locations** (`<unknown>` instead of file:line:col) |
| `derive` | PRD §5.12 | ✅ | 1 suite / 12 cases |
| `generate` | PRD §5.12, ADR-032 | 🔶 | Works single-file; output quality good (Gherkin Rule/Scenario, tag taxonomy, contract fields). **Ignores `manifest.generators` / `outputDir` entirely** — hardcoded bundle, writes `features/` at root instead of configured `tests/features` |
| `emit-ts` | PRD §5.12 | ✅ | 14 files; `[deprecated "…" -> "…"]` → `@deprecated` JSDoc works |
| `test` | PRD §5.12, ADR-030 | ✅ | 12/12 incl. saga + policy structural cases (ADR-030 fix confirmed live) |
| `simulate` / `--all` / `--json` | PRD §5.12, ADR-023/029/031 | ✅ | `--all`: 5 scenarios (happy + branch-fault + 3 negative preconditions); `SimSaga.*` injection works; deterministic |
| `serve` | ADR-036 (orig. ADR-031) | ✅ | WebSocket on :4321 verified with live client — `initial-load` with topology + scenario + artifacts |
| `viz` | PRD §5.12, ADR-007/023 | ✅ | Emits `viz:initial-load` data envelope to stdout (no HTTP server — consistent with ADR-023's partial supersession of ADR-007) |
| `viz --bridge` | PRD §5.7.3 | ❌ | Flag doesn't exist; `serve` replaced it, PRD never corrected |
| `watch` | PRD §5.12, ADR-033 | 🔶 | Detects changes and re-parses, **regenerates nothing** — a stale-check, not a build loop (exactly ADR-033's complaint, unfixed) |
| `lint` | PRD §5.12 | ✅ | Catches drift + deprecated-field schema warning |
| `sync status` | PRD §5.12, ADR-022 | 🔶 | Reads **git blobs at HEAD**, not the working tree: non-git dir ⇒ 100% false drift; uncommitted changes invisible; `repoRoot = dirname(specfile)` breaks specs under `.moment/` (sync-status.ts:79). After commit: correct (1 drifted / 9 aligned) |
| `sync propose` | PRD §5.12 | 🔶 | Same git-HEAD semantics; detected committed field rename as Added+Removed pair. Display bug: prints `(symbolName, description, differenceType)` literally instead of values. Disagrees with `sync status` on drift count (different code paths) |
| `sync accept` | PRD §5.12 | ❌ | Guarded: "not yet fully implemented — accepted proposals are not persisted" (PR #149) |
| `schema status` | PRD §5.12 | ✅ | Field/phase/consumer table works |
| `schema deprecate` | PRD §5.12 | ❌ | Subcommand doesn't exist (only `status`) |
| `import --from-sift` | ADR-017, ADR-028 | ✅ | 4-event JSONL fixture → valid `fleet.moment` round-trip |
| `sift watch` | ADR-025, PRD §5.18.2 | ❌ | No such command |
| `status` | ADR-022 | ✅ | Unified dashboard (spec / sync / schema / upstream) |
| `reconcile --local` | ADR-022 | 🔶 | Graceful "no upstream configured"; `--event` path untested (needs CascadeRequired fixture) |
| `cucumber-json` | ADR-014 | ✅ | Valid Cucumber JSON |
| `auth login/status/logout` | ADR-026 | 🔶 | `status` works; `login`/`logout` present in dispatch, untested (interactive device flow) |
| `push` | PRD §5.9.4 (PushFlowSaga) | ❌ | No command |
| `manifest-from-types` | ADR-006 (V1.1) | ❌ | Never built (documented as post-V1 — acceptable) |
| `import-cml` | ADR-006 (V2+) | ❌ | Never built (documented as V2+ — acceptable) |
| Project mode (no positional) | ADR-032, MMNT-5418 R2 | ❌ | Usage error. Core pieces landed (#151 ProjectLoader, #153 registry/DAG) but CLI dispatch (MMNT-5432/5433) unshipped |
| `--version` / `--help` / `help` | table stakes | ❌ | `Error: Unknown command` |
| Exit codes 0–4 | ADR-034 R10 | ❌ | Every failure exits 1 |

---

## 2. Features / Subsystems — Documented vs Built

| Feature | Documented in | Status | Notes |
|---|---|---|---|
| Grammar: 21 constructs | Grammar Reference v2 | 🔶 | 20 of 21 parse. **`when <condition> [<lane>]` (branch-lane routing) is unparseable** — `WhenBlock` rule is `'when' condition=ID` only. `[deprecated]`, `(×N)`, `[optional]`, `[terminal]`, `[required]`, crossings, contracts all work |
| Classification annotations `@classification` / `@retention` / `@encryption` | PRD §5.1.4, Sift ADR-053 D4, Pass 5 rule table, SIM-01 | ❌ | Grammar rejects `@` outright |
| **Translation Layer (`@mmmnt/translate`)** — MomentSpecificationFold, convergence gate, rule table, schema reconciler, dual emitter | **ADR-025 (7 decisions), PRD §5.18 (12 subsections), DDD Passes 4–6, TL-01…TL-10** | ❌ | **Zero code. The package does not exist.** The most heavily modeled subsystem in the corpus (3 DDD passes) has no implementation |
| LSP server + `@mmmnt/vscode` extension | ADR-008 ("published alongside V1") | ❌ | No LSP anywhere; Langium used purely as a parser generator |
| TopologyEmitter, topology + seeds | ADR-023 | ✅ | `derive/engine/topology-emitter.ts`; feeds `serve`/`simulate` |
| event-catalog / impact-analysis / saga-state-machine / asyncapi | ADR-029 | 🔶 | Generators exist (derive/generate); surfaced via `serve` payload + `simulate`, not as standalone CLI generator outputs |
| Completion assurance (`.moment/.staging`, `.moment/.assurance`, per-file sentinels) | ADR-018 | ❌ | Absent |
| Semantic index `.moment/index.json` (`MomentArtifactIndex`) | ADR-024 | 🔶 | `GitArtifactStore` exists and `sync`/`lint`/`status` use it; index generation never wired into `generate`/`derive` |
| Output ledger + incremental regeneration | ADR-033, MMNT-5418 R6 | ❌ | Absent |
| Generator registry (13 formats, DAG, deps) | ADR-032/034, MMNT-5418 R1 | 🔶 | Interfaces + DAG planner + ProjectLoader in `@mmmnt/core` (#151/#153); not consumed by CLI |
| Reactive policy chain (parse → derive → generate on change) | HG-01, PRD §5.15 | 🔶 | Watch fires parse only; downstream chain not wired |
| **MCP server (7 tools)** | ADR-022 | ❌ | Source exists; **bundle crashes at startup**: `Dynamic require of "util" is not supported` from `vscode-jsonrpc` (Langium LSP transitive dep) in the esbuild ESM bundle — the exact ESM/CJS bug class ADR-009's esbuild strategy was meant to eliminate. Entire AI-agent surface unusable |
| `@complai/projection` (TOON format negotiation) | ADR-023 §7 | ❌ | Package never created |
| Xray QMS CI import | ADR-014 | ✅ | Test Executions flowing through CI Run #631 (2026-07-09) |
| CI quality gates | ADR-010 | ✅ | CI green on main |
| Cloud (subgraph, Kafka, EDFS, sync rebinding) | ADR-018–021 | — | Explicitly future scope; not counted as a gap |

---

## 3. Test coverage reality (explains where the bugs cluster)

| Package | src LOC | test LOC |
|---|---|---|
| cli | 6,664 | **0** |
| sync | 3,439 | 3,043 |
| core | 2,913 | ~2,000 (in `__tests__/`) |
| derive | 2,104 | 3,114 |
| generate | 1,936 | 2,913 |
| schema | 1,629 | 831 |
| viz | 848 | 1,101 |
| mcp | 769 | 851 (unit-level; startup path untested) |
| emit-ts | 633 | 1,847 |
| harness | 469 | 1,378 |

The built/working line tracks the testing line almost perfectly: the deterministic core
(derive, generate, emit-ts, harness) is well-tested and passed everything; the operational
shell (`cli` — 0 tests despite ADR-009's Tier 2/3 CLI testing mandate — plus sync's untested
git semantics and mcp's untested startup) is where every failure lives. ADR-009's CLI testing
tiers are themselves a documented-never-built item.

---

## 4. The execution gap pattern

Cross-referencing spec dates against the code:

- **Specified before ~2026-03-28 → built.** M1–M6 shipped as releases 0.0.1–0.0.6
  (Mar 25 – Apr 4). Core pipeline, harness, viz, sync machinery, schema, CLI surface, MCP source.
- **Specified after → documentation only.** ADR-032/033/034 + MMNT-5418 (Apr 9–10):
  only the two core PRs (#151/#153) landed. ADR-025 / Translation Layer (Apr 17): zero code.
  Classification cascade + DDD Passes 4–6 (Apr 19–21): zero code. PRD v0.11 (Apr 20)
  describes the documented system, not the shipped one.

The documentation pipeline ran ~6 weeks past the point where the implementation pipeline
effectively stopped. Jira mirrors this: MMNT-5430–5434 still "Planned" while CI keeps running.

---

## 5. Go rewrite implications (Path 2 summary)

Full assessment in flmnt entry `go-portability-assessment` (f5135ef0). Highlights:

- **The tool's own TS is plain** — readonly interfaces, Records, functions. Zero decorators,
  conditional/mapped/`infer` types, Proxy/Symbol. Mechanically portable.
- **TS is consumed only shallowly**: the entire Compiler API footprint is 550 LOC across two
  sync files doing syntactic reads (interfaces, property signatures, type aliases, enums,
  imports). No type checker. `tree-sitter-typescript` or typescript-go covers it.
- **TS is produced as strings** (`emit-ts` uses no `ts.factory`).
- **Langium is only a parser generator here** — since no LSP shipped, replacing it with a
  hand-written recursive-descent parser (~2–2.5K LOC Go) loses nothing that exists and would
  fix the missing-source-location diagnostics.
- **Deps map 1:1**: isomorphic-git (12 basic ops) → go-git; chokidar → fsnotify;
  ws → gorilla/websocket; picomatch → doublestar; MCP SDK → mcp-go (fixes the MCP crash by
  construction); esbuild → eliminated (single static binary).
- **Conformance suite exists**: fixtures + golden outputs + byte-identical determinism
  contract + this audit's VoltGrid project make a port verifiable output-for-output.
- **Estimated port**: ~21K TS → 15–18K Go. Critical path: parser + IR + validators (~4–5K).
- **The LSP is the one honest Go gap** — but it is net-new work in *either* language today.
  Mitigation: keep `moment.langium` as the grammar source of truth for a thin TS-based
  language server (editor-side) coexisting with a Go toolchain binary (rust-analyzer/rustc
  precedent). The shared fixture corpus keeps the two grammars honest.

---

## 6. Immediate fix list (if staying on TS, ordered by leverage)

1. **MCP startup crash** — esbuild `banner` with `createRequire` shim, or cut the
   `vscode-jsonrpc`/LSP import path out of the MCP bundle (it shouldn't need it). Unblocks the
   entire AI surface. Hours.
2. **sync artifact-store semantics** — read the working tree (fall back to HEAD), derive
   repoRoot from the manifest/git root instead of `dirname(specfile)`. Turns sync from
   misleading to trustworthy. Days.
3. **CLI test suite** — ADR-009 Tier 2/3 as specified. Without it every other fix regresses.
4. **watch → regenerate** — even the naive "full `generate` on change" beats parse-only;
   the ledgered incremental version (ADR-033) can come later.
5. Grammar/docs reconciliation: implement or un-document `when … [lane]` and
   `@classification`; add source locations to diagnostics; add `--version`/`--help`.
