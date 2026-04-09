---
'@mmmnt/cli': minor
'@mmmnt/derive': minor
---

**feat(cli/derive): `moment simulate` redesign — `--all`, per-scenario files, ADR-029 artifacts**

Substantial reshape of the simulate command and its derivation pipeline:

- **`--all` flag** generates every branch combination plus negative
  (precondition-violation) scenarios in a single run.
- **Per-scenario file output** under `--out-dir`: each scenario lands in its
  own `<scenarioId>.json` instead of being lumped into one file. A
  `manifest.json` indexes the run.
- **`TopologyEmitter`** writes per-flow `topology-<flow>.json` files alongside
  the scenarios.
- **ADR-029 artifacts**: `event-catalog.json`, `impact-analysis.json`,
  `saga-state-machines.json`, and `asyncapi.yaml` are emitted into the same
  `--out-dir` so downstream consumers (Facet, Xray, AsyncAPI tooling) get a
  complete bundle from one command.
- **Trailing newline** on all generated JSON for prettier/git-friendly diffs.
