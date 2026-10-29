---
"@mmmnt/core": minor
---

Remaining fixes from the 0.6 documentation pass.

- **`moment sync status` exits 1 when the implementation has drifted**, like `moment status`, so CI can gate on it. The report still prints on stdout (`--json` too) for callers that only want to read it.
- **Two new reference rules.** V38: every aggregate command `emits` an event declared in the model. V39: every `triggers` target is placed in the same flow (`triggered-by` was already checked by V5). Like V22–V37 they are warnings for a single file and errors over a project, so `moment parse <dir>` can now fail on a model that names an undeclared event or a missing trigger target.
- **The file watcher watches every configured directory.** It skipped any directory whose absolute path contained no dot, so `moment watch` with `paths: ['model']` never fired.
- **Diagnostics without a position name their file alone** instead of `file:0:0` or `<unknown>`.
- **`@mmmnt/mcp` loads model directories.** Every tool that takes a `filePath` accepts a directory and loads it as one project, as the CLI does, reading `.domain/` from that directory; diagnostics carry their rule id and source. `loadSpecification` moved into `@mmmnt/core` so the CLI and the MCP server share it.
- **`@mmmnt/mcp` reports its real version** instead of `0.0.0`, drops two unused dependencies (`@mmmnt/schema`, `@mmmnt/generate`), and moves to `@modelcontextprotocol/sdk` 1.32.2 and `zod` 4.6.7, clearing its high and critical advisories.
- The CLI and MCP bundles target Node 22.
