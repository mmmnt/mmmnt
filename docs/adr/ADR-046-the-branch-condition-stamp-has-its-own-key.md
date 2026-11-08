# ADR-046: The branch condition stamp has its own key

- **Status:** Accepted (2026-11-07, founder, option "Move the stamp": "A Moment ADR moves the branch name to its own reserved key, so a model's own field is never overwritten. Facet reads the new key and still reads `outcome` from older Moment output.")
- **Date:** 2026-11-07
- **Supersedes:** nothing. Amends the payload contract of the simulation scenario (ADR-023 and the generator's header) and the branch predicate of the topology (ADR-031), additively. Interacts with ADR-045 (the guard on `outcome`).
- **Release:** 0.10.0 (minor), with ADR-045.
- **Numbering:** next free after ADR-045.
- **Source read:** `packages/derive/src/engine/simulation-scenario-generator.ts` (`buildPayload`, `entryToNode`, the file header), `packages/derive/src/engine/topology-emitter.ts` (`buildBranchPredicates`); Facet `store/sagas/walkerSaga.ts` (`evaluateBranchPredicate`, `evaluateBranchRecord`), read only.

## Context

The scenario generator records which arm of a `[branch]` moment a scenario took by writing the arm's condition into `payload.outcome` of every event placed in that arm (and of the first node of the branch moment). It writes it last, after the event's own fields, so it replaces whatever the model declared:

```
event WaitlistOfferAnswered
  outcome: string        -> payload.outcome = "accepted"  (the arm), not the event's own value
```

An event, command input or crossing-contract field that the model legitimately names `outcome` therefore carries the arm's name instead of its own value, in every arm. The model is correct; the artifact is wrong. The grammar even allows the name (ADR-043 escaped `outcome` in `FieldName` so such models keep parsing). The topology's `branchPredicates[*].field` is `outcome`, so a consumer that reads the arm through it reads the model's field on exactly those events.

## Decision

### D1. The stamp moves to `$branch`

The selected branch condition is written to `payload.$branch` on every event inside the selected arm (the same events as before), and the topology's `branchPredicates[<frame>].field` is `$branch`. Facet reads the arm through `payload[predicate.field]`, so it follows the key the topology names; it needs no new rule to read the new key, and it reads `outcome` from an older artifact because that artifact's predicate names `outcome`.

**Why `$branch`.** The key must be one no model field can be named. Every name a model can write (field, command input, contract field, lane) is an identifier, `[a-zA-Z_][a-zA-Z0-9_-]*`, so a key containing `$` cannot be produced by any model: the lexer rejects it (a test pins it), and no collision is possible now or after a later grammar change that stays within identifiers. `$` is the conventional prefix for a reserved, non-domain key in JSON. The name says what it holds (the arm taken, `branch`), and it matches the vocabulary of the model (`[branch]`, `branchCondition`, `branchSelections`). Keys such as `nodeId`, `processName` and `whenState`, which Moment also writes, are plain identifiers and can still collide with a model field; they are outside this ADR and not changed here.

### D2. `outcome` is still written, but never over a model field

For compatibility with consumers that read `payload.outcome` (the previous contract), the generator keeps writing `payload.outcome = <arm>` **when the event declares no field of that name** (no declared event field, command input or crossing-contract field called `outcome`). When the event declares one, the model's own value stays, and the arm is available only under `$branch`. Dropping `outcome` altogether was rejected (alternative 2).

So, for every event inside an arm:

| The event declares `outcome` | `payload.$branch` | `payload.outcome` |
|---|---|---|
| no | the arm | the arm (as before) |
| yes | the arm | the event's own sample value |

Events outside an arm carry neither key, as before.

### D3. Nothing else changes

Scenario ids, `kind`, order, causation, `activeBranches`, `expectedPath`, and every file other than scenarios' event payloads and topology branch predicates are unchanged. Branch coverage keys (`routes`) are unchanged.

## Consequences

- A model's own `outcome` is no longer overwritten; ADR-045 can allow a guard on a field named `outcome`.
- **Contract (Moment to Facet):** the arm is under `payload.$branch`, and `branchPredicates[*].field` names it. A Facet that reads `payload[predicate.field]` (it does) follows with no change; a Facet or other consumer that reads `payload.outcome` by name keeps working for every event that declares no `outcome` and reads the model's own value for the ones that do, which is the correct reading. Facet should read `predicate.field` (or `$branch`) and fall back to `outcome` for artifacts made before 0.10.0.
- Golden files change in two ways only: an added `"$branch"` line on every event inside an arm, and `"field": "outcome"` becomes `"field": "$branch"` in each branch predicate. TicketWave's committed `examples/ticketwave/facet/` is regenerated in the same commit.
- Cost: one constant (`BRANCH_KEY`, exported from `@mmmnt/derive`), a conditional write, one topology line.
- Risk: a consumer that reads `outcome` for the arm on an event that declares its own `outcome` now reads the model's value. That is the defect being removed. Such a consumer must read `$branch`.

## Migration

**Not breaking for a model.** No spec changes. For an artifact: additive (`$branch`), except the branch predicate's `field`, which names the new key; an old consumer that evaluates the predicate through `payload[field]` is unaffected, since every event the predicate applies to carries `$branch`. A model with no `outcome` field derives byte-identical output apart from those two classes.

Compatibility proof: regenerate every valid fixture, TicketWave at its 0.9.0 spec and SAMMI with the 0.9.0 build and the new build (simulate, generate, emit-ts, derive, viz, parse): the only differences are the added `"$branch"` lines and the predicate `field` line; `generate`, `emit-ts`, `derive`, `viz` and `parse` output is byte-identical. The specs are verified by reintroducing each defect: overwriting `outcome` again, not writing `$branch`, dropping the `outcome` compatibility write, and naming `outcome` in the predicate each fail a spec.

## Rejected alternatives

1. **Keep `outcome` and warn on models that name a field `outcome`.** It makes a legitimate name unusable (ADR-043 had just made it parseable) and pushes a tool limit onto the model. The collision is the tool's.
2. **Stop writing `outcome` entirely.** Cleaner, but every consumer that reads the arm from `payload.outcome` breaks at once, with no signal. The cost of writing it where it cannot collide is one key; compatibility is worth that.
3. **A plain identifier as the new key (`branch`, `_branch`, `momentBranch`).** An identifier is a name a model can write, so the collision is deferred, not removed.
4. **Nest the stamp (`payload.moment.branch`).** A nested object changes the shape of every payload and a consumer's `payload[field]` read; a flat reserved key keeps the predicate mechanism as it is.
5. **Put the arm only in the topology or the scenario's `activeBranches`.** Those are per scenario or per frame, while the walker evaluates an arm per event from its payload; the stamp is where the consumer looks.
6. **Rename the model's field in the artifact (`outcome` becomes `outcome_`).** The artifact would no longer match the event the model declares; the schema and catalog would disagree with the payload.

## Enforcement and tests (test-first)

| Spec | Fails before because | Proves after |
|---|---|---|
| `derive/engine/__tests__/simulation-adr046`: arm events carry `$branch`, others neither key | no `$branch` | present inside the arm, absent outside |
| same: an event and a command input named `outcome` keep their own value | overwritten by the arm | `sample-outcome` stays |
| same: an event with no `outcome` still carries it, equal to `$branch` | n/a (compat pin) | holds |
| same: topology predicate `field` | `outcome` | `$branch` |
| same: `$branch` is not producible as a field name | n/a | lexer rejects it |
| `derive/engine/__tests__/derivation-compat-adr041` | n/a | the committed TicketWave facet files are the derivation of the spec |
| Golden compat (every valid fixture, TicketWave 0.9.0 spec, SAMMI) | n/a | only the two classes of difference above |
| Defect re-introduction | n/a | each of the four defects fails a spec |

**Fixture added to `examples/ticketwave/spec/ticketwave.moment`:** a flow `waitlist-offer` with a `[branch]` moment whose arms contain `AnswerWaitlistOffer` (input `outcome`) and `WaitlistOfferAnswered` (field `outcome`). Each event keeps its own `outcome` and carries the arm in `$branch`.
