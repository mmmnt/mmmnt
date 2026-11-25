---
'@mmmnt/cli': patch
'@mmmnt/mcp': patch
---

Every command refuses a flag it does not take, and four smaller CLI and MCP fixes.

- cli: a flag the command does not declare fails the run with exit 2 and runs nothing. The error names the flag and lists the flags the command takes. Before, every command but `generate` and `simulate` ignored it, so `moment emit-ts <spec> --out-dir <dir>` wrote into the current directory; `generate` and `simulate` printed a warning and ran.
- cli: `board` prints the notices of the projection on stderr, one `note:` line each, as `derive` does. It dropped them, so a model numbered in load order said nothing.
- cli: `moment quorum <other>` prints the usage of `quorum watch` with `--source`, the same text the command prints.
- cli: `simulate --out-dir` names scenario files with the slug topology files use: `scenario-n5-seat-request-0.json`, not `scenario-flow-N5 - Seat request-0.json`. Each `scenarioId` is unchanged, and `manifest.json` gives the new `file` names, so Facet, which reads them from there, needs no change. `serve` keys its scenarios by the same names. Two scenarios whose names slug to one file fail the run instead of overwriting each other. `examples/ticketwave/facet` is regenerated.
- mcp: `moment_viz` gives the same output for the same model. Its `timestamp` and `metadata.generatedAt` are the fixed time its session already used; they were the current time, which the code comment said they were not.

Behaviour change: a command line that passed a flag the command does not take, and ran anyway, now exits 2. That includes `generate` and `simulate`, which only warned. Every flag and alias in the CLI README still works: `--out`, `--out-dir` and `-o` on `generate`, `--out` on `simulate`, `-o` on `emit-ts`, `-p` on `serve`, `-n` and `-d` on `init`, `-d` on `watch`.
