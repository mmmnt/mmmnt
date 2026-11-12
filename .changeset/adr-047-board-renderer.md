---
'@mmmnt/board': minor
'@mmmnt/cli': minor
---

Add `@mmmnt/board` and `moment board` (ADR-047). The package projects a parsed model (its IR, not the `.moment` text) onto an NDD board in the platform palette: one Canvas Composer SVG per frame (a context frame per context, a thread frame per flow, the context map and invariant coverage) and a `manifest.json` that lists every node with its kind, name, context and flow or moment, so the board can be compared with a board of record. Notes, triggered-by and same-moment hops, branch arms and outcome exits, policy conditions, cause-scoped refusals and alternative outcomes are drawn. A closure sweep over the IR fails when a property is neither carried nor listed as unrendered with a reason. `moment board <path> --out <dir>` writes nothing for a model that does not parse. No grammar, IR or existing output changes.
