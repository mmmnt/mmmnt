---
'@mmmnt/core': minor
---

**feat(core): GeneratorRegistry with DAG planner and descriptor interfaces**

New open generator registry in `@mmmnt/core` replacing the hardcoded
`ALLOWED_FORMATS` set (MMNT-5430 / ADR-032 R1 / ADR-034 G2+G3).

- `GeneratorDescriptor` interface: `format`, `scope`, `dependsOn`,
  `defaultOutputDir`, `run(ctx) → Promise<GeneratorRunResult>`
- `GeneratorRunContext`: provides `ir`, `manifestDir`, `outputDir`,
  `options`, and `upstreamOutputs` (results from declared dependencies)
- `GeneratorRunResult`: returns `files: Map<string, string>` (in-memory)
  + `diagnostics` — framework handles disk writes with path safety
- `GeneratorRegistry` class: `register()`, `resolve()`, `has()`,
  `getAll()`, `getFormats()`, `planExecutionOrder()`
- Topological sort via Kahn's algorithm with cycle detection
- Deterministic ordering: independent generators sort alphabetically

Each generator package will export a `registerGenerators(registry)`
function (next story). The CLI's project-mode bootstrap calls them all.
No circular dependencies — `@mmmnt/core` exports only the interface +
registry class.
