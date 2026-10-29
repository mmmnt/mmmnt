---
"@mmmnt/core": patch
---

Fixes found while documenting 0.6.

- **`moment <command> --help` no longer runs the command.** Commands that ignored unknown flags ran instead: `moment init --help` initialised a project in the current directory. Any command given `--help` or `-h` now prints its own usage and exits 0.
- **`moment parse` prints warnings on success.** Rules V22–V37 report warnings for a single file; they were computed but never shown. Diagnostics now name their rule (`V22: …`), and rules without a position are attributed to the file parsed.
- **Reconcile and Sift import no longer misread sync logs.** The Sift event reader skips the `sync-state`, `implementation-feedback` and `push-flow-saga` logs that `moment sync` writes into `.domain/`, which it had reported line by line as malformed Sift events.
- **Reads are not described as emissions.** Generated specification documents and Gherkin say a query step "answers query" and a projection step "serves projection" instead of "emits" (ADR-037).
