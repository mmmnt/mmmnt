---
'@mmmnt/cli': minor
---

A command records one or more events: events recorded together, and alternative outcomes chosen by state (ADR-041).

Syntax (aggregate commands, and orchestration commands for the process events they declare):

- `emits A` records one event, as before. `emits A, B` records both in one transaction. `emits A | B` records exactly one of them, chosen by the aggregate's state. `emits A when Open | A, B when OneUseLeft` names the declared state in which each outcome is recorded. `,` binds tighter than `|`; `when` belongs to the outcome it follows. No keyword is added.

Rules:

- V31 and V38 check every event of every outcome (the message for a single event is unchanged). New V44: a command that records more than one distinct event records only its own aggregate's events (a single-event command is unchanged). V45: an event is listed once inside one outcome. V46: a `when` names a declared state, no two outcomes share one, and a command guards every outcome or none; alternatives with no guard are an advisory. V47: the events a flow places after one placement of a multi-event command come from one outcome (part of an outcome is an advisory). V48: an outcome that no flow places, over a merged project only (an advisory). V44 to V48 are advisories per file and errors over a merged project, except where a finding carries its own severity (V46 errors; the V46 missing-guard advisory, the V47 partial outcome and V48 are always warnings).
- A project now keeps the findings of a file it could not merge. Before, an error in a file whose own findings include one that the merged validation re-reports could be dropped with the file.

IR:

- core: a plain `emits A` writes `emitsEvent` and nothing else, so the IR of every model that parses today is byte-identical. Any other clause adds `outcomes: { events: string[]; whenState?: string }[]` to `CommandDefinition` and `OrchestrationCommandDefinition`, and `emitsEvent` is the first event of the first outcome. New helpers `emittedEvents(cmd)` and `emitOutcomes(cmd)` read a command's events and outcomes (hand-built IR that sets only `emitsEvent` reads as a single outcome); no package reads the fields directly (a test sweeps the sources). `momentPlacements` exposes the events a flow places for a command.

Artifacts:

- derive: the scenario for a multi-event command shows the command step, then the events the flow places for one outcome, contiguous and in declared order, each caused by the command step alone and carrying its timestamp. A scenario that reaches a guarded outcome names the state in its `when` and in the command step's payload (`whenState`). A rejection records no event of any outcome. The event catalog has an entry per event whose producer is the command, with `recordedWith` and `alternativeTo` (absent for a single-event command). Impact analysis links the command to every event of every outcome, in both directions. Topology is unchanged.
- emit-ts: a handler returns the event for `emits A`, `readonly [A, B]` for events recorded together, `A | B` for alternatives, `readonly [A, B] | C` for both; the JSDoc has one `@emits` per event and `@outcome <State>: <events>` per guarded outcome.
- generate: Gherkin writes the events recorded after the first as `And ... emits`; the specification document writes `produces A, B`, `produces A or B`, and `produces A when S, or A, B when T` in the narrative, the command table and the sequence diagram.
- viz, mcp, cli: no change (pinned by tests).

Compatibility: every model that parses today parses with an identical IR and identical derived artifacts. This was checked on every valid fixture, the rule ids of every invalid fixture, ticketwave at its previous spec and the SAMMI model, against the build of 0.7.2, and the comparison fails on a build that writes `outcomes` for a plain `emits`. The ticketwave example now uses the new forms (`HoldClosed` recorded with `HoldConvertedToReservation`; `AccessCodeExhausted` on the last use of an access code) and its facet files are regenerated, so its scenarios and tests change.
