# ADR-045: A policy declares the condition under which it reacts

- **Status:** Accepted (2026-11-07, founder: "Accept both", paired with FACET-ADR-021, which Facet builds later)
- **Date:** 2026-11-07
- **Supersedes:** nothing. Extends ADR-038 section 1 (policy) and ADR-031's `policy-definitions.json` contract, additively. Pairs with FACET-ADR-021, which consumes the field.
- **Founder ruling (2026-11-07, verbatim option):** "Open a Facet/Moment ADR", for a policy that fires only on some occurrences of its trigger.
- **Release:** 0.10.0 (minor), with ADR-046.
- **Numbering:** next free after ADR-044 (`docs/adr` held ADR-040 to ADR-044).
- **Build note (2026-11-07):** built as written, with these differences and verifications.
  1. *The `=` token.* A new literal `=` in the grammar (`"="` in `MomentKeywordNames`). Identifiers (`[a-zA-Z_][a-zA-Z0-9_-]*`) cannot contain it, so no existing token changes. Holds.
  2. *`when` in policy context.* `when` is already a keyword (arms, emit outcomes, `[branch]`), the rule `trigger ID ('when' FieldName '=' AnnotationValue)? ('after' ID)?` has no ambiguity with the `action` that follows, and the field is a `FieldName`, so a field named with a keyword-like word (`outcome`, `state`, `cause`) can be guarded. Holds.
  3. *The generator can identify the occurrence.* The occurrence a reaction names is the one `findCausationEvents` already links: the nearest earlier placement of the trigger on the walked path, for a `triggered-by` connection that applies to the node in its moment and arm. D4 reuses that function, so the declared occurrence and the causation link cannot disagree. Holds.
  4. *Value types.* The value is an `AnnotationValue` (ID or STRING), as D1 says, so a number is written as a string (`when attempts = "3"`). The generator writes it as the field's type (`number`, `boolean`) and as a string otherwise.
  5. *Rules.* The draft's "V-new" are `V49` (a `when` field the trigger does not carry), `V50` (an `after` event that is not declared) and `V51` (advisory: no flow places the `after` event before the trigger; checked only when some flow places the trigger at all, so a policy no flow places says nothing). A trigger that is no declared event is already `V30`, so no second rule. Severity follows ADR-038's split: a warning per file, an error over a merged project; `V51` is always a warning.
  6. *`after` is a keyword* and is escaped in `FieldName` and `LaneName` (so also input names), as ADR-043 did for `outcome`. A model that names a field, lane or input `after` still parses; a test pins it. TicketWave and SAMMI use the word only in strings and comments.
  7. *The guard on `outcome`* is allowed, see D2 and ADR-046.
  8. *Non-matching occurrences* keep the sample value; when the sample would equal the declared value, the generator moves it off (suffix `-other`, `+1`, negated boolean), so the declared occurrence is the only one that meets the guard.
  9. *Fixtures.* `after SeatsHeld` on `ConvertHoldOnPayment` holds for the occurrences that have `SeatsHeld` among their causes (`general-admission-purchase`, `presale-access`, and the `approved-after-rehold` arm of `payment-settlement`); the `approved` arm has no such cause in its flow, so a consumer that evaluates the condition there finds it unmet. That is the model saying so; it is not changed here. SAMMI was proved on a scratch copy (not committed): `trigger Connected when email = "..."` on `ReconcileOnConnected` writes the value on the occurrence of `Connected` the flow's `Reconcile triggered-by Connected` names, and nowhere else.
- **Source read:** Moment 0.9.0 (`moment-090`): `packages/core/src/grammar/moment.langium` (`PolicyDeclaration`), `packages/core/src/parser/ast-to-ir.ts` (policy lowering, `triggered-by`), `packages/cli/src/commands/simulate.ts` (`policy-definitions.json`), `packages/derive/src/engine/simulation-scenario-generator.ts`; Facet `policyChainEvaluator.ts`.

## Context

A policy is "when one domain event, then one command" (`policy P / trigger E / action "..." / chains-to C`). The grammar gives it no way to say that it reacts to **some** occurrences of `E` and not others. The `action` text may say so in prose, but nothing a tool can read does.

A policy that reacts conditionally is ordinary. In TicketWave:

- `PromoteWaitlistOnRelease` (trigger `HoldReleased`, chains-to `NotifyWaitlistPromotion`) is meant for a hold that **expired**; `HoldReleased` carries a free `reason` field, and a release for another reason (an abandoned cart, a failed payment) is assumed to promote no one. This is the fixture's premise, not a statement about TicketWave's intent.
- `ConvertHoldOnPayment` (trigger `PaymentConfirmed`, chains-to `ConvertHoldToReservation`) reacts to a payment confirmed against a **held seat** (`SeatsHeld` upstream); a confirmation that settles a re-hold has a different cause (`payment-settlement`, ADR-044).

