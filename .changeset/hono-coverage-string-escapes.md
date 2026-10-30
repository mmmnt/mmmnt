---
'@mmmnt/cli': patch
'@mmmnt/core': patch
'@mmmnt/mcp': patch
---

String escapes, coverage restored, and the `@hono/node-server` advisory (#195).

- core: strings accept backslash escapes, so `\"` can appear inside a string. Values keep quotes that begin or end their content, and the Sift importer escapes every string it writes, so its output parses.
- core: V12 no longer throws when parser recovery leaves a deprecation without its replacement.
- cli: `moment reconcile <spec> --event` with no path reports the missing flag instead of crashing.
- mcp: `@hono/node-server` resolves to 2.x, fixing GHSA-rmxm-3fg6-px4f.
