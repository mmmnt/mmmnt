---
'@mmmnt/cli': minor
---

The VS Code extension (mmmnt.moment-language) is released with the toolchain, at its version, with the grammar `@mmmnt/core` ships.

- vscode: each release publishes the extension to the VS Code Marketplace and Open VSX at the version of `@mmmnt/cli`. Its last release was 0.1.1; the next is this one.
- vscode: packaging copies the grammar from `@mmmnt/core` every time, so the extension highlights every keyword the release parses. Since 0.1.1 it gains the declarations `orchestration`, `projection`, `query`, `rule`, `term`, `state`, `gateway` and `external` / `External`, and the clauses and words `enforced-by`, `invoked-by`, `initial`, `outcome`, `pattern`, `sources`, `causes`, `cause`, `issues`, `after`, `field`, `reads`, `note` and `none`, and the attribute `[encrypted]`.
- vscode: the extension's CHANGELOG is the toolchain's, followed by its own 0.1.x history.
