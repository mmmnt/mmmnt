## Moment E2E Test Results

**21/21 tests passed** (63/63 assertions)

| Test | Status | Assertions |
|------|--------|------------|
| parse: vet-clinic (4 contexts, 1 flow) | ✅ | 3/3 |
| parse: unified ordering (2 contexts, 1 flow) | ✅ | 3/3 |
| parse: invalid file rejects with diagnostics | ✅ | 2/2 |
| parse: missing file errors | ✅ | 1/1 |
| derive: vet-clinic produces 1 suite, 17 cases | ✅ | 3/3 |
| derive: --json outputs valid topology JSON | ✅ | 5/5 |
| generate: vet-clinic produces features + specs + docs | ✅ | 4/4 |
| emit-ts: vet-clinic produces 14 TS + 6 scaffolds | ✅ | 3/3 |
| emit-ts: --dry-run lists files without writing | ✅ | 3/3 |
| simulate: vet-clinic produces 28 events, 3 branches | ✅ | 3/3 |
| simulate: --json outputs valid Facet scenario | ✅ | 5/5 |
| simulate: --json events have causation and payloads | ✅ | 5/5 |
| viz: vet-clinic produces VizDataEnvelope | ✅ | 5/5 |
| sync status: vet-clinic detects drift | ✅ | 2/2 |
| sync status: --json outputs DriftReport | ✅ | 4/4 |
| test: vet-clinic runs harness | ✅ | 2/2 |
| init: creates project structure | ✅ | 3/3 |
| init: manifest contains project name | ✅ | 2/2 |
| init: rejects duplicate | ✅ | 1/1 |
| auth status: reports not authenticated | ✅ | 2/2 |
| auth logout: reports result | ✅ | 2/2 |

<details>
<summary>Generated Artifacts</summary>

**JSON Outputs**
| File | Description |
|------|-------------|
| `simulate-scenario.json` | Facet-compatible simulation (28 events, causation chains) |
| `derive-topology.json` | Test suite topology (17 cases, assertion points) |
| `viz-envelope.json` | Visualization data envelope (context map + timeline) |
| `sync-status.json` | Drift report (spec vs implementation) |

**TypeScript** (`typescript/`)
| File | Description |
|------|-------------|
| `src/{context}/{aggregate}.types.ts` | Command, event, value object interfaces |
| `src/{context}/{aggregate}.aggregate.ts` | Aggregate root interface |
| `src/{context}/index.ts` | Barrel exports |
| `__tests__/flows/{flow}.spec.ts` | Flow test scaffold |
| `__tests__/{context}/{aggregate}.spec.ts` | Aggregate test scaffold |

**Gherkin** (`gherkin/`)
| File | Description |
|------|-------------|
| `{flow}.feature` | BDD scenarios from temporal flows |

**Documentation** (`docs/`)
| File | Description |
|------|-------------|
| `specification.md` | Context overview with counts |
| `{context}/inventory.md` | Detailed aggregate inventory |

</details>