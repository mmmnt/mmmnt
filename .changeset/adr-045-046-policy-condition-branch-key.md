---
'@mmmnt/cli': minor
---

A policy declares the condition under which it reacts, and the branch stamp moves to its own key (ADR-045, ADR-046).

ADR-045, a policy declares the condition under which it reacts:

- core: `trigger E when <field> = <value>` and `trigger E after <Event>` on a policy, in that order, either or both. `=` is a new token and `after` a new keyword, escaped in `FieldName` and `LaneName` so a field, lane or input named `after` still parses. The IR's `PolicyDefinition` gains an optional `condition` (`field` and `equals`, and/or `after`); a policy that declares none has no such key. New rules: V49 (a `when` field the trigger does not carry), V50 (an `after` event that is not declared), V51 (an advisory: no flow places the `after` event before the trigger). A guard on a field named `outcome` is allowed.
- derive: `policy-definitions.json` entries carry `condition` when declared and nothing otherwise. The scenario generator sets the declared value on the occurrence of the trigger that a declared reaction names (the nearest earlier placement the `triggered-by` link uses) and keeps every other occurrence off that value. `after` needs no generation.
- Ticketwave: `PromoteWaitlistOnRelease when reason = expired`, `ConvertHoldOnPayment after SeatsHeld`, and a flow `hold-release` that places `HoldReleased` twice.

ADR-046, the branch condition stamp has its own key:

- derive: the arm a scenario took is written to `payload.$branch` (exported as `BRANCH_KEY`), a key the grammar cannot produce as a field name, and the topology's `branchPredicates[*].field` is `$branch`. `payload.outcome` is still written for an event that declares no `outcome` field, and is no longer written over one that does: a model's own `outcome` keeps its value. Facet reads the arm through the predicate's field, so older artifacts (field `outcome`) read as before.
- Ticketwave: a flow `waitlist-offer` whose events and command declare their own `outcome`.

Ticketwave facet files are regenerated: 8 flows, 72 scenarios.

Compatibility: golden comparison against the 0.9.0 build on every valid fixture, ticketwave at its 0.9.0 spec and the SAMMI model (simulate, generate, emit-ts, derive, viz, parse). The only differences are an added `"$branch"` line on every event inside an arm and `"field": "outcome"` becoming `"field": "$branch"` in branch predicates; every other output is byte-identical. The specs were verified by reintroducing each defect.
