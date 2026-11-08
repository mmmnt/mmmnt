# ADR-043: A branch arm may end the flow at an outcome, and an outcome exit is not a failure

- **Status:** Accepted (2026-11-07, founder)
- **Date:** 2026-11-07
- **Supersedes:** nothing. Amends the scenario classification described in the header of `simulation-scenario-generator.ts` and ADR-031's `kind` definition (`failure`, `variant`).
- **Founder approval (2026-11-07, relayed):** fixing four limits found in the derivation. Standing rule: Moment evolves on its own merits; proven on TicketWave and SAMMI.
- **Release:** 0.9.0 (minor), with ADR-042 and ADR-044.
- **Numbering:** next free after ADR-042.
- **Source read:** `origin/main` bcbc0b3: `packages/core/src/grammar/moment.langium`, `packages/core/src/parser/ast-to-ir.ts`, `packages/core/src/ir/frame-definition.ts`, `packages/derive/src/engine/simulation-scenario-generator.ts`, `packages/generate/`, `examples/ticketwave/spec/ticketwave.moment`; Facet f7a4987 `scenarioBadges.ts`, `websocketSaga.ts`.

## Context

A flow can end an alternative at its own exit: the arm carries a placement marked `[terminal]`, the walk stops there, and the scenario ends at that node. The scenario is then classified by the walk, not by label text:

- `simulation-scenario-generator.ts:298-302` (`resolveScenarioKind`): any deviation whose arm "has a terminal" is `failure`; a deviation without one is `variant`; none is `happy`. `resolveScenarioLabel` (`:281-291`) mirrors it (`Failure Path: …` / `Variant: …`) so label and kind cannot disagree.
- `:491` (`recordBranchPoint`): `armHasTerminal: branch.entries.some((e) => e.terminal)`.
- `simulate.ts:183-184` derives `isHappyPath` and `isNegative` from `kind`; `failure` has no flag of its own.

How a terminal is typed: the grammar has one modifier, `NodeModifier: '[' type=ModifierType ']'` with `ModifierType: 'optional' | 'terminal'` (`moment.langium:221`, `ast-to-ir.ts:717-722` sets `entry.terminal = true`). The IR is a boolean, `MomentEntry.terminal?: boolean` (`frame-definition.ts:40`). A `[Terminal]` after a `branch-lane` is a context classification of the lane, not a property of the exit; derivation ignores it. **The grammar does not distinguish an outcome exit from a failure exit.** The only way to end an arm without falling through into the next moments is `[terminal]`, and `[terminal]` means `failure` in an arm.

This is a general limit. A flow's alternatives are not all failures; some end the thread at another normal outcome. TicketWave has the case once the flow is written the way the business says it: when the tier is sold out the customer joins the waitlist (`WaitlistJoined`), and when payment is approved after a re-hold the hold is converted (`HoldConvertedToReservation`). Both are successes, both must end the flow (what follows the branch is not their business), and both come out as `Failure Path: … [sold-out]` with `kind: failure` in the manifest and in Facet's ledger. (Verified on 0.8.0: `seat-request [sold-out]` is `failure`; `payment-settlement [approved-after-rehold]` is `failure` and ends at `HoldConvertedToReservation`.) A `failure` count that mixes refusals with business outcomes cannot be read as a health signal.

Modelling around it does not work inside today's grammar. Dropping `[terminal]` makes the arm fall through into the following moments (the walk continues), which is a different statement; and a branch moment that is the last of the flow is a coincidence, not a language.

## Decision

### D1. Syntax: a second exit modifier

```
ModifierType returns string:
    'optional' | 'terminal' | 'outcome';
```

`[terminal]` is unchanged: the flow ends here, and an arm that ends at it is a failure exit. `[outcome]` is new: the flow ends here, and an arm that ends at it is a normal outcome. The placement is the same, e.g. `presale: WaitlistJoined [outcome]`.

`outcome` becomes a keyword inside the modifier brackets. As ADR-037 and ADR-040 did for their keywords, `outcome` is added to the escape lists (`FieldName`, `LaneName`, `InputName`) so a model that already names a field, lane or input `outcome` keeps parsing. Checked: TicketWave and SAMMI use the word only in strings and comments.

### D2. IR

`MomentEntry` gains `exit?: 'outcome'`, set only by `[outcome]`. `[outcome]` also sets `terminal: true`, so every consumer that stops at a terminal (the walk, the generators, the topology's `terminal` flag, Facet's `terminal_state` assertion) behaves identically with no change. A model that does not use `[outcome]` has a byte-identical IR.

### D3. Classification

A selected arm is classified by the **first terminal placement the walk stops at** (the placement after which nothing is emitted):

- arm ends at `[terminal]` (no `exit`): `failure`, label `Failure Path: <flow> [<arms>]`, as today.
- arm ends at `[outcome]`: `variant`, label `Variant: <flow> [<arms>]`.
- no terminal in the arm: `variant`, as today.
- no deviation: `happy`.

`ScenarioKind` keeps its five values. The definition of `variant` widens from "deviated without hitting a terminal arm" to "deviated without a failure exit"; `failure` keeps its meaning, "a selected arm ends at a failure exit". `isHappyPath` and `isNegative` are unchanged.

### D4. Other derived artifacts

`@mmmnt/generate` renders `[outcome]` where it renders `[terminal]` today, with the word `(outcome)` in place of `(terminal)`, and counts the arm with the terminal arms for structure (it ends the flow). The topology node keeps `terminal: true` and carries no new field.

### D5. Validation

One advisory: a placement after a terminal or outcome in the same arm is unreachable (the walk stops). It is advisory because today's `[terminal]` has the same property and models rely on it. No new error.

## Consequences

