# ADR-050: A policy condition reads the variant of a union field

- **Status:** Accepted (2026-11-14, founder, flmnt decision 85aab064, "Accept + release 0.13.0 (Recommended)"). Released in the `@mmmnt/*` 0.13.0 group.
- **Date:** 2026-11-14
- **Supersedes:** nothing. Extends ADR-045 D1 to D4 (the `when` condition of a policy) for the tagged unions of ADR-049 D3, additively.
- **Founder ruling (Sift workspace 729c1a1d, flmnt decision 5c6f0ecd, 2026-11-14, Q2, verbatim label):** "Union + Moment extension": a field becomes a tagged union "with a Moment extension so a policy condition can read `decision.kind`". The same founder's standing rule for Moment work (flmnt decision 0b837d08, Q1): "do not extend Moment with specificity to Sift's use case".
- **Release:** proposed 0.13.0 (minor), on the founder's go. Nothing is published by this branch.
- **Numbering:** next free after ADR-049.
- **Build note (2026-11-14):** built as written, with these notes.
  1. _Grammar._ `ConditionPath returns string: FieldName ('.' FieldName)*` replaces `FieldName` after `when`. As a datatype rule it is written back without spaces, so the AST-to-IR lowering is unchanged and `condition.field` is `"decision.kind"`. No keyword or token is added.
  2. _Rules._ V56 and V57 are in `validation/policy-condition.ts` beside V49–V51 and take their severity (a warning per file, an error over a merged project, pinned by a test). A field whose type names no declared value object in what is checked is undecidable, so both stay quiet in a single file whose union is declared in another file, and the merged project decides them (also pinned). A value object is looked up in the event's context and its aggregates first, then in every context.
  3. _Shared helper._ `conditionPath` and `UNION_DISCRIMINATOR` are exported by `@mmmnt/core` and used by the rules and the generator.
  4. _Generator._ The other occurrence's variant is the first one that no guard on the same field declares (D4); with one variant the sample `{}` stays. A dotted path that V56 refuses writes nothing.
  5. _Measured._ The IR (the full `ParseResult`) of all 86 existing `.moment` files is identical before (origin/main e948fb0) and after. `parse`, `test`, `derive`, `viz`, `cucumber-json`, `simulate --all --json`, `simulate --all --out-dir`, `generate`, `emit-ts`, `board` and `schema emit` over TicketWave, the 11 earlier valid fixtures and the Sift model copy write 1,573 files, all identical once wall-clock stamps are masked (`generatedAt`, `startedAt`, viz `sessionId` and `timestamp`, which differ between two runs of the same build). Commands that exit 1 (`board` on fixtures whose flows carry no id, and directories that a file-only command refuses) exit 1 with the same output before and after.
  6. _Fixture._ `fixtures/valid/union-conditions`: `simulate` writes `{"kind": "Refused"}` on the first `DecisionRecorded` and `{"kind": "Admitted"}` on the second, the one `StartVisit triggered-by DecisionRecorded` names; `policy-definitions.json` carries `{"field": "decision.kind", "equals": "Admitted"}`; the board's manifest and its policy frame write `decision.kind = Admitted`. The flow is named `N1 - …` because `moment board` requires a flow id.
- **Source read:** Moment 0.12.0 (`packages/core/src/grammar/moment.langium` `PolicyDeclaration`, `parser/ast-to-ir.ts`, `validation/policy-condition.ts`, `derive/engine/simulation-scenario-generator.ts`, `derive/engine/policy-definitions-generator.ts`, `board/src/uses.ts`); Facet `feat/adr-021` at ad8fcdb (`policyChainEvaluator.ts`, `parseCondition`, `conditionVerdict`); the Sift model copy in `packages/board/fixtures/sift-model`.

## Context

ADR-045 lets a policy react to some occurrences of its trigger: `trigger E when <field> = <value>`, one equality on one field of the trigger event. ADR-049 added tagged unions: a value object with `| Variant` lines, whose value is an object discriminated by the property `kind`.

A field typed by a union can no longer be guarded. Its recorded value is an object (`{"kind": "Admitted"}`, `{"kind": "Refused", "reason": "Disabled"}`), and `when decision = Admitted` compares that object with a string. Nothing says so today: V49 checks only that the field exists, the scenario generator writes the string `"Admitted"` over the object, and Facet's `policy_chain` (FACET-ADR-021) compares `String(payload.decision)`, which is `[object Object]`, so every occurrence is decidably unmet and the reaction is never held to account.

