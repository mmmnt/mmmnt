# ADR-005: Gherkin Generation Layer — .feature File Generation from Moment Specifications

Migrated from Confluence page 11304972 (version 2, last updated 2026-03-09), https://winnovation.atlassian.net/wiki/spaces/MMMNT/pages/11304972. The Confluence space is private; this file is now the record.

Migrated from Sift: This ADR originated as Sift ADR-040. Migrated to the Moment space March 2026 when the Moment Specification Language was established as an independent project.

- **Status:** Proposed
- **Release:** R6
- **Date:** 2026-03-07
- **Deciders:** listenrightmeow, Claude (DDD Coaching Project)
- **Sift Origin:** ADR-040
- **Tags:** client-app:spec-view

## Context

[ADR-004](ADR-004-moment-to-seam-bridge-cross-product-moment-spec-publishing.md) established the Moment-to-Seam bridge: validated moment specifications flow from Sift to Seam via the complai.moment-specs Kafka topic, land in .domain/moments/\*.jsonl, and MomentTestEmitter generates .moment.spec.ts integration test scaffolds. [ADR-001-A](ADR-001-A-bdd-derivation-manifest.md) defines the complete BDD Derivation Manifest — the rules that map every Moment DSL construct to its test output shape (18 constructs, 11 manifest entry kinds, 4 relationship types, 6 composition rules, 17 validation rules).