The topology states the reaction once, at the placement that shows it (`ConvertHoldToReservation triggered-by PaymentConfirmed`). A flow that places the trigger event several times in one frame (a retry loop, a repeated step, an alternative that reaches the same event by another route) therefore says "the reaction follows `PaymentConfirmed`" without saying **which** occurrences. A consumer that proves reactions per occurrence (Facet's `policy_chain`, FACET-ADR-018 section 3) must treat every occurrence in the frame as obliged, or none.

Measured on the Moment 0.9.0 output of one large production-style model (389 generated scenarios): Facet's `policy_chain` fails 2 on policies whose reaction is conditional on the occurrence, because the occurrences that do not meet the condition are held to the reaction. Each is a correct scenario and a correct model; the contract has no field to say the rest. The TicketWave policies named above have the same shape, and the fixtures below prove them.

This is not resolvable in the model: splitting the flow so each occurrence has its own frame changes the story to fit a tool limit (rejected alternative 1), and the policy's condition is a property of the policy, not of one flow.

## Decision

### D1. Grammar: an optional condition on the trigger

```
policy PromoteWaitlistOnRelease
  trigger HoldReleased when reason = expired
  action "Check waitlist ..."
  chains-to NotifyWaitlistPromotion

policy ConvertHoldOnPayment
  trigger PaymentConfirmed after SeatsHeld
  action "Convert seat hold ..."
  chains-to ConvertHoldToReservation
```

After the trigger name, zero or more of, in this order:

- `when <field> = <value>`: the trigger event's own field `<field>` has the value `<value>` (ID or STRING, as `AnnotationValue`). One equality only.
- `after <Event>`: the occurrence has `<Event>` among its causes, directly or transitively through the causation links Moment already derives (`triggered-by`, command emission).

Both present means both must hold. Neither present is today's policy, byte for byte. `when` is reused (already a keyword for arms and emit outcomes); `after` becomes a keyword and is escaped as ADR-037/040/043's keywords are.

### D2. Validation

- V49 (error over a merged project): `<field>` is not a field of the trigger event (a trigger that is not a declared event is V30).
- V50 (error over a merged project): `<Event>` of `after` is not a declared event.
- V51 (warning): `after <Event>` where no flow places `<Event>` before the trigger (the condition is never met).
- A guard on a field named `outcome` is **allowed**. The draft forbade it because the generator wrote the arm's condition into `payload.outcome`, so a guard on that name could not be told from the stamp. ADR-046 moves the stamp to its own key, `$branch`, so the collision is gone and the field is guarded like any other. (Interaction with ADR-046: an event that declares `outcome` keeps its own value there, and that is the value the guard sets and reads.)

### D3. IR and `policy-definitions.json`

`PolicyDefinition` gains `condition?: { field?: string; equals?: string; after?: string }`. `simulate` emits `condition` on the policy's entry when declared and nothing otherwise, so an undeclared policy's JSON is unchanged. The contract (ADR-031) adds the optional key; consumers ignore unknown keys.

### D4. Scenario derivation honours the condition

For a declared reaction (a placement `C` with `triggered-by E`, where `E` is the trigger of a policy with a `when` condition and `C` is its `chains-to`), the occurrence of `E` that the connection names (the nearest earlier placement of `E` on the walked path) is generated with `field = value` in its payload. Every other occurrence of `E` keeps the generator's usual sample value, which differs from the declared value. An `after` condition needs no generation: the causation links already hold it, and an occurrence not caused by `<Event>` carries no such ancestor.

The guard is written under the field's own name, so it is independent of the branch stamp (ADR-046): a guard on `outcome` sets the event's own `outcome` field, and the arm is read from `$branch`.

A scenario therefore tells the truth about which occurrences the policy reacts to, and a consumer reads the condition from the artifact, not from prose.

### D5. Nothing else changes

No scenario count, id, `kind`, event type or topology field changes for a model whose policies declare no condition.

## Consequences

- A policy states, in a form tools read, when it reacts. Consumers can stop treating "reacts to some occurrences" as an unsayable.
- **Contract (Moment to Facet): one optional key on a `policy-definitions.json` entry** (`condition`), and the guarded field carrying the declared value on the occurrences that react. A Facet that ignores the key behaves as today.
- Cost: grammar rule, IR field, three validations, a payload assignment in the generator, `simulate` output. `ast.ts` and `grammar.ts` regenerate (as ADR-043).
- Risk: a guard narrows what is proven. A model that wrongly declares a condition loses the proof for the occurrences it excludes; the reachability sweep below names every excluded occurrence so that is visible. FACET-ADR-021 keeps the proof for every occurrence that meets the condition (falsifiable).
- Risk: `field = value` is one equality (a number is written as a string and typed by the field). A condition that needs more (a range, a field of another event) is not expressible; `after` covers "caused by a given event", which is the other common shape. Neither is a general expression language, deliberately.

## Migration

**Not breaking.** Nothing changes for a model that declares no condition: grammar, IR, `policy-definitions.json` and every scenario are byte-identical. Counted on the models of 0.9.0 (policies with a trigger-side condition / all): TicketWave 0 / 19, SAMMI 0 / 1, so both are unchanged until an author adds a `when` or `after`. The fixtures below are the first.

Compatibility proof: regenerate TicketWave (at its 0.9.0 spec), SAMMI and every valid fixture with the new build; every output equals the 0.9.0 build's, byte for byte, except the one deliberate change of ADR-046 (the new `$branch` key and the branch predicate's `field`). Verified by reintroducing the defect: with the key always emitted (empty object) the IR and `policy-definitions.json` specs fail.

