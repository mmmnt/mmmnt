---
'@mmmnt/cli': patch
'@mmmnt/generate': patch
---

Every generated `.feature` file is valid Gherkin to the Cucumber parser.

- generate: an event's payload is a data table under its `Then ... emits <Event>` step, a row of field names and then a row of types, the same shape as a crossing's contract table. A list field's type ends in `[]`. It used to be a `carrying <field>, <field>` line, which is not Gherkin, so Cucumber refused 21 of the 23 features of TicketWave and the valid fixtures.
- generate: a `|` or `\` in a table cell is escaped.
- generate: in the Cucumber JSON, a step's `line` is the line the step is on. It used to be the scenario's line plus the step's position, so it drifted past every table or `carrying` line above it.

The feature file text changes: anyone diffing generated features sees every `carrying` line become a two-row table. The steps, scenarios and `scenarioCount` are unchanged. In `moment cucumber-json` output only the `line` numbers change.