- An author states the exit's nature in the place the exit is written. `failure` regains a single meaning.
- **Contract (Moment to Facet): no new field and no new `kind` value.** The only change is semantic: a `variant` may now end the flow. Facet maps `variant` to its `alt` badge (`scenarioBadges.ts:116`) and `KNOWN_SCENARIO_KINDS` already lists it, so no Facet change is needed. Documentation of the `kind` contract (ADR-031 text, `docs/contracts.md` in Facet, the `ScenarioKind` comments in both repos) is updated.
- Cost: one grammar token and one IR field; `ast-to-ir`, the generator's classification, the Gherkin and specification renderers, the TextMate syntax files and the generated `ast.ts` and `grammar.ts` change.
- Risk: authors may use `[outcome]` where a refusal is meant and lose the `failure` signal. Mitigation: the README states the reading (an `[outcome]` is something the business names as a result; a refusal stays a precondition, or a `[terminal]` when the flow shows it).

## Migration

**Not breaking.** The change is additive and opt-in: `[terminal]` keeps its meaning and its derived output, so TicketWave and SAMMI derive byte-identical output (TicketWave has 8 terminal arms and SAMMI none; none changes). A model adopts `[outcome]` placement by placement, and only then do its `Failure Path` scenarios become `Variant` ones. The one visible effect on an existing model is the new keyword: a field, lane or input named `outcome` still parses (D1), and a test pins it.

Compatibility proof (before from `origin/main`, after from the new build): golden comparison of IR and of every derived artifact for `fixtures/valid/**`, TicketWave at the commit this work branches from, and SAMMI, byte for byte; the regression test for the classification is verified by reintroducing the defect (ignoring `exit`, so every terminal arm is a failure): the new spec must fail.

## Rejected alternatives

1. **Reclassify by event name or by lane (`PaymentFailed` is a failure, `WaitlistJoined` is not).** Moment does not know which events are failures; the word in a name is not a model. ADR-040 and ADR-041 rejected the same "reading the name" move.
2. **Use the `branch-lane` classification (`[Terminal]`) as the signal.** It classifies a context lane, shared by exits of every nature; the same lane can hold a refusal in one flow and an outcome in another. A property of the placement is the right level.
3. **A new scenario kind (`outcome`).** It would be a contract change every consumer pays for: Facet's `ScenarioKind` union, `KNOWN_SCENARIO_KINDS`, `classifyScenarioType`, the ledger kind order, and any consumer's closed enums. Unknown kinds degrade (Facet reads them as `alt`), but the information is no better than `variant`, which already means "a deviation that is not a failure".
4. **Invert the default: `[terminal]` means outcome, a new `[failure]` marks refusals.** It silently changes the kind of every existing terminal arm in every model; TicketWave's 8 would move. Rejected as breaking with no gain.
5. **An arm-level marker (`when ratified [outcome]`).** The classification would live apart from the exit node it describes, and an arm with several placements would have two places to disagree. The placement already marks the end.
6. **Drop `[terminal]` and let the arm fall through.** A different statement: the main path continues after the arm. Not what an exit says.
7. **Leave it, and filter in the consumer.** The consumer receives the manifest and has no information to filter on (a waitlist-joined or hold-converted arm is labelled a failure).

## Enforcement and tests (test-first)

Written first, each failing for the right reason on `origin/main`:

| Spec | Fails before because | Proves after |
|---|---|---|
| `core/__tests__/grammar/moment-grammar.spec.ts` (extended): `[outcome]` on a placement in an arm | parse error | parses; `[terminal]`, `[optional]` unchanged |
| same: a field, a lane and an input named `outcome` | (passes) | still parse; pins D1's escape lists |
| `core/__tests__/parser/ast-to-ir-adr043.spec.ts` (new) | no `exit` field | `[outcome]` gives `terminal: true, exit: 'outcome'`; `[terminal]` IR byte-identical to baseline |
| `derive/engine/__tests__/simulation-adr043.spec.ts` (new): arm ending at `[outcome]` | the scenario is `failure` | `variant`, label `Variant:`, walk stops at the outcome node, nothing after it |
| same: arm ending at `[terminal]` | (passes) | `failure`, unchanged |
| same: label and kind agree for every combination (`resolveScenarioLabel` and `resolveScenarioKind` share the rule) | (passes) | agree |
| `cli/src/commands/simulate.test.ts`: manifest of the ticketwave fixture | the sold-out scenario is `failure` | `kind: variant`, `isHappyPath: false`, `isNegative: false` |
| `generate` Gherkin and specification-document specs | no rendering | renders `(outcome)` and counts the arm as ending the flow |
| Facet suite over the regenerated ticketwave fixture | n/a | all scenarios pass (the walk is unchanged: `terminal: true` on the node) |
| Golden compat; defect re-introduction | n/a | as above |

**Fixture added:** `flow "seat-request"` of ADR-042 (arm `sold-out` ends `WaitlistJoined [outcome]`), and in `flow "payment-settlement"`:

```
  moment "Payment processing" [branch]
    when approved
      checkout: ConfirmPayment
      checkout: PaymentConfirmed
      inventory: ConvertHoldToReservation
        triggered-by PaymentConfirmed
      inventory: HoldConvertedToReservation [outcome]
```

The existing arms of `general-admission-purchase` (`PaymentFailed [terminal]`, `CustomerBlocked [terminal]`) are not touched: they are refusals and stay failures, which the fixture asserts side by side. Expected manifest: `seat-request-1` is `variant`, `general-admission-purchase` `declined` stays `failure`.

### Reachability sweep before any "done" claim

For every `exit` value written in any model of the repository (fixtures, TicketWave): confirm a derived scenario ends at that node and carries the matching `kind`. For every `[terminal]` arm: confirm it is still `failure`. Report orphans.
