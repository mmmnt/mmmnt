---
'@mmmnt/cli': patch
---

Project mode no longer reports a per-file V49, V50 or V51 that the merged project does not report (ADR-045).

- core: `ProjectLoader` drops a per-file diagnostic only for the rules the merged validation re-checks, and matched V22 to V48. A policy `trigger X after Y` in one context file, with `Y` declared in another file, got a spurious V50 in `moment parse <dir>`. Every rule from V22 on is now treated as checked over the merge, so a rule added later needs no change here.