The measured case is a Sift model edit (decision 5c6f0ecd): `GateDecisionRecorded.decision` becomes a union `GateDecision { Admitted | Refused(reason) | Filtered | Postponed | NoOp }`, and its policy `AdmittedGateDecisionStartsCycle` (today `trigger GateDecisionRecorded when decision = Admitted`, a code-set field) must still say that it reacts to an admitted decision. The shape is general: any union in an event (an arrival's kind, an effect, a resolution) is the natural thing for a policy to react to.

## Decision

### D1. Syntax: `when <field>.kind = <Variant>`

```
value-object Decision
  | Admitted
  | Refused
      reason: "Disabled" | "Superseded"
  | Postponed

event DecisionRecorded
  unit: string
  decision: Decision

policy AdmittedDecisionStartsVisit
  trigger DecisionRecorded when decision.kind = Admitted
  action "An admitted decision starts the visit"
  chains-to StartVisit
```

The `when` field may be a path: the trigger's own field, a dot, and `kind`. It reads as the payload is recorded: `decision.kind` is the property that holds the variant's name (ADR-049 D3), and the value is that name. It is still one field and one value (ADR-045 D1, rejected alternative 5): the comparison is an equality, the value is an `AnnotationValue`, and `after` combines with it as before.

Only `kind` is reachable, and only on a field whose type is a union value object (D2). A general path into value objects (`when actor.sub = x`, `when arrival.documentVersion.version = 2`) is **not** added: it would reach values the model does not declare closed, so no rule could check the value, and it is the start of the expression language ADR-045 rejected. The discriminator is the one nested value whose domain the model declares (the variant names), which is why a rule can check it. The syntax leaves room: a later ADR can allow other segments without changing what `.kind` means.

The grammar reads a path as `FieldName ('.' FieldName)*` (the `.` token already exists, for `issues External.operation`), so that a path the rule refuses gets a validation message that names it, not a parse error. A path with no dot is exactly ADR-045's field.

### D2. Validation

Both rules compare names across declarations (the trigger event, the value object of its field), so they follow V49's severity: a warning per file, an error over a merged project. Each says nothing when the trigger event or the field's value object is not declared in what is checked (V30 and V49 already speak, and in a single file the value object may be in another file).

- **V56** A `when` path is `<field>.kind` on a field of the trigger whose type is a union value object, not an array and not a map. Refused: a path on a field of any other type (a built-in, a code set, a scalar or record value object), a segment other than `kind`, more than one segment, a path on an array or a map field (which element?). Also refused: a guard on a union-typed field **without** `.kind` (`when decision = Admitted`): it compares an object with a string and is never met; the message says to write `decision.kind`.
- **V57** In `when <field>.kind = <Variant>`, `<Variant>` is a variant the union declares.

A path on a record value object is refused rather than allowed (the alternative the ruling left open) because a record's fields are as open as the event's own: allowing `.sub` but not checking its value would make the rule a parse check only. Allowing value-object paths is the general-path option of D1, rejected there.

V49 checks the path's first segment, the trigger's own field. A model with no dotted path gets exactly V49 as before.

### D3. IR and `policy-definitions.json`

Unchanged in shape: `condition.field` is the path as written (`"decision.kind"`), `condition.equals` the variant (`"Admitted"`). A condition without a dot is ADR-045's, byte for byte.

The dotted string is chosen over a split (`field: "decision"` plus a `path` or `variant` key) for what a consumer that has not been updated does with it:

- Facet's evaluator (FACET-ADR-021 D2) reads `payload[field]`. For `"decision.kind"` the key is absent, so the condition is **undecidable**, which FACET-ADR-021 treats as met: the reaction is held at every occurrence, as strict as a policy with no condition. Never weaker.
- With `field: "decision"` the same evaluator would read the object, compare `[object Object]` with `"Admitted"`, find every occurrence decidably unmet and SKIP them all: a silent loss of the proof. Rejected (alternative 3).

`ADR-031`'s contract therefore gains a meaning, not a key: `field` may be a dot-separated path into the payload, today only `<field>.kind`.

### D4. Scenario derivation

For a guard `<field>.kind = V` (ADR-045 D4, same occurrence selection, `findCausationEvents`'s nearest earlier placement):

- the occurrence the reaction names carries `<field>: { kind: "V" }` (merged over the sample value, which is `{}` for a value object today);
- every other occurrence of the trigger carries `<field>: { kind: "W" }`, `W` the union's first variant that no guard on that field declares (else the first variant other than `V`). An object without `kind` would be undecidable to a consumer that reads the path, so it would be held to the reaction: the other occurrences must decidably not meet the guard, as ADR-045 D4 promises. A union with one variant leaves them as sampled;
- a field the payload does not carry (the second member of an exclusive group, ADR-049 D9) is not written, as ADR-045 does.

The variant's own fields are not sampled: a value object field samples `{}` in 0.12.0, and this ADR does not change payload sampling beyond the discriminator.

### D5. Renderers

What renders a policy's condition today renders the path as written: the board (`policyText`, `conditionText` of the manifest: `decision.kind = Admitted`) and `policy-definitions.json`. Gherkin, the specification document, `emit-ts`, `viz`, the harness and the MCP tools do not render a policy's condition in 0.12.0 (only its name, trigger and command), and this ADR adds no new rendering: it would change their output for every model with an ADR-045 condition (TicketWave has two). The derived scenarios, and the Gherkin and documents built from them, carry the variant in the payload.

### D6. Nothing else changes

No grammar change outside the `when` field, no keyword (`.` and `kind` are already a token and an identifier), no IR key. A model with no dotted path parses to the same IR and every artifact is byte-identical.

## Consequences

- A policy can react to a union's variant, checked against the declared variants. Sift's `AdmittedGateDecisionStartsCycle` reads `trigger GateDecisionRecorded when decision.kind = Admitted` once its model makes `decision` a union.
- **Facet:** the guard takes effect only when Facet resolves a dotted `field` (`payload.decision.kind`) in `conditionVerdict`. Until then Facet holds the reaction at every occurrence (D3): a FAIL is possible on an occurrence of another variant whose reaction the flow declares, never a lost proof. A Facet ADR (an amendment of FACET-ADR-021 D2: "`field` is a dot-separated path; an absent segment is undecidable") is needed in the Facet repository; it is not part of this change.
- A model that made a field a union under 0.12.0 and kept `when field = Variant` gets V56, which names the fix. That guard was never met.
- Cost: one grammar rule, two rules, a branch in the generator. `ast.ts` and `grammar.ts` regenerate.
- Risk: only `kind` is reachable. A policy that must react to a variant's field (`Refused` with `reason = Disabled`) cannot say so; that needs a general path and its own ADR.

## Migration

**Not breaking.** Every `.moment` file that parsed under 0.12.0 parses to the same IR, and `parse`, `test`, `derive`, `viz`, `cucumber-json`, `simulate --all` (JSON and out-dir), `generate`, `emit-ts`, `board` and `schema emit` write the same output, byte for byte, for TicketWave, every valid fixture and the Sift model copy. V56 can report only a guard on a union-typed field, and no existing model has one (unions are new in 0.12.0).

## Rejected alternatives

1. **`when decision is Admitted`.** Reads well, but `is` becomes a keyword (escaped in field, input and lane names, as `after` and `pattern` were) and a second comparison form beside `=`. The dotted form names the property the payload records and needs no new word.
2. **Keep `when decision = Admitted` and let the field's type decide** (a union field compares its `kind`). No syntax at all, but the condition no longer says what it compares, and every consumer of `policy-definitions.json` must look the type up to read it; with `field: "decision"` an old Facet loses the proof (D3).
3. **Split the IR (`field: "decision", variant: "Admitted"`).** Cleaner to read in code, but an old Facet ignores `variant`, reads the object and SKIPs every occurrence (D3).
4. **General dotted paths into value objects.** See D1 and D2: values the model does not declare closed, unchecked, and the way to an expression language.
5. **A union-specific keyword on the trigger (`trigger DecisionRecorded Admitted`, or `on variant`).** Sift-shaped, and a second condition form beside ADR-045's.

## Enforcement and tests (test-first)

| Spec                                                                                                                                                                                                                  | Fails before because                             | Proves after                                                               |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------- |
| `core` parser: `when decision.kind = Admitted`, with `after`, a deeper path                                                                                                                                           | parse error                                      | parsed; `condition.field` is the path as written; no dot is today's IR     |
| `core` validation: V56 (a path on a non-union, a code set, a record value object, an array; a segment other than `kind`; a union field without `.kind`), V57 (an undeclared variant); V49 on the path's first segment | no rule; V49 reports `decision.kind` as no field | the error per rule, nothing on the valid fixture                           |
| `derive` scenarios: the trigger placed twice, the reaction after the second                                                                                                                                           | the payload gets the string `"Admitted"`         | `{kind: "Admitted"}` on the named occurrence, another variant on the other |
| `derive` `policy-definitions.json`                                                                                                                                                                                    | n/a                                              | `field: "decision.kind"` as written                                        |
| `board` policy text and manifest                                                                                                                                                                                      | n/a                                              | `decision.kind = Admitted`                                                 |
| Golden compat: TicketWave, every valid fixture, the Sift model copy                                                                                                                                                   | n/a                                              | IR and every CLI artifact byte-identical to 0.12.0                         |

**Fixture:** `fixtures/valid/union-conditions` (a generic admission model): a union `Decision`, a policy guarded on `decision.kind = Admitted`, and a flow that places the trigger twice before the reaction.
