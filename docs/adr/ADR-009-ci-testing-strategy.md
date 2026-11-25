# ADR-009: CI & Testing Strategy

Migrated from Confluence page 12451843 (version 5, last updated 2026-03-10), https://winnovation.atlassian.net/wiki/spaces/MMMNT/pages/12451843. The Confluence space is private; this file is now the record.

- **Status:** Accepted
- **Date:** March 9, 2026
- **Deciders:** listenrightmeow, Claude (DDD Coaching Project)
- **Tags:** ci, testing, turborepo, github-actions, vitest, cucumber, changesets, esbuild, npm
- **Gap Report Ref:** N/A — Forward-looking implementation decision

## Context

The Moment monorepo ships 5 open-source packages + 1 CLI under the @mmmnt scope, each mapping 1:1 to an internal bounded context. The dependency graph creates a build ordering constraint:

```
@mmmnt/core (langium generate → tsc, zero deps)
  ├── @mmmnt/derive (tsc, depends on core)
  │     └── @mmmnt/generate (tsc, depends on derive)
  ├── @mmmnt/harness (tsc, depends on core)
  ├── @mmmnt/viz (tsc, depends on core)
  └── @mmmnt/cli (esbuild bundle, depends on core, derive, generate, viz)
```

Four properties of this system shape the CI and testing strategy:

- Langium build step: @mmmnt/core requires langium generate before TypeScript compilation. This produces the parser, AST types, and LSP services from the grammar file ([ADR-008](ADR-008-parser-technology-langium.md)). No other package has a pre-compilation code generation step.

