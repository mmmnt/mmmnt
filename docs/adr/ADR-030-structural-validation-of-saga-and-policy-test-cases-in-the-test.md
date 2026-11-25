# ADR-030: Structural Validation of Saga and Policy Test Cases in the Test Harness

Migrated from Confluence page 48660481 (version 1, last updated 2026-04-04), https://winnovation.atlassian.net/wiki/spaces/MMMNT/pages/48660481. The Confluence space is private; this file is now the record.

- **Status:** Proposed
- **Version:** 1.0
- **Date:** 2026-04-04
- **Author:** Claude (AI agent session)
- **Scope:** @mmmnt/harness, @mmmnt/derive
- **Relates to:** [ADR-023](ADR-023-simulation-output-contracts-topology-emission-and-trace-format.md) (Simulation Output Contracts), [ADR-029](ADR-029-moment-m6-output-changes-facet-integration-impact.md) (M6 Output Changes)
- **Consumers:** Facet, moment CLI (moment test)

## Context

The @mmmnt/derive package's DerivationEngine generates three categories of test cases when building a TestSuiteTopology:

- Crossing/payload test cases — one per moment with a crosses-to connection. assertionType: 'payload'. These validate cross-context schema contracts.

- Saga test cases — per saga: init, N-1 state transitions, and compensation. assertionType: 'saga'. These validate saga lifecycle correctness.

- Policy chain test cases — per policy with a chainsTo target. assertionType: 'policy-chain'. These validate reactive policy wiring.

The @mmmnt/harness TestRunner evaluates all three categories through a single code path (evaluateTestCase) that checks whether the test case's momentId exists in flow.moments. Saga and policy test cases use synthetic moment IDs (e.g., saga-SeatHoldLifecycle-initiated, policy-ReplenishOnHoldRelease) that do not correspond to any flow moment — they are derived from context-level declarations, not temporal flow entries.

