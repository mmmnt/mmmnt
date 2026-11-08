# ADR-044: A topology connection declared inside a `when` arm carries that arm

- **Status:** Accepted (2026-11-07, founder)
- **Date:** 2026-11-07
- **Supersedes:** nothing. Extends ADR-031's topology contract (connections) additively. Pairs with FACET-ADR-020, which consumes the field.
- **Founder approval (2026-11-07, relayed):** fixing four limits found in the derivation. Standing rule: Moment evolves on its own merits; proven on TicketWave and SAMMI.
- **Release:** 0.9.0 (minor), with ADR-042 and ADR-043.
- **Numbering:** next free after ADR-043.
- **Source read:** `origin/main` bcbc0b3: `packages/core/src/parser/ast-to-ir.ts`, `packages/core/src/ir/connection-definition.ts`, `packages/derive/src/engine/topology-emitter.ts`, `packages/derive/src/engine/simulation-scenario-generator.ts`; Facet f7a4987 `types/index.ts`, `components/simulation/connectionHighlight.ts`, `store/sagas/policyChainEvaluator.ts`.

## Context

The arms of a `[branch]` moment are alternatives inside one moment. In the topology a moment is one frame, so every arm shares the frame id, and a connection (`triggered-by`, `triggers`, `crosses-to`) written inside an arm is emitted with `from: <the moment's frame id>` and nothing that says which arm it belongs to.

The IR knows. `ast-to-ir.ts:752-753` (`processNode(node, branchCondition)`) stamps `branchCondition` on every connection declared by a placement inside a `when` block, and `connection-definition.ts:18` documents it ("Set when the declaring node lives inside a `when` block"). Moment's own scenario derivation uses it: `simulation-scenario-generator.ts:693` (`isCausationConnectionFor`) links an event to its trigger only when `conn.branchCondition === node.outcome`. The scenario is therefore arm-correct.

The topology emitter drops it. `topology-emitter.ts:281-319` (`buildConnections`) copies `eventType`, `sourceNodeName`, `targetNodeName` and the crossing contract, never `branchCondition`, and the `TopologyConnection` interface (`:72-88`) has no such field. A consumer of the topology cannot tell the arms apart. Verified on the generated TicketWave topology: in `general-admission-purchase`, the connections `PaymentRiskEvaluated -> ConfirmPayment` (arm `approved`) and `PaymentRiskEvaluated -> FailPayment` (arm `declined`) are the same shape, both `from: moment-9-Payment-processing`.

Facet already looks for the field: `ConnectionDef.branchCondition?` ("Branch condition this edge belongs to", `types/index.ts:112-117`) and `isBranchActivatedConnection` (`connectionHighlight.ts:20-38`, "via `conn.branchCondition` when the topology declares it"). No Moment version declares it, so that code path never runs against Moment output.