## Rejected alternatives

1. **Split the flow so each trigger occurrence is its own frame (per-occurrence frames in the model).** It rewrites the story to match a tool: a retry loop becomes N frames, frame ids, `branchPredicates` and every consumer's idea of a moment change (ADR-044, alternative 2, rejected the same for arms), and the condition is still not stated anywhere. The policy's condition belongs to the policy.
2. **Let Facet infer the condition from causation alone** (an occurrence is obliged only where some command is causally linked to it). It is the behaviour "any occurrence without a link did not fire", so a reaction that **should** have fired and did not is invisible: `policy_chain` could never FAIL. The falsifiability overhaul (777bed0) forbids exactly this.
3. **Mark such chains advisory** (no FAIL for a policy with a conditional reaction). Unfalsifiable by construction for the occurrences that do meet the condition, and "which chains" is a list someone must maintain; gates sweep, not enumerate.
4. **Put the condition in the `action` text and let consumers parse it.** Prose is not a contract; a rewording changes the verdict.
5. **A full expression language for the guard (`and`, `or`, comparisons, other events' fields).** It invites a second modelling language inside the first. The two forms above cover the measured cases; anything more needs its own evidence and ADR.
6. **Put the guard on the flow's `triggered-by` placement instead of on the policy.** The flow states a reaction once; the policy is where the rule lives and is shared by every flow that places the trigger. A per-flow guard would be restated, and could disagree, in each flow.
7. **A config flag that switches `policy_chain` strictness.** An ungoverned mechanism that changes domain behaviour; the condition belongs in the spec.

## Enforcement and tests (test-first)

| Spec | Fails before because | Proves after |
|---|---|---|
| `core/parser/__tests__` (extended): `trigger E when f = v`, `trigger E after X`, both, neither | parse error / not parsed | parsed; IR carries `condition`; neither equals today's IR |
| `core/validation/__tests__`: unknown field, unknown `after` event, field `outcome`, unsatisfiable `after` | no rule | error / error / error / warning |
| `cli/commands/__tests__/simulate`: `policy-definitions.json` with and without a condition | key never emitted | key present only when declared |
| `derive/engine/__tests__/scenario-generator`: flow with the trigger placed twice, reaction after the second | both occurrences carry the sample value | only the occurrence the connection names carries `f = v` |
| Golden compat (TicketWave, SAMMI, no condition) | n/a | every artifact byte-identical |
| Facet suite over the regenerated fixture (FACET-ADR-021's tests) | n/a | passes |
| Defect re-introduction | n/a | with the payload assignment removed the generator spec fails |

**Fixtures added to `examples/ticketwave/spec/ticketwave.moment`:** `PromoteWaitlistOnRelease` gains `when reason = expired`; `ConvertHoldOnPayment` gains `after SeatsHeld`. A flow `hold-release` places `HoldReleased` twice in one moment and `NotifyWaitlistPromotion triggered-by HoldReleased` after the second: the first carries the sample reason, the second `expired`. SAMMI is proved on a scratch copy (see the build note), never edited.

### Reachability sweep before any "done" claim

For every policy with a `condition` in TicketWave and SAMMI: list each scenario that holds an occurrence of its trigger, and for each occurrence say whether it meets the condition. A policy whose condition is met in no scenario, or by every occurrence, is reported (the first proves nothing, the second does not need the guard).
