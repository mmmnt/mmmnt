---
'@mmmnt/cli': minor
---

Branch paths: negatives for every path, an arm that ends at an outcome, and the arm a topology connection is declared in (ADR-042, ADR-043, ADR-044).

ADR-042, negative scenarios for every branch path:

- derive: `deriveNegativeScenarios` derives over every path `generateAllScenarios` enumerates, with one negative per (command, precondition, cause) not already covered. The first-arm path is derived first, exactly as before, so its scenarios, ids and order are byte-identical. A command placed only in a later arm (a decline, a cancel, a fail, an expire) now has its negatives. An explicit `branchSelections` still walks that one path. Scenario shape, `kind` values and manifest fields are unchanged; there are more `kind: negative` entries.
- Ticketwave: 36 negatives become 39 (`FailPayment.paymentPending`, `DeclineTransfer.transferPending`, `CancelTransfer.transferPending`). SAMMI: every existing scenario byte-identical, and one is added (`RecordSessionLoss.WasConnected`, placed only in an arm of T7).

ADR-043, an arm may end at an outcome:

- core: a second exit modifier, `[outcome]`. It sets `terminal: true` and `exit: 'outcome'` on the IR entry, so everything that stops at a terminal behaves the same. `[terminal]` is unchanged and stays a failure exit. `outcome` is a keyword inside the modifier brackets and is escaped in `FieldName` and `LaneName` (and so in input names), so a field, lane or input named `outcome` still parses. V8 (a terminal is the last node of its block) holds for `[outcome]` too.
- derive: an arm that ends at `[outcome]` is a `variant` (`Variant: ...`); an arm that ends at `[terminal]` is a `failure`. Label and kind share one rule. `ScenarioKind` has the same five values.
- generate: Gherkin writes `(outcome)` for `(terminal)`, tags the arm `@terminal @alt-path` (not `@failure-path`), ends it with `the flow ends at <node>`, and attributes no failed precondition to it. The specification document writes `flow ends at` with a check mark, and the sequence diagram closes the arm with `Flow ends at an outcome`.
- Syntax files (core and vscode) know the new word. A model that does not use `[outcome]` has a byte-identical IR and derived output.

ADR-044, a topology connection declared inside a `when` arm carries that arm:

- derive: `TopologyConnection` gains an optional `branchCondition`, the arm's condition as written in the spec (the key `branchPredicates[<frame>].routes` and `activeBranches[].condition` use), copied from the IR for `triggered-by`, `triggers`, `crosses-to` and `returns-to`. A connection declared outside an arm has no such field. Additive: with the keys removed, the topology of every model is byte-identical to 0.8.0's. Ticketwave 10 of 50 connections carry it; SAMMI 16 of 19.

Ticketwave: new flows `seat-request` and `payment-settlement` show the three changes (a refusal in a later arm, `[outcome]` exits, and two arms that declare the same conversion differently). Its facet files are regenerated: 6 flows, 67 scenarios.

Compatibility: golden comparison against the build of 0.8.0 on every valid fixture, ticketwave at its previous spec and the SAMMI model. Every old scenario is present and byte-identical; the new build adds only the negatives above; topology differs only by the `branchCondition` keys; every other artifact is byte-identical. The three regression specs were verified by reintroducing each defect.
