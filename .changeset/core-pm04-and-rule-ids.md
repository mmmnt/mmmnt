---
'@mmmnt/cli': patch
'@mmmnt/core': patch
---

Project mode agrees with a single file on crossings.

- core: PM-04 accepts a crossing whose event is declared by its source context or by its target context, as SP-02 does. A crossing carries the source context's event, so the target-only rule warned on every crossing of TicketWave. An event declared by neither context still warns.
- cli: `moment parse examples/ticketwave/spec/` prints no PM-04 warning.
