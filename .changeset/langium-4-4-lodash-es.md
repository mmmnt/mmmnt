---
"@mmmnt/core": patch
---

Upgrade Langium to 4.4.0. Langium 4.2.1 pinned chevrotain ~11.1.1, which pinned `lodash-es` to exactly 4.17.23, a version with a high-severity advisory (patched from 4.17.24); every consumer of `@mmmnt/cli` installed it and could not override it. Langium 4.4.0 uses chevrotain 13.2, which no longer depends on `lodash-es`, and chevrotain-allstar 0.5, which requires `lodash-es` ^4.18.1. Diagnostic messages that LSP 3.18 may now deliver as MarkupContent are reduced to their text, so the IR's `Diagnostic.message` stays a string.