Why it is a general limit, not one model's: any consumer that reasons about a connection (highlighting it, deciding whether a reaction was declared for this run, checking a crossing's contract) needs to know in which alternative it holds. Without it, two arms that link the same events differently are indistinguishable. TicketWave shows it with a flow of its own idiom, a payment that confirms and converts the hold (`payment-settlement`, ADR-043's fixture): arm `approved` declares `ConvertHoldToReservation triggered-by PaymentConfirmed`; arm `approved-after-rehold` places `RequestHold`, `SeatsHeld`, `PaymentConfirmed` and declares `ConvertHoldToReservation triggered-by SeatsHeld`. The two connections share one frame and the topology cannot say which arm declared which (FACET-ADR-020 shows the consequence).

## Decision

### D1. Emit the arm

`buildConnections` copies `conn.branchCondition` onto the emitted connection when it is defined, for every connection type that carries it in the IR (`triggered-by`, `triggers`, `crosses-to`, `returns-to`). `TopologyConnection` gains `readonly branchCondition?: string`. A connection declared outside a `when` block carries no such field: its JSON is unchanged.

The value is the arm's condition string exactly as it appears in the spec (`when approved-after-rehold` gives `"approved-after-rehold"`), which is also the key `branchPredicates[<frame>].routes` and `activeBranches[].condition` use, so a consumer joins them with no mapping.

### D2. Nothing else changes

No scenario, no event, no id, no `kind`. The field is an annotation of what the IR already states.

## Consequences

- A topology consumer can scope a connection to its arm. FACET-ADR-020 uses it to bind a declared policy reaction to the arm taken.
- **Contract (Moment to Facet): one new optional field on a topology connection**, already typed and read (optionally) by Facet. A Facet that ignores it behaves exactly as before; a Facet older than f7a4987 ignores unknown fields.
- Facet's edge highlighting (`isBranchActivatedConnection`) switches from "style matches the record" to "this edge's arm was taken" for connections that now carry the field; that is the behaviour its comment describes, and FACET-ADR-020 names the tests.
- Cost: a one-line copy and one interface field in `@mmmnt/derive`; topology snapshot tests change for models with connections in arms.
- Risk: consumers that diff topology JSON see the field appear. It is additive and named like the IR's.

## Migration

**Not breaking**; the topology JSON of models with connections declared inside arms changes (it gains the field), and nothing else does. Counted on Moment's own models (connections with a `branchCondition` / all connections): TicketWave 10 / 50 (3 flows), SAMMI 16 / 19 (7 flows). Models with no connection inside an arm derive byte-identical topology. The committed `examples/ticketwave/facet/topology-*.json` are regenerated in the same commit.

Compatibility proof: for each model above, the new topology equals the old one after deleting the `branchCondition` keys, byte for byte; every other derived artifact is byte-identical. Verified by reintroducing the defect: with the copy removed the new spec must fail.

## Rejected alternatives

1. **Let Facet infer the arm from node ids (`::br1`) and the route order.** A connection names its source and target nodes by name only, not by id, and a connection whose endpoints are placed in earlier moments has no `brN` of its own. The arm is a fact of the spec the IR already holds; recovering it by pattern is a guess that a renamed scope would break.
2. **Split a branch moment into one frame per arm in the topology.** It changes frame ids, the sequential-transition rule, `branchPredicates`, `activeBranches` semantics and every consumer's idea of a moment; far larger than the problem.
3. **Emit the field only for `triggered-by`.** Crossings and `triggers` declared in arms have the same ambiguity (their contracts are asserted per arm in derivation already: `derivation-engine.ts:246`); a partial field is a second rule to remember.
4. **A different name (`arm`, `route`).** `branchCondition` is the IR's name, Facet's typed name, and the key `routes` and `activeBranches` use.
5. **Do nothing in Moment and fix only Facet.** Facet has no source for the arm; the topology is the contract, and Moment owns it.

## Enforcement and tests (test-first)

| Spec | Fails before because | Proves after |
|---|---|---|
| `derive/engine/__tests__/topology-emitter.spec.ts` (extended): connection declared in a `when` arm | no `branchCondition` on the emitted connection | present, equal to the arm's condition |
| same: connection in the moment's main body of a `[branch]` moment, and in a plain moment | (passes) | no field; JSON unchanged |
| same: every connection type (`triggered-by`, `triggers`, `crosses-to`, `returns-to`) in an arm | field absent | present on each |
| same: the value joins `branchPredicates[<frame>].routes` and `activeBranches[].condition` | n/a | membership asserted |
| Golden compat (as ADR-042) | n/a | old topology equals new minus `branchCondition` keys; other artifacts byte-identical |
| Facet suite over the regenerated ticketwave fixture (FACET-ADR-020's tests) | n/a | passes, including `payment-settlement` |
| Defect re-introduction | n/a | copy removed: the emitter spec fails |

**Fixture added:** `flow "payment-settlement"` in `examples/ticketwave/spec/ticketwave.moment` (validated on 0.8.0; `[terminal]` there is `[outcome]` after ADR-043):

```
flow "payment-settlement"
  description "Payment confirmation converts the hold; after a re-hold the conversion follows the new hold instead."

  lane inventory "Inventory" [Core]
  lane checkout "Checkout" [Core]

  moment "Payment processing" [branch]
    when approved
      checkout: ConfirmPayment
      checkout: PaymentConfirmed
      inventory: ConvertHoldToReservation
        triggered-by PaymentConfirmed
      inventory: HoldConvertedToReservation [outcome]
    when approved-after-rehold
      inventory: RequestHold
      inventory: SeatsHeld
      checkout: PaymentConfirmed
      inventory: ConvertHoldToReservation
        triggered-by SeatsHeld
      inventory: HoldConvertedToReservation [outcome]
```

Expected topology: the two `ConvertHoldToReservation` connections have `branchCondition` `approved` and `approved-after-rehold`.

Build note (2026-11-07): each arm also places `inventory: HoldClosed` before the exit, as `general-admission-purchase` does, because the command records both events and V47 warns when only one is placed. The re-hold arm's `triggered-by SeatsHeld` draws one V43 warning (no policy declares that hop); it states the cause on purpose and the ticketwave parse test names it.

### Reachability sweep before any "done" claim

For every connection of every flow of TicketWave and SAMMI: its IR `branchCondition` equals its topology `branchCondition` (both absent counts as equal). Report any mismatch.