- Deterministic pipeline: The entire system is a stateless transformation pipeline (Design Principle #6). Every operation is a pure function: same input, same output. This means snapshot testing is a natural fit — golden file comparison is sufficient to verify correctness for generators.

- Dual-format output: Generation always produces both TypeScript and Gherkin (Design Principle #4). The test suite must validate both formats, including verifying that generated Gherkin parses correctly under Cucumber.js 7+.

- CLI as executable artifact: The CLI package (@mmmnt/cli) is not a library — it's a leaf node that produces a user-facing executable. ESM-based Node.js CLIs are notoriously fragile: experimental flags, CJS/ESM interop, resolution differences between pnpm workspace symlinks and production node_modules. The build strategy must produce a self-contained bundle that eliminates these runtime resolution problems.

The PRD explicitly scopes out Moment-as-CI-component for consumers (§6: "Not a CI/CD pipeline component (V1)"). This ADR covers CI for the Moment project itself — building, testing, linting, and publishing the @mmmnt packages.

## Decision

### 1. Monorepo Tooling

Turborepo for task orchestration. pnpm workspaces for package management. This matches the Complai platform stack (Sift, Seam, Forge all use Turborepo + pnpm).

Monorepo root structure:

```
moment/
├── turbo.json
├── pnpm-workspace.yaml
├── .changeset/
├── .github/workflows/
├── packages/
│   ├── core/          → @mmmnt/core
│   ├── derive/        → @mmmnt/derive
│   ├── generate/      → @mmmnt/generate
│   ├── harness/       → @mmmnt/harness
│   ├── viz/           → @mmmnt/viz
│   └── cli/           → @mmmnt/cli
├── fixtures/          → shared .moment + .manifest.yaml test fixtures
└── docs/
```

### 2. Turborepo Pipeline

```
// turbo.json
{
  "pipeline": {
    "generate": {
      "outputs": ["src/generated/**"],
      "inputs": ["src/grammar/**/*.langium"]
    },
    "build": {
      "dependsOn": ["generate", "^build"],
      "outputs": ["dist/**"]
    },
    "test": {
      "dependsOn": ["build"],
      "outputs": []
    },
    "test:integration": {
      "dependsOn": ["build"],
      "outputs": []
    },
    "lint": {
      "outputs": []
    },
    "typecheck": {
      "dependsOn": ["generate", "^build"],
      "outputs": []
    }
  }
}
```

Key sequencing rules:

- generate runs only in core (the only package with a Langium grammar). Other packages define generate as a no-op or omit it. Turborepo caches the output — regeneration only triggers when .langium files change.

- build depends on generate (for core) and ^build (upstream packages built first). This enforces the dependency chain: core → derive → generate → cli.

- test depends on build — tests run against compiled output, not source. This catches type emission issues that source-only testing would miss.

- typecheck depends on generate and ^build — TypeScript type-checking needs the generated AST types from Langium and the compiled upstream .d.ts files.

- lint has no dependencies — runs in parallel with everything else.

### 3. Build Strategy: tsc for Libraries, esbuild for CLI

The Moment monorepo has two categories of packages with different build requirements:

Library packages (core, derive, generate, harness, viz) — consumed as npm dependencies by other packages and external consumers. These compile with tsc and emit both JavaScript output and .d.ts declaration files. Consumers import typed APIs. Standard TypeScript compilation, no bundling.

CLI package (cli) — a leaf node that produces an executable binary. esbuild bundles the CLI into a single self-contained .mjs file with a #!/usr/bin/env node shebang. All workspace dependencies (core, derive, generate, viz) are inlined into the bundle at build time. The consumer runs moment generate and it works — no ESM resolution chain to debug, no --experimental-\* flags, no runtime dependency on the monorepo's internal package structure.

This is the same pattern established for Sift: esbuild for executable artifacts (Sift uses esbuild for Lambda bundles), tsc for library packages consumed by other packages. Two tools, each doing what it's best at.

Why esbuild for the CLI specifically:

Node.js CLI tools built as ESM hit a well-known set of problems: --experimental-vm-modules, --experimental-specifier-resolution, interop between CJS dependencies and ESM entry points, and node_modules resolution differences between development (pnpm workspace symlinks) and production (npm install). These problems multiply when the CLI depends on workspace packages that themselves have transitive dependencies.

esbuild eliminates all of these by resolving and inlining everything at build time. The output is a single .mjs file that Node.js executes without any module resolution at runtime. The shebang makes it directly executable. The package.json "bin" field points at the bundled output.

Build configuration:

```
// packages/cli/build.mjs
import { build } from 'esbuild';

await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  outfile: 'dist/moment.mjs',
  banner: { js: '#!/usr/bin/env node' },
  external: [],  // bundle everything — no runtime resolution
  sourcemap: true,
});
```

Library build configuration (same across core, derive, generate, harness, viz):

```
// packages/core/tsconfig.json (relevant fields)
{
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "declaration": true,
    "declarationMap": true,
    "outDir": "dist",
    "target": "ES2022"
  }
}
```

"module": "NodeNext" with "moduleResolution": "NodeNext" is the TypeScript-recommended configuration for packages published as ESM. No experimental flags required by consumers.

### 4. Test Runner: Vitest

Vitest as the sole test runner for all packages. Rationale:

- Native ESM support — the @mmmnt packages publish as ESM

- First-class TypeScript support without a separate compilation step for tests

- Workspace-aware — single vitest.workspace.ts at the root, per-package vitest.config.ts for customization

- Snapshot testing built-in — critical for generator output verification

- Watch mode with Turborepo-compatible caching

- Coverage via @vitest/coverage-v8 — V8 native coverage, no Istanbul overhead

Cucumber.js is used specifically within @mmmnt/generate's test suite to validate that generated .feature files are syntactically valid and that generated step definitions wire up correctly. This is not a separate test runner — it's a library dependency of generate's Vitest tests.

### 5. Test Strategy Per Package

#### @mmmnt/core — Specification Context

Test categories:

| Category            | What It Validates                               | Approach                                                                                          |
| ------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Grammar acceptance  | Valid .moment files parse without errors        | Fixture corpus: fixtures/valid/\*.moment — each file must parse to a MomentData IR                |
| Grammar rejection   | Invalid .moment files produce correct errors    | Fixture corpus: fixtures/invalid/\*.moment — each file annotated with expected error IDs (V1–V17) |
| Invariant coverage  | All 17 validation rules (V1–V17) fire correctly | One test per invariant, minimal fixture targeting that specific rule                              |
| Manifest validation | 6 manifest invariants (M1–M6)                   | Fixture manifests with specific violations                                                        |
| Name resolution     | Lane-scoped name resolution, disambiguation     | Fixtures with ambiguous names, multi-lane specs                                                   |
| IR snapshot         | Parser produces correct MomentData IR           | Snapshot tests: parse fixture → compare IR against golden .json                                   |
| SchemaValidator     | Zod schema validation against manifest schemas  | Unit tests with valid/invalid payloads                                                            |

Fixture corpus: The fixtures/ directory at the monorepo root contains shared test fixtures used across packages. Core owns the valid/invalid grammar fixtures. The corpus grows with every bug fix — each parser bug gets a regression fixture.

Coverage target: 95%+ line coverage. The parser and validation engine are the highest-value correctness surface in the entire system.

#### @mmmnt/derive — Derivation Context

Test categories:

| Category               | What It Validates                                         | Approach                                                                    |
| ---------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------- |
| Construct completeness | All 18 DSL constructs produce derivation output           | One test per construct with a minimal fixture                               |
| Kind dispatch          | All 11 manifest entry kinds map to test categories        | One test per kind                                                           |
| Relationship dispatch  | 4+ relationship types produce correct contract assertions | One test per built-in type + one custom RelationshipTypeConfig              |
| Composition rules      | 6 composition rules for multi-context sequences           | Fixture specs with compound constructs                                      |
| Topology snapshot      | DerivationEngine produces correct TestSuiteTopology       | Snapshot tests: derive from fixture → compare topology against golden .json |
| Deduplication (D6)     | Same crossing across multiple specs not duplicated        | Multi-spec fixture with overlapping crossings                               |

Coverage target: 90%+ line coverage. The derivation matrix (18 × 11 × 4+) is the combinatorial core — snapshot testing covers the output space efficiently.

#### @mmmnt/generate — Generation Context

Test categories:

| Category               | What It Validates                                               | Approach                                                                                           |
| ---------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| TypeScript snapshot    | Generated .spec.ts matches golden output                        | Snapshot tests: topology → generated TS → compare against golden file                              |
| Gherkin snapshot       | Generated .feature matches golden output                        | Snapshot tests: topology → generated Gherkin → compare against golden file                         |
| Determinism (G1, G2)   | Same topology always produces identical output                  | Run generation twice, assert byte-identical output                                                 |
| Gherkin validity       | Generated .feature parses under Cucumber.js 7+                  | Parse generated features with @cucumber/gherkin parser — no step execution, syntax validation only |
| Step definition wiring | Generated step definitions are syntactically correct TypeScript | TypeScript type-check of generated .steps.ts files                                                 |
| Tag taxonomy           | 12-tag taxonomy correctly applied                               | Assert tag presence/absence on generated scenarios                                                 |

Cucumber.js integration: The generate test suite imports @cucumber/gherkin (the parser library, not the runner) to validate generated .feature files. This is a parse-only check — we verify syntax, not step execution. Step execution is the consumer's responsibility.

Coverage target: 90%+ line coverage. Snapshot tests are the primary verification mechanism — the invariants G1 and G2 (deterministic output) are the critical property.

#### @mmmnt/harness — Test Execution Context

Test categories:

| Category                 | What It Validates                                             | Approach                                                                                                                                     |
| ------------------------ | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Harness initialization   | InitializeTestContext sets up multi-aggregate stubs           | Unit tests with mock aggregates                                                                                                              |
| Event replay             | ReplayEventChain respects causal ordering (T2)                | Replay fixtures with known ordering, assert sequence                                                                                         |
| Contract assertions      | AssertContractObligation dispatches by relationship type (T3) | One test per relationship type — Partnership (bidirectional), Customer-Supplier (supplier-side), Conformist (schema), OHS/PL (compatibility) |
| Schema validation        | ValidatePayloadSchema delegates to SchemaValidator from core  | Valid/invalid payload tests against Zod schemas                                                                                              |
| Zero infrastructure (T1) | No external service calls                                     | Static analysis: no fetch, no net, no fs beyond fixture loading                                                                              |

Coverage target: 85%+ line coverage. The harness is a library consumed by generated test scaffolds — its API surface is smaller than core or derive.

#### @mmmnt/viz — Visualization Context

Test categories:

| Category                        | What It Validates                                      | Approach                                                                                                   |
| ------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Timeline rendering              | RenderTimeline produces correct TimelineLayout         | Snapshot tests: IR → layout → compare against golden .json                                                 |
| Sequence rendering              | RenderSequence produces correct SequenceLayout         | Snapshot tests: IR → layout → compare against golden .json                                                 |
| Renderer purity (VZ2)           | No side effects — pure function                        | Assert no I/O, no state mutation, no external calls                                                        |
| Dual-renderer consistency (VZ1) | Both renderers consume same IR without divergence      | Same IR → both renderers → assert both succeed or both fail                                                |
| PreviewServer                   | Local server starts, serves bundled app, watches files | Integration test: start server, HTTP request, verify response (Application Service — lighter coverage bar) |

Coverage target: 80%+ line coverage. Renderers are pure functions with snapshot verification. PreviewServer is infrastructure — tested for startup/serve, not exhaustive.

#### @mmmnt/cli — Application Layer (Three-Tier Testing Model)

CLI testing uses a three-tier model. This is the pattern used by ESLint, Prettier, Vitest itself, and most mature CLI tools. The tiers are complementary — each catches a different class of bug.

Tier 1: Unit tests on domain logic (already covered above)

All domain logic (parsing, derivation, generation, validation) is tested in the library packages. The CLI delegates to these packages. Tier 1 provides ~90% of correctness assurance. No CLI involvement.

Tier 2: In-process command handler tests (bulk of CLI-specific tests)

Import the CLI command handlers directly — before they're wrapped by the argument parser framework — and invoke them programmatically. Pass an options object, capture the result, assert on return value and side effects.

| Category                | What It Validates                                                                                             | Approach                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Command wiring          | generate handler calls parseFile → deriveTestCases → generateTypeScript + generateGherkin in correct sequence | Mock the domain functions, assert call order and arguments                             |
| Option mapping          | CLI flags (--outdir, --manifest, --check) map to correct handler options                                      | Invoke handler with options object, assert domain functions receive correct parameters |
| Error handling          | Invalid file paths, missing manifests, parse failures produce correct error objects                           | Invoke handler with bad inputs, assert error type and message content                  |
| moment init flow        | Init handler produces valid .manifest.yaml from mock prompt responses                                         | Invoke handler with stubbed prompts, validate YAML output against ManifestSchema       |
| moment generate --check | Staleness detection logic returns correct boolean                                                             | Invoke handler with matching/divergent fixtures, assert true/false return              |

These tests are fast (no subprocess, no I/O), reliable (no process lifecycle issues), and test the wiring between "user intent" and "domain function calls."

Tier 3: Subprocess end-to-end smoke tests (test:integration)

Spawn the actual compiled CLI binary as a child process using execa. Capture stdout, stderr, and exit code. Assert against expected output. These tests run against the esbuild-bundled .mjs file — the same artifact npm ships.

| Category                | What It Validates                                                               | Approach                                                                       |
| ----------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Binary execution        | The esbuild bundle is actually executable                                       | execaNode('./dist/moment.mjs', ['--version']) → exit 0, stdout matches version |
| moment parse            | Valid file → exit 0 + success stdout; invalid → exit 1 + stderr with diagnostic | Subprocess with fixture files, assert exit code + stream content               |
| moment generate         | Produces TypeScript + Gherkin files in output directory                         | Subprocess → assert output files exist, stdout reports file count              |
| moment validate         | Manifest validation reports errors to stderr                                    | Subprocess with invalid manifest, assert exit 1 + stderr contains rule IDs     |
| moment generate --check | Exits non-zero when output is stale                                             | Generate, modify fixture, re-run with --check, assert exit 1                   |
| Error formatting        | Unknown commands, missing args produce helpful stderr                           | Subprocess with bad args, assert stderr contains usage guidance                |
| Exit code convention    | 0 = success, 1 = user error (bad input), 2 = internal error                     | Targeted tests for each exit code path                                         |

Subprocess testing implementation:

```
import { execaNode } from 'execa';

test('moment generate produces TypeScript and Gherkin output', async () => {
  const result = await execaNode('./dist/moment.mjs', [
    'generate',
    'fixtures/valid/multi-context.moment',
    '--manifest', 'fixtures/manifests/minimal-manifest.yaml',
    '--outdir', tmpDir
  ]);

  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain('Generated 2 TypeScript scaffolds');
  expect(result.stdout).toContain('Generated 2 Gherkin features');
});

test('moment parse with invalid file exits non-zero', async () => {
  const result = await execaNode('./dist/moment.mjs', [
    'parse', 'fixtures/invalid/v01-unresolved-name.moment'
  ], { reject: false });

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain('V1');
});
```

Why subprocess tests specifically:

Tier 3 tests catch problems that in-process tests cannot: esbuild bundle missing an import, shebang line malformed, stdout/stderr going to the wrong stream, argument parser rejecting valid input, ESM resolution failures in the bundled artifact. These are the bugs that make users file GitHub issues saying "I installed it and it doesn't work."

Approximate test distribution: ~20 Tier 2 in-process tests, ~10-15 Tier 3 subprocess tests. Tier 3 runs in the test:integration Turborepo task (after build, depends on the compiled bundle existing).

Coverage target: 75%+ line coverage (Tier 2). Tier 3 subprocess tests don't contribute to code coverage metrics — they're black-box smoke tests against the compiled artifact.

### 6. CI Pipeline: GitHub Actions

Two workflows: CI (on every push/PR) and Release (on merge to main with changesets).

#### CI Workflow

```
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  ci:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [20, 22]
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm turbo generate
      - run: pnpm turbo typecheck
      - run: pnpm turbo lint
      - run: pnpm turbo build
      - run: pnpm turbo test -- --coverage
      - run: pnpm turbo test:integration
      - uses: actions/upload-artifact@v4
        with:
          name: coverage-${{ matrix.node-version }}
          path: packages/*/coverage/
```

Pipeline stages in order:

- Install — pnpm install --frozen-lockfile (deterministic, cached)

- Generate — langium generate in core (cached by Turborepo if grammar unchanged)

- Typecheck — tsc --noEmit across all packages (parallel where possible)

- Lint — ESLint + Prettier check (parallel)

- Build — tsc compilation for libraries, esbuild bundle for CLI (respects dependency ordering via ^build)

- Test — Vitest unit tests with coverage (parallel across packages)

- Integration test — Tier 3 subprocess smoke tests: spawns the compiled CLI binary via execa, captures stdout/stderr/exit codes, validates the published artifact works end-to-end. Also runs PreviewServer startup tests. Sequential, after build.

Node matrix: Tests run against Node 20 (LTS) and Node 22 (current). This validates the "runs anywhere TypeScript runs" principle. The esbuild CLI bundle targets node20 — the LTS floor.

Concurrency: PR pushes cancel in-progress runs for the same branch. No wasted compute on superseded commits.

Test dependency: execa is a devDependency of @mmmnt/cli for subprocess testing. It is not a runtime dependency of the published CLI bundle (esbuild inlines all runtime deps; test deps are excluded).

#### Release Workflow

```
name: Release

on:
  push:
    branches: [main]

permissions:
  contents: write
  pull-requests: write
  id-token: write  # required for npm provenance

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
          registry-url: https://registry.npmjs.org
      - run: pnpm install --frozen-lockfile
      - run: pnpm turbo build
      - run: pnpm turbo test
      - uses: changesets/action@v1
        with:
          publish: pnpm changeset publish
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
```

Release workflow notes:

- id-token: write permission enables npm provenance attestation — every published package includes a cryptographic link back to the GitHub Actions run that built it

- The NPM_TOKEN secret is an automation token from the listenrightmeeow npm account — the org owner

- Changesets creates a "Version Packages" PR when changesets accumulate on main. Merging that PR triggers the actual npm publish.

- Publish runs pnpm changeset publish which handles topological ordering: core publishes before derive, derive before generate

- All packages include "publishConfig": { "access": "public", "provenance": true } — scoped packages under a free npm org must explicitly declare public access

### 7. Publishing Strategy: Changesets + npm

#### npm Organization

Packages publish under the @mmmnt npm organization (free tier, public packages). The org is owned by the listenrightmeeow npm account. All packages are published as public — no npm Pro or Teams subscription required.

Package registry mapping:

| Package           | npm Name        | Access |
| ----------------- | --------------- | ------ |
| packages/core     | @mmmnt/core     | public |
| packages/derive   | @mmmnt/derive   | public |
| packages/generate | @mmmnt/generate | public |
| packages/harness  | @mmmnt/harness  | public |
| packages/viz      | @mmmnt/viz      | public |
| packages/cli      | @mmmnt/cli      | public |

Each package's package.json includes:

```
{
  "name": "@mmmnt/core",
  "publishConfig": {
    "access": "public",
    "provenance": true
  }
}
```

The "access": "public" field is required for scoped packages on the free org tier — npm defaults scoped packages to restricted.

#### npm Authentication in CI

The Release workflow authenticates to npm via an automation token stored as NPM_TOKEN in the GitHub repository secrets. The token is generated from the listenrightmeeow npm account with the "Automation" token type (bypasses 2FA enforcement for CI publishing).

Important: The npm account handle (listenrightmeeow) differs from the GitHub handle. The NPM_TOKEN secret must be generated from the npm account, not derived from GitHub credentials.

#### Changesets

Changesets for versioning and changelog generation. Each PR that changes package behavior includes a changeset file describing the change and its semver impact.

Version coordination rules:

| Change                          | Semver Impact             | Cascade                            |
| ------------------------------- | ------------------------- | ---------------------------------- |
| MomentData IR schema change     | core major                | All downstream packages major bump |
| TestSuiteTopology schema change | derive major              | generate major bump                |
| New validation rule (V18+)      | core minor                | No cascade                         |
| New derivation construct        | derive minor              | generate minor (new output)        |
| Generator output format change  | generate minor            | No cascade                         |
| Harness API addition            | harness minor             | No cascade                         |
| Bug fix in any package          | Patch in affected package | No cascade                         |

The IR stability contract is the cascade trigger. A major bump to MomentData in core means every consumer must adapt. This is the most expensive change in the system — intentionally so (Design Principle #1).

Publish order: Changesets handles topological publish ordering automatically — core publishes before derive, derive before generate.

npm provenance: All published packages include npm provenance attestation via --provenance flag in the publish step. Verifiable supply chain from GitHub Actions to npm.

### 8. Quality Gates

All gates must pass before merge to main:

| Gate                | Tool                           | Threshold                            | Rationale                                                                                 |
| ------------------- | ------------------------------ | ------------------------------------ | ----------------------------------------------------------------------------------------- |
| Type check          | tsc --noEmit                   | Zero errors                          | Type safety across package boundaries                                                     |
| Lint                | ESLint + Prettier              | Zero errors, zero warnings           | Consistent code style                                                                     |
| Unit tests          | Vitest                         | 100% pass                            | No broken tests                                                                           |
| Coverage (core)     | @vitest/coverage-v8            | 95% line                             | Parser + validator are highest-value correctness surface                                  |
| Coverage (derive)   | @vitest/coverage-v8            | 90% line                             | Derivation matrix is combinatorial                                                        |
| Coverage (generate) | @vitest/coverage-v8            | 90% line                             | Deterministic output — snapshots cover the space                                          |
| Coverage (harness)  | @vitest/coverage-v8            | 85% line                             | Library API surface                                                                       |
| Coverage (viz)      | @vitest/coverage-v8            | 80% line                             | Pure renderers + infrastructure                                                           |
| Coverage (cli)      | @vitest/coverage-v8            | 75% line                             | Tier 2 in-process tests. Tier 3 subprocess tests are black-box — no coverage contribution |
| CLI smoke tests     | execa + Vitest                 | 100% pass (10-15 tests)              | Tier 3 subprocess tests validate the compiled esbuild bundle works                        |
| Gherkin validity    | @cucumber/gherkin parser       | 100% generated features parse        | Generated output must be syntactically correct                                            |
| Snapshot freshness  | Vitest snapshots               | No stale snapshots                   | --update must be explicit, not accidental                                                 |
| Lockfile integrity  | pnpm install --frozen-lockfile | No lockfile drift                    | Reproducible builds                                                                       |
| Changeset presence  | Changesets bot                 | PR has changeset if packages changed | Every behavioral change is versioned                                                      |

### 9. Fixture Management

The fixtures/ directory is a first-class test artifact:

```
fixtures/
├── valid/                    # .moment files that must parse
│   ├── minimal.moment        # Simplest possible spec (1 lane, 1 moment)
│   ├── multi-context.moment  # 3 contexts, crossings, branches
│   ├── full-grammar.moment   # Exercises all 14 constructs
│   └── edge-cases/
│       ├── ambiguous-names.moment
│       ├── deep-branches.moment
│       └── multiplicity.moment
├── invalid/                  # .moment files that must fail
│   ├── v01-unresolved-name.moment
│   ├── v02-branch-lane-crossing.moment
│   ├── ...
│   └── v17-returns-to-depth.moment
├── manifests/                # .manifest.yaml files
│   ├── sift-manifest.yaml    # Real Sift manifest (dogfood)
│   └── minimal-manifest.yaml
├── golden/                   # Expected outputs for snapshot comparison
│   ├── ir/                   # MomentData IR snapshots
│   ├── topology/             # TestSuiteTopology snapshots
│   ├── typescript/           # Generated .spec.ts golden files
│   └── gherkin/              # Generated .feature golden files
└── regression/               # Bug-fix regression fixtures
    └── issue-NNN.moment      # One fixture per parser bug
```

Golden file update workflow: When intentionally changing output (e.g., new Gherkin tag), the developer runs pnpm turbo test -- --update to regenerate snapshots, reviews the diff, and commits the updated golden files alongside the code change. The PR reviewer sees both the code change and its output impact in the same diff.

Dogfood fixture: The Sift domain manifest (sift-manifest.yaml) is a real-world fixture used in CI. If the Sift manifest breaks the parser, CI catches it.

### 10. Local Development Experience

Watch mode: pnpm turbo test --filter=@mmmnt/core -- --watch runs Vitest in watch mode for a single package. Turborepo ensures upstream builds are current.

Grammar iteration cycle: Edit moment.langium → pnpm turbo generate --filter=@mmmnt/core (< 5 seconds, [ADR-008](ADR-008-parser-technology-langium.md) target) → pnpm turbo test --filter=@mmmnt/core → see parser behavior change.

Full pipeline check: pnpm turbo build test lint typecheck — the same gates CI runs, locally. Turborepo caching means subsequent runs skip unchanged packages.

## Consequences

What becomes easier:

- Every package has a clear testing contract — categories, coverage targets, and fixture expectations are defined upfront, not discovered during implementation

- The Turborepo pipeline enforces build ordering automatically — developers can't accidentally test against stale upstream builds

- Snapshot testing for generators makes output changes visible in PR diffs — reviewers see exactly what changed in generated TypeScript and Gherkin

- Changesets enforce versioning discipline — no package version bumps without explicit changelog entries

- The fixture corpus grows monotonically with bug fixes — regression coverage improves permanently

- The esbuild CLI bundle eliminates the entire class of ESM/CJS interop bugs that plague Node.js CLI tools — no experimental flags, no resolution chain debugging

- Tier 3 subprocess tests prove the published artifact works before it reaches npm — users don't discover broken bundles

What becomes harder:

- Snapshot management requires discipline — stale snapshots must be explicitly updated, not auto-accepted. The --update flag is intentionally manual.

- The Langium generate step adds ~5 seconds to core's build even when cached — cold builds are slower than a hand-written parser would be

- Coverage thresholds create merge friction for exploratory work — feature branches may need to stub tests before merging. This is intentional — the friction is the quality signal.

- Fixture corpus maintenance — large fixture directories need organization discipline. The naming convention (construct-specific for valid, invariant-ID for invalid) mitigates this.

What to watch:

- Turborepo cache hit rates — if builds are slow, investigate cache invalidation patterns

- Snapshot test brittleness — if generator output changes frequently during early development, snapshot tests may need temporary relaxation. Tighten after output stabilizes.

- CI run time — target under 5 minutes for the full CI pipeline. If it exceeds 10 minutes, investigate parallelization or test splitting.

- Gherkin parser compatibility — @cucumber/gherkin version must stay aligned with Cucumber.js 7+ to validate Rule: keyword support (Gherkin 6+)

- esbuild bundle size — monitor CLI bundle growth. If it exceeds 5MB, investigate tree-shaking configuration.

## Alternatives Considered

1. Jest instead of Vitest (rejected): Jest has broader ecosystem adoption but requires explicit ESM configuration, has slower startup for TypeScript projects, and its snapshot format is less readable. Vitest's native ESM support, TypeScript integration, and Turborepo compatibility make it the better fit for a modern TypeScript monorepo. The migration cost is near-zero — Vitest's API is Jest-compatible.

2. Nx instead of Turborepo (rejected): Nx provides similar build orchestration with additional features (affected-command analysis, distributed caching). Rejected because the Complai platform already uses Turborepo — stack coherence outweighs Nx's additional features. The packages are few enough (6) that Turborepo's simpler model is sufficient.

3. Lerna for publishing (rejected): Lerna was the original monorepo publishing tool. Rejected in favor of Changesets because Changesets provides better PR-based changelog workflows, explicit version intent (the changeset file), and cleaner integration with GitHub Actions. Lerna's maintenance status has also been inconsistent.

4. Per-package CI workflows (rejected): Running separate GitHub Actions workflows per package was considered for faster feedback on single-package changes. Rejected because the dependency chain means most changes affect multiple packages. A single workflow with Turborepo's caching achieves the same speed through skip-unchanged semantics without the complexity of cross-workflow coordination.

5. Cucumber.js as a test runner alongside Vitest (rejected): Running Cucumber.js as a full test runner for .feature file validation was considered. Rejected because we only need syntax validation (does the generated Gherkin parse?), not step execution. Importing @cucumber/gherkin as a library within Vitest tests is lighter, faster, and doesn't require a separate test runner configuration. Step execution is the consumer's responsibility, not Moment's.

6. tsc for CLI (rejected): Compiling the CLI with tsc like the library packages was considered. Rejected because it leaves ESM module resolution to Node.js at runtime — the source of the experimental flag, CJS interop, and workspace symlink resolution problems that make CLI testing and distribution unreliable. esbuild's single-file bundle eliminates the entire problem class by resolving everything at build time. This is the same rationale used for Sift's Lambda bundles.