Result: Every saga and policy test case fails unconditionally. On the vet-clinic fixture (the project's own reference spec), 12 of 29 tests fail. On the TicketWave consumer example (7 contexts, 4 flows), 100 of 152 tests fail. In both cases, 0 failures come from actual moment/crossing tests — all 100% of failures are saga + policy test cases.

This means moment test reports a failing result on every valid specification that contains sagas or policies, which is misleading for consumers.

## Decision

Add structural validation paths for saga and policy test cases in TestRunner, scoped to what Moment can verify from the IR alone. Deep behavioral validation (saga timeout enforcement, compensation execution, policy side-effect verification) is Facet's responsibility and out of scope.

### Boundary Principle

Moment validates structural correctness — does the specification's wiring make sense? Facet validates behavioral correctness — does the running implementation honor the specification?

| Validation                                   | Owner  | Example                                                 |
| -------------------------------------------- | ------ | ------------------------------------------------------- |
| Saga trigger event exists in IR              | Moment | SeatsHeld is a defined event                            |
| Saga states form a non-empty chain           | Moment | Held -> Converting -> Converted -> Expired has 4 states |
| Saga compensation string is non-empty        | Moment | "Release held seats..." is defined                      |
| Saga timeout is defined                      | Moment | holdExpiry is present                                   |
| Saga transitions execute in order at runtime | Facet  | Out of scope for Moment                                 |
| Saga compensation fires on timeout           | Facet  | Out of scope for Moment                                 |
| Policy trigger event exists in IR            | Moment | HoldReleased is a defined event                         |
| Policy chainsTo command exists in IR         | Moment | AdjustPoolCapacity is a defined command                 |
| Policy trigger→action actually fires         | Facet  | Out of scope for Moment                                 |

## Implementation Plan

### Phase 1: TestRunner evaluation paths (packages/harness)

Modify TestRunner.evaluateTestCase() to dispatch on assertionType:

```
evaluateTestCase(testCase, flow, ir):
  if testCase.momentId starts with "saga-":
    return evaluateSagaTestCase(testCase, ir)
  if testCase.momentId starts with "policy-":
    return evaluatePolicyTestCase(testCase, ir)
  // existing moment/crossing logic
  return evaluateMomentTestCase(testCase, flow, ir)
```

#### evaluateSagaTestCase(testCase, ir)

For init cases (saga-{name}-initiated):

- Extract saga name from momentId

- Find the saga definition in IR contexts

- Verify the trigger event exists as a defined event in the owning context's aggregates

For transition cases (saga-{name}-{fromState}-to-{toState}):

- Verify both fromState and toState exist in the saga's states array

- Verify they are adjacent (sequential in the chain)

For compensation cases (saga-{name}-compensation):

- Verify the saga's compensation string is non-empty

- Verify the saga's timeout is defined

#### evaluatePolicyTestCase(testCase, ir)

- Extract policy name from momentId

- Find the policy definition in IR contexts

- Verify the trigger event exists as a defined event in any context's aggregates

- Verify the chainsTo command exists as a defined command in any context's aggregates

### Phase 2: Test coverage (packages/harness)

Add test cases to harness-api.integration.test.ts:

- Saga init: trigger event exists → pass

- Saga init: trigger event missing → fail

- Saga transition: valid adjacent states → pass

- Saga transition: non-adjacent states → fail

- Saga compensation: compensation defined → pass

- Policy chain: trigger + chainsTo both exist → pass

- Policy chain: chainsTo command missing → fail

- Policy chain: trigger event missing → fail

### Phase 3: Invariant additions

- TE-03: Saga structural test cases validate trigger event existence, state adjacency, and compensation definition against the IR.

- TE-04: Policy chain test cases validate trigger event existence and chainsTo command existence against the IR.

### Phase 4: Verify with fixtures

- Vet-clinic fixture: 29/29 should pass (1 saga, 6 policies all structurally valid)

- TicketWave consumer: 152/152 should pass (2 sagas, all policies structurally valid)

- Ordering fixture: 2/2 continues to pass (no sagas/policies)

## Consequences

For moment test consumers:

- Valid specifications with structurally correct sagas/policies will report all-green

- Structurally invalid specifications (e.g., policy referencing a non-existent command) will report targeted failures with clear traceability

- No false positives: if it passes, the wiring is correct

- No false negatives: if the wiring is broken, it fails

For Facet:

- No change. Facet continues to own behavioral validation

- Facet can trust that any spec passing moment test has structurally sound saga/policy wiring

For @mmmnt/derive:

- No changes needed. The derived test cases already carry the correct assertionType and structural metadata

Packages affected:

- @mmmnt/harness — TestRunner evaluation logic (primary)

- @mmmnt/harness — integration tests (secondary)

Packages NOT affected:

- @mmmnt/derive — no changes

- @mmmnt/core — no changes

- @mmmnt/cli — no changes (already calls TestRunner)

## Alternatives Considered

### A. Skip saga/policy test cases entirely in TestRunner

Filter out test cases with assertionType !== 'payload' before evaluation. Simple but wasteful — the derive engine produces useful structural metadata that goes unvalidated. Consumers see passing tests but have no confidence the saga/policy wiring is sound.

Rejected: Loses structural validation that Moment is uniquely positioned to provide.

### B. Move saga/policy test generation to Facet

Remove deriveSagaTestCases and derivePolicyChainTestCases from the derive engine. Let Facet generate its own behavioral test cases.

Rejected: The structural test cases belong in Moment's domain. Facet shouldn't need to re-derive what Moment already knows. The derive engine is correct to produce them; the runner just needs to evaluate them.

### C. Full behavioral validation in Moment

Add runtime simulation of saga state machines and policy trigger chains.

Rejected: Crosses the domain boundary into Facet's responsibility. Moment validates the specification; Facet validates the implementation.

## Version History

| Version | Date       | Changes                                                                               |
| ------- | ---------- | ------------------------------------------------------------------------------------- |
| 1.0     | 2026-04-04 | Initial proposal. Structural validation for saga and policy test cases in TestRunner. |
