---
"@mmmnt/core": minor
---

Upgrade Langium to 4.4.0 and require Node 22.

Langium 4.2.1 pinned chevrotain ~11.1.1, which pinned `lodash-es` to exactly 4.17.23, a version with a high-severity advisory (patched from 4.17.24); every consumer of `@mmmnt/cli` installed it and could not override it. Langium 4.4.0 uses chevrotain 13.2, which no longer depends on `lodash-es`, and chevrotain-allstar 0.5, which requires `lodash-es` ^4.18.1.

**Breaking: Node 20 is no longer supported.** Every Langium release free of the vulnerable pin depends on chevrotain 12 or 13, which require Node 22. Node 20 reached end-of-life on April 30, 2026. All packages now declare `node >=22`, and CI tests on Node 22 and 24.

Diagnostic messages that LSP 3.18 may now deliver as MarkupContent are reduced to their text, so the IR's `Diagnostic.message` stays a string.
