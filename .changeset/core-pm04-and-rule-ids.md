---
'@mmmnt/cli': patch
'@mmmnt/core': patch
---

Project mode agrees with a single file on crossings, and every validation diagnostic names its rule.

- core: PM-04 accepts a crossing whose event is declared by its source context or by its target context, as SP-02 does. A crossing carries the source context's event, so the target-only rule warned on every crossing of TicketWave. An event declared by neither context still warns.
- core: a syntax-level diagnostic (V1 to V20, V52 to V55, and the parser's SP-01 to SP-03) carries its rule id in `ruleId`, as a model-level one does. Its message still begins with the id (`V55: ...`), so code that reads the message is unaffected.
- cli: `moment parse examples/ticketwave/spec/` prints no PM-04 warning.
