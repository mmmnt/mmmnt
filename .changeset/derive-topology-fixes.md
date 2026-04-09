---
'@mmmnt/derive': patch
---

**fix(derive): topology routing and saga state machine output**

- Align scenario node IDs with the topology's node ID scheme so cross-references
  resolve correctly when consumers join scenarios to topology nodes.
- Fix topology routing so connections traverse the correct edges, and correct
  the saga state machine emitter output shape.