The TypeScript scaffolds (.moment.spec.ts) target developers who run tests in Vitest. But the domain specification audience is broader than developers. Product owners, business analysts, and domain experts participate in specification refinement (Sift's conversational interface, Sift ADR-020/021/022) and need to validate that the system's behavioral contracts match their intent. TypeScript test files are opaque to non-technical stakeholders.

Gherkin is the established specification language for business-readable behavioral assertions. Its Given/When/Then vocabulary maps directly to the Moment DSL's moment assertions and crossing contracts. The Gherkin ecosystem (Cucumber.js, SpecFlow, Behave) provides execution infrastructure across languages and frameworks. Gherkin 6+ introduced the Rule keyword, which maps naturally to phases — grouping related scenarios under a business rule that corresponds to a phase's behavioral contract.

The open-source strategy (page 11272195) positions @mmmnt/derive as the generation engine that produces both TypeScript and Gherkin output from the same MomentData intermediate representation. The Gherkin generator is the second output format — it consumes the same IR, applies the same derivation manifest rules ([ADR-001-A](ADR-001-A-bdd-derivation-manifest.md)), and produces .feature files with step definition scaffolds instead of describe/it blocks.

The gap: @mmmnt/derive has a TypeScript generator (consumed by Seam's MomentTestEmitter) but no Gherkin generator. The derivation manifest maps constructs to assertion shapes, but those shapes are currently expressed only as TypeScript test patterns. No mapping exists from manifest entry kinds to Gherkin step patterns, from relationship types to Gherkin contract scenarios, or from DSL composition rules to Gherkin document structure.

## Decision

### 1. Dual-Format Generation: Always Both

domain generate produces both .moment.spec.ts and .feature files for every moment specification. This is not configurable — both formats are always generated. The TypeScript scaffolds serve the developer (implementation-level integration tests in Vitest). The Gherkin features serve the specification audience (business-readable behavioral contracts in Cucumber.js).

Generation order within domain generate:

| Order | Emitter           | Output                                   | Depends On                                  |
| ----- | ----------------- | ---------------------------------------- | ------------------------------------------- |
| 1     | TypeScriptEmitter | .types.ts, .aggregate.ts, .spec.ts, etc. | Modeling events, SpecDefined                |
| 2     | MomentTestEmitter | .moment.spec.ts                          | MomentSpecDefined, TypeScriptEmitter output |
| 3     | GherkinEmitter    | .feature, .steps.ts                      | MomentSpecDefined, TypeScriptEmitter output |
| 4     | MermaidEmitter    | Architecture palette diagrams            | Modeling events                             |

### 2. Gherkin Document Structure: Feature → Rule → Scenario

Each moment spec produces one .feature file. The Gherkin 6+ Rule keyword maps to phases. Scenarios map to moments. Scenario Outlines map to (×N) multiplicity entries.

Structural mapping:

| Moment DSL Construct          | Gherkin Construct                              | Rationale                                        |
| ----------------------------- | ---------------------------------------------- | ------------------------------------------------ |
| moment "\<n>" (top-level)     | Feature: \<n>                                  | Top-level container                              |
| Phase (group of moments)      | Rule: \<phase-name>                            | Business rule grouping                           |
| moment "\<text>"              | Scenario: \<text>                              | Individual behavioral assertion                  |
| moment "\<text>" [branch]     | Scenario Outline: \<text> with Examples: table | Branch paths become example rows                 |
| \<lane>: \<entry>             | Given/When/Then step                           | Entry kind determines keyword (§3)               |
| crosses-to \<lane> via \<rel> | Dedicated contract Scenario                    | Contract obligations become verifiable scenarios |

### 3. Manifest Entry Kind → Gherkin Step Mapping

| Entry Kind    | Gherkin Step Keyword | Step Pattern                                                | Rationale                                |
| ------------- | -------------------- | ----------------------------------------------------------- | ---------------------------------------- |
| action        | Given                | Given {actor} {action-description}                          | User actions are preconditions           |
| command       | When                 | When {command-name} is issued to {aggregate} in {context}   | Commands are the action under test       |
| event         | Then                 | Then {event-name} is emitted in the {context} context       | Events are observable outcomes           |
| sagaEvent     | Then                 | Then {saga-name} emits {event-name}                         | Saga-authored events are outcomes        |
| coachingEvent | Then                 | Then {event-name} is emitted within the coaching session    | Session-scoped outcomes                  |
| policy        | When                 | When {policy-name} activates in response to {trigger-event} | Policies are reactive                    |
| saga          | Then                 | Then {saga-name} transitions to {state}                     | Saga state is observable                 |
| projection    | Then                 | Then {projection-name} reflects {expected-state}            | Projection state is observable           |
| process       | When                 | When the {process-name} processes {input}                   | Engines are actions                      |
| branch        | Given                | Given the {branch-condition} condition holds                | Branch conditions are preconditions      |
| terminal      | Then                 | Then {event-name} is emitted as the terminal state          | Terminal adds a "no further events" step |

Compound modifier mappings: (×N) → Scenario Outline with Examples, [optional] → conditional step prefix, [terminal] → additional "no further events" step, triggered-by → precondition step with causal comment, triggers → outcome step with causal comment, returns-to → cycle-back step, crosses-to → dedicated contract Scenario (§4).

### 4. Relationship Type → Gherkin Contract Scenario Mapping

Each crosses-to declaration produces Gherkin output shaped by the relationship type ([ADR-001-A](ADR-001-A-bdd-derivation-manifest.md) §4). Partnership generates bidirectional contract scenarios in both contexts. Customer-Supplier generates supplier-side obligations only (customer gets documentation-only scenario). Conformist generates minimal schema conformance. OHS/Published Language generates schema validation with per-consumer compatibility blocks.

### 5. Step Definition Scaffolds: Context-Scoped Ducks Pattern

Step definition files follow the ducks pattern — one .steps.ts file per bounded context.

File layout:

```
src/__moments__/
├── features/
│   ├── first-time-document-ingestion.feature
│   ├── refinement-session.feature
│   └── ...
├── steps/
│   ├── ingestion.steps.ts
│   ├── interpretation.steps.ts
│   ├── model-registry.steps.ts
│   └── contracts/
│       ├── ingestion-interpretation.partnership.steps.ts
│       └── ...
├── support/
│   ├── world.ts
│   └── hooks.ts
└── *.moment.spec.ts
```

Step definitions use Cucumber Expression syntax for parameter capture. Contract step definitions live in steps/contracts/ named by relationship: {source}-{target}.{relationship-type}.steps.ts. Support files (world.ts, hooks.ts) generated only on first run (contain EDIT OK header).

### 6. GherkinEmitter: Fourth Emitter in Projection Engine

Emitter registry (updated from [ADR-004](ADR-004-moment-to-seam-bridge-cross-product-moment-spec-publishing.md) §6):

| Emitter           | Language Target      | Event Source                 | Output                                   |
| ----------------- | -------------------- | ---------------------------- | ---------------------------------------- |
| TypeScriptEmitter | TypeScript           | Modeling events, SpecDefined | .types.ts, .aggregate.ts, .spec.ts, etc. |
| MomentTestEmitter | TypeScript           | MomentSpecDefined            | .moment.spec.ts                          |
| GherkinEmitter    | Gherkin + TypeScript | MomentSpecDefined            | .feature, .steps.ts, world.ts, hooks.ts  |
| MermaidEmitter    | Mermaid              | Modeling events              | Architecture palette diagrams            |

Both MomentTestEmitter and GherkinEmitter consume the same MomentData IR parsed from MomentSpecDefined events. The IR is parsed once per domain generate invocation and shared between emitters.

### 7. Revocation Handling

When MomentSpecRevoked events arrive ([ADR-004](ADR-004-moment-to-seam-bridge-cross-product-moment-spec-publishing.md) §9), GherkinEmitter mirrors MomentTestEmitter's behavior: revoked features are regenerated with all scenarios tagged @skip and a comment explaining the revocation reason. Re-publication removes @skip tags.

### 8. @mmmnt/derive Gherkin Generator (Open-Source)

The Gherkin generator is implemented in @mmmnt/derive as a sibling to the existing TypeScript generator:

```
@mmmnt/derive/
├── src/
│   ├── engine/           # Shared derivation engine
│   ├── generators/
│   │   ├── typescript/   # describe/it block generation
│   │   └── gherkin/      # Feature/Rule/Scenario generation
│   │       ├── gherkin-renderer.ts
│   │       ├── step-pattern-mapper.ts
│   │       ├── contract-scenario.ts
│   │       ├── tag-generator.ts
│   │       └── steps-scaffold.ts
│   └── index.ts
```

Public API: generateTypeScript(), generateGherkin(), generateAll() — all consume MomentData IR + ManifestEntry[]. The gherkin/ directory is the template for community-contributed generators.

### 9. Cucumber.js Configuration

GherkinEmitter generates a cucumber.js configuration file on first run with three profiles: default (all non-skipped scenarios), contracts (only @contract tagged), and context (filtered by context tag). Minimum Cucumber.js version: 7.0.0 (required for Rule keyword support).

### 10. Tag Taxonomy

| Tag Pattern                | Purpose                              | Example                                    |
| -------------------------- | ------------------------------------ | ------------------------------------------ |
| @moment-spec:\<n>          | Feature-level moment spec identifier | @moment-spec:first-time-document-ingestion |
| @cross-context             | Feature-level cross-context marker   | @cross-context                             |
| @context:\<n>              | Scenario-level context ownership     | @context:ingestion                         |
| @moment                    | Scenario-level moment marker         | @moment                                    |
| @contract:\<type>          | Scenario-level contract verification | @contract:partnership                      |
| @crossing:\<src>-to-\<tgt> | Scenario-level crossing identifier   | @crossing:ingestion-to-interpretation      |
| @consumer                  | Documentation-only consumer scenario | @consumer                                  |
| @terminal                  | Terminal state scenario              | @terminal                                  |
| @optional                  | Absence-is-not-failure scenario      | @optional                                  |
| @branch:\<condition>       | Branch path identifier               | @branch:success                            |
| @skip                      | Revoked scenario                     | @skip                                      |
| @revoked:\<reason>         | Revocation explanation               | @revoked:moment_stale                      |

### 11. Branch Handling: Scenario Outline with Examples

Branching moments ([branch]) produce Scenario Outline: blocks with Examples: tables when all branches have identical step structure. When branches have different step sequences, the generator produces separate tagged scenarios (@branch:success, @branch:failure).

### 12. World Class Integration with MomentTestHarness

Generated support/world.ts bridges Cucumber's World class with @complai/mmmnt-test-harness. Generated support/hooks.ts provides Before/After hooks for harness setup and teardown. Both marked EDIT OK.

### 13. No New Lambda Functions (Sift Side)

Consistent with [ADR-004](ADR-004-moment-to-seam-bridge-cross-product-moment-spec-publishing.md) §10. Gherkin generation is entirely Seam-side (Projection Engine). No Sift changes.

### 14. Seam Domain Model Impact

Projection Engine context: GherkinEmitter as 4th emitter. RegenerateOnEventAppended policy already watches .domain/moments/ per [ADR-004](ADR-004-moment-to-seam-bridge-cross-product-moment-spec-publishing.md). domain generate now runs 4 emitters. domain generate --moments runs MomentTestEmitter + GherkinEmitter.

New peer dependency: @cucumber/cucumber (≥7.0.0) for step definition type imports.

New generated output directories: src/**moments**/features/, src/**moments**/steps/, src/**moments**/steps/contracts/, src/**moments**/support/.

## Consequences

What becomes easier:

- Non-technical stakeholders can read and validate behavioral contracts in Gherkin's business-readable vocabulary

- Teams using Cucumber get structurally-aware scenarios with DDD metadata preserved as tags

- Ducks pattern step definitions provide same discoverability as TypeScript context folders

- Contract scenarios are first-class Gherkin artifacts (npx cucumber-js --tags @contract)

- Open-source community adoption — @mmmnt/derive ships with both generators

What becomes harder:

- Four emitters increase domain generate execution time (mitigated by --moments incremental path)

- Two test formats always generated (negligible cost but larger output directory)

- Cucumber.js 7+ required for Rule keyword support

- Developers must implement step definitions in two places if running both Vitest and Cucumber

What this enables:

- Future generators (Go, Rust, Java, Python) follow the same pattern: consume MomentData IR, apply derivation manifest, render to target format

- Gherkin features as the "living documentation" layer — Cucumber's HTML report format produces navigable, business-readable test reports

## Compliance Impact

SOC 2 CC8.1: Generated .feature files carry provenance comments linking to the MomentSpecDefined event. Both generators reject invalid moment specs identically via the 17 validation rules ([ADR-001-A](ADR-001-A-bdd-derivation-manifest.md) §6).

SOC 2 CC7.2: The Gherkin generator applies the same derivation manifest validation rules as the TypeScript generator. Contract scenarios provide an additional business-readable verification surface.

## Alternatives Considered

1. Gherkin as the only format (rejected): Loses type safety from TypeScript scaffolds. Both serve different audiences.

2. Developer-chooses format via CLI flag (rejected): Both formats derived from same IR at negligible cost. Not worth configuration surface area.

3. Flat Gherkin without Rule keyword (rejected): Loses structural phase grouping. Rule maps directly to phases. Cucumber.js 7+ stable since 2021.

4. One steps file per feature (rejected): Duplicates step definitions across moment specs traversing same contexts. Ducks pattern (per context) eliminates duplication.

5. Shared monolithic step library (rejected): Unmanageable at scale. Ducks pattern provides natural modularity.

6. Gherkin generation in Sift (rejected): Violates product independence. Sift produces specification data, Seam generates implementation artifacts.

7. No step definition generation (rejected): Forces developer to write all step definitions from scratch. Scaffolds accelerate implementation.
