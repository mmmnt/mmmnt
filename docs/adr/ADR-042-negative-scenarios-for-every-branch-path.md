# ADR-042: Negative scenarios are derived for every path of a flow, not for the first-arm path only

- **Status:** Accepted (2026-11-07, founder)
- **Date:** 2026-11-07
- **Supersedes:** nothing. Amends the derivation described by ADR-031 section "negative scenarios" (scenario `kind: negative`).
- **Founder approval (2026-11-07, relayed):** fixing four limits found in the derivation. Standing rule: Moment evolves on its own merits; this ADR is justified and proven on TicketWave and SAMMI.
- **Release:** 0.9.0 (minor, fixed `@mmmnt/*` group), with ADR-043 and ADR-044.
- **Numbering:** `docs/adr/` on `origin/main` (bcbc0b3) holds ADR-040 and ADR-041; this takes 042.
- **Build note (2026-11-07):** the draft counted SAMMI as +0. Built and run on the model, it is +1: T7's `RecordSessionLoss` is placed only in the `SessionRevoked` arm, so its `WasConnected` refusal was never reached, which is the limit this ADR removes. The reachability sweep below (expected empty) requires it. The decision is unchanged; the counts above are the measured ones.
- **Source read:** `origin/main` bcbc0b3, `packages/derive/src/engine/simulation-scenario-generator.ts`, `packages/cli/src/commands/{simulate,serve}.ts`, `examples/ticketwave/`, SAMMI `firebase/model`.

## Context

A command's preconditions are the model's statement of when the command refuses. `deriveNegativeScenarios` turns each (command, precondition, cause) into a scenario in which the command is invoked without the precondition, so Facet can prove the refusal produces no effect.

The derivation walks one path only. Evidence:

- `simulation-scenario-generator.ts:920-941`: `deriveNegativeScenarios(ir, flow, options)` calls `walkPath(flow, opts.branchSelections)` once, then visits the command nodes of that single walk.
- `:138-147` (`resolveOptions`): `branchSelections` defaults to `{}`.
- `:460-471` (`selectBranch`): with no selection a branch moment takes `branches[0]`.
- The three callers pass no selection: `cli/src/commands/simulate.ts:264`, `:344` and `cli/src/commands/serve.ts:137`.

So the walk is the first arm of every branch moment. A command placed only in a later arm is never visited, and none of its preconditions yields a scenario. Nothing reports the gap: the manifest looks complete.

This is a general limit, not one model's artefact. Refusals live on exactly the commands that alternative arms issue: "decline", "cancel", "fail", "expire" all carry a "must be pending" precondition, and the arm that issues them is by definition not the first (happy) arm. TicketWave shows it with no change to its spec:

| Flow | Command only in a later arm | Precondition | Negative scenario today |
|---|---|---|---|
| `general-admission-purchase` (`Payment processing`, arm `declined`) | `FailPayment` | `paymentPending` | none |
| `ticket-transfer` (`Transfer resolution`, arm `declined`) | `DeclineTransfer` | `transferPending` | none |
| `ticket-transfer` (arm `expired`) | `CancelTransfer` | `transferPending` | none |

The committed `examples/ticketwave/facet/` has `…-neg-ConfirmPayment-paymentPending` (first arm) and no `…-neg-FailPayment-paymentPending` (second arm), though `FailPayment` declares the same kind of precondition.

Smallest reproduction (TicketWave idiom, verified with `moment simulate --all` 0.8.0): a flow `seat-request`, `RequestHold` then `SeatsHeld`, then `Availability decision [branch]` with `when seats-available` (`CreateCart`) and `when sold-out` (`presale: JoinWaitlist`, which has `precondition notAlreadyOnWaitlist`). Derived: the happy path, the `sold-out` path, and negatives for `RequestHold` only. `JoinWaitlist.notAlreadyOnWaitlist` is declared in the model and reached by nothing.

## Decision

### D1. Derive over every path

`deriveNegativeScenarios(ir, flow)` with no `branchSelections` derives in two steps:

