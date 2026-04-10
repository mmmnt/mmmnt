---
'@mmmnt/core': minor
---

**feat(core): ProjectLoader for multi-file IR merge + cross-file validation**

New `ProjectLoader` class in `@mmmnt/core` that loads multiple `.moment`
files and produces a single merged `IntermediateRepresentation`. This is
the Phase 1 foundation for project-level execution (MMNT-5418 / ADR-032 R2).

Three new modules in `packages/core/src/project/`:

- **`ProjectLoader`**: reads N files, parses each via `MomentParser`,
  merges IRs, runs cross-file validation, returns a `ProjectLoadResult`
  with the merged IR + aggregated diagnostics.
- **`mergeIrs`**: pure function that concatenates `contexts[]`, `flows[]`,
  `glossary[]`, `relationships[]` from N IRs with deterministic ordering
  (sorted by file path). Detects duplicate context names across files.
- **`validateCrossFileReferences`**: post-merge validator that checks lane
  contextIds, crossing targetContextIds, moment entry contextIds, and
  relationship endpoints all resolve to contexts in the merged IR. Skips
  branch-lanes and terminal-classified lanes (synthetic flow-control
  constructs, not real bounded contexts).

```typescript
import { ProjectLoader } from '@mmmnt/core';

const loader = new ProjectLoader();
const result = await loader.loadProject([
  'contexts/ordering.moment',
  'contexts/fulfillment.moment',
  'flows/order-placed.moment',
]);

if (result.success) {
  console.log(result.ir.contexts.length); // 2
  console.log(result.ir.flows.length);    // 1
}
```