1. **The first-arm path**, exactly as today: the same walk, the same scenarios, the same ids, in the same order.
2. **Every other path**, in the order `generateAllScenarios` enumerates them (`enumerateBranchCombinations`, the enumeration that already truncates at terminals and never expands unreachable branch points). For each placed command on that path and each applicable precondition (cause rules of ADR-040 D2 unchanged), the scenario is derived only when its **(command, precondition, cause)** is not yet covered by an earlier scenario of the flow. It is built by the existing `buildNegativeScenario`: the nodes up to and including the command, then the `SimFailure` event. Its `activeBranches` already declare the arms along that prefix (the function restricts the walk's activations to the moments the prefix reaches), which is what lets a replay harness reproduce the route.

### D2. An explicit selection keeps today's meaning

When the caller passes `branchSelections`, only that path is walked, as today. The API stays: a caller that wants one path still gets one.

### D3. Identity, label, kind

Unchanged. `kind: 'negative'`; `scenarioLabel`, `description`, `given`, `when`, `then`, the failure event type `SimFailure.<Command>.PreconditionViolation` and the id pattern `<scenarioId>-neg-<Command>-<precondition>` are as today. A collision of ids (same command and precondition, different cause) takes today's `-<path index>` suffix, the index being that of the node in its own path.

### D4. Why the coverage key is the triple and not the placement

One negative per **(command, precondition, cause)** per flow is what the model states: a refusal is a property of the command. A command placed in five arms is one refusal. The first path that reaches it supplies the prefix. This keeps the main-path behaviour byte-identical and bounds the extra scenarios by (commands x preconditions), whatever the number of paths.

## Consequences

- Every declared precondition of a placed command is reached by a negative scenario, wherever the command is placed. "Every refusal is reached" becomes checkable from the manifest.
- **Contract (Moment to Facet): none.** Scenario shape, `kind` values and manifest fields are unchanged; there are more `kind: negative` entries. Facet already evaluates negatives whose `activeBranches` are non-empty (the negatives of `payment-settlement` today). Verified: the new negative for `seat-request` (`JoinWaitlist.notAlreadyOnWaitlist`, arm `sold-out`) passes Facet's suite, 9 of 9 assertions, on Facet main f7a4987.
- Output grows. Measured with the proposed algorithm on today's models (distinct triples not covered by the first-arm walk, per flow):

| Model | Negatives now | Added |
|---|---|---|
| TicketWave (4 flows) | 36 | 3 (`FailPayment.paymentPending`, `DeclineTransfer.transferPending`, `CancelTransfer.transferPending`) |
| SAMMI firebase (8 flows) | 25 | 1 (`RecordSessionLoss.WasConnected`, T7: placed only in the `SessionRevoked` arm) |

- Cost: each derived path is walked once more (bounded by the path count `generateAllScenarios` already pays).
- Risk: a flow with very many arms derives more scenarios than before; the coverage key keeps the growth linear in the model, not in the paths.

## Migration

**Not breaking for a model; breaking for a golden file.** No spec changes, no IR change. A model with no command only in a later arm derives byte-identical output. SAMMI: every existing file byte-identical; one scenario added (`RecordSessionLoss.WasConnected`). TicketWave gains 3 files and 3 manifest rows; its committed `examples/ticketwave/facet/` is regenerated in the same commit. Anything that pins the exact count of `negative` scenarios (a CI count, a README table) updates.

Compatibility proof, recorded before the change from `origin/main`: for every model above, the old build's scenario set must be a **subset, id for id and byte for byte,** of the new build's; the new build adds exactly the table's scenarios and nothing else.

## Rejected alternatives

1. **One negative per placement per path.** The same command in many arms and paths repeats an identical refusal: it adds scenarios with no new information, and every path combination would multiply them.
2. **Tell authors to place the command on the main path.** Alternatives exist because the command is not on the main path. Copying a command into the main path to get a derived refusal changes the flow's meaning to feed the tool.
3. **A flag (`--negatives=all`).** The scenario set would depend on an invocation the manifest does not record; a consumer could not tell a complete set from a first-arm set. The default must be the truthful one.
4. **Derive negatives from the contexts alone, independent of flows.** A negative scenario is a flow prefix plus a refusal; Facet replays a path. A flow-less negative has no path to replay.
5. **Derive only through `--all` selection of failure scenarios.** The arms that carry the command are not all failures (ADR-043); the criterion would hide the same commands again.

## Enforcement and tests (test-first)

Written first, each failing for the right reason on `origin/main`:

| Spec | Fails before because | Proves after |
|---|---|---|
| `derive/engine/__tests__/simulation-adr042.spec.ts`: command only in the second arm | `deriveNegativeScenarios` returns no scenario for it | one `negative` scenario per precondition, `activeBranches` declares the arm, `expectedPath` ends at the command |
| same: command in the first arm and again in a later arm | (passes) | the later placement adds nothing: coverage key is the triple |
| same: same command, two causes, only one in the first arm | the second cause's pair is missing | both present, ids collision-free |
| same: explicit `branchSelections` | (passes) | exactly today's single-path result (D2) |
| same: first-arm negatives of a branched flow | (passes) | identical to the baseline, same order |
| `cli/src/commands/simulate.test.ts`: `--all` on the ticketwave fixture | no `neg-JoinWaitlist-…` entry | entry present, `kind: negative`, `isNegative: true` |
| Facet suite over the regenerated `examples/ticketwave/facet/` | n/a | all scenarios pass, including the 3 new ones |
| Golden compat (as in ADR-041's "How backward compatibility will be proven", items 1 to 4) | n/a | old set is a subset of the new, byte for byte |
| Defect re-introduction | n/a | with D1 step 2 removed the arm specs fail again; a compat test that cannot fail proves nothing |

**Fixture added (in `examples/ticketwave/spec/ticketwave.moment`, per ADR-041's ruling that examples live in ticketwave itself):**

```
flow "seat-request"
  description "A customer asks for seats. With seats in the pool the customer gets a hold; with the tier sold out the customer joins the waitlist."

  lane inventory "Inventory" [Core]
  lane presale "Presale" [Supporting]
  lane checkout "Checkout" [Core]

  moment "Seat request"
    inventory: RequestHold
    inventory: SeatsHeld

  moment "Availability decision" [branch]
    when seats-available
      checkout: CreateCart
        triggered-by SeatsHeld
      checkout: CartCreated
    when sold-out
      presale: JoinWaitlist
      presale: WaitlistJoined [outcome]   // [outcome] from ADR-043; [terminal] reproduces F-1 on 0.8.0 unchanged
```

Expected negatives after: `RequestHold` x 2 (as today) and `JoinWaitlist-notAlreadyOnWaitlist` (new). The fixture was run on 0.8.0 with `[terminal]`: the new negative is absent there and passes Facet when added by the proposed algorithm.

### Reachability sweep before any "done" claim

For every placed command in every flow of TicketWave and SAMMI: list its preconditions and report any (command, precondition, cause) that no derived negative scenario reaches. The expected report is empty.
