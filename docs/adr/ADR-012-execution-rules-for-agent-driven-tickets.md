# ADR-012: Execution Rules for Agent-Driven Tickets

Migrated from Confluence page 13500424 (version 4, last updated 2026-03-10), https://winnovation.atlassian.net/wiki/spaces/MMMNT/pages/13500424. The Confluence space is private; this file is now the record.

- **Status:** Accepted
- **Date:** March 9, 2026
- **Deciders:** listenrightmeow, Claude (DDD Coaching Project)
- **Tags:** execution, agent, jira, tickets, closed-boundary, failure-protocol
- **Complements:** [ADR-009](ADR-009-ci-testing-strategy.md) (CI & Testing Strategy), [ADR-010](ADR-010-quality-gates-enforcement.md) (Quality Gates & Enforcement)

## Context

The Moment project uses AI agents (Claude Code) as the primary implementation workforce. Agents operate statelessly — each session starts with zero context about what was built, what decisions were made, or what conventions were established in prior sessions.

[ADR-009](ADR-009-ci-testing-strategy.md) defines the CI pipeline. [ADR-010](ADR-010-quality-gates-enforcement.md) defines what blocks a merge. Neither addresses the operational rules for how an agent executes a work ticket: what it reads before starting, what it does when it encounters ambiguity, what it does when it finishes, and — critically — what it does NOT do when the work exceeds its defined scope.

This ADR establishes the global execution rules that every implementation and specification ticket references. It is the first artifact an executing agent reads at session start. It is linked on every ticket as a governing ADR.

### The Problem This Solves

Without global execution rules, each ticket must independently specify behavioral constraints. This leads to:

- Inconsistency: Ticket A says "create stubs for missing dependencies." Ticket B says "block if dependencies are missing." The agent follows whichever ticket it's on.

- Drift: Agents make undocumented decisions during implementation — a function signature here, an interface shape there — that become invisible contracts downstream consumers depend on.

- Silent failure: An agent completes a ticket without verifying exit criteria. The next agent discovers the gap and either improvises (compounding the problem) or blocks (losing time).

- Scope creep: An agent encounters a gap and "helpfully" fills it, creating code that was never specified, reviewed, or tested against a behavioral contract.

The global execution rules make these failure modes structurally impossible by defining a single behavioral contract that applies to every ticket uniformly.

## Decision

### 1. Session Start Protocol

Every agent session begins with the same three steps, in order:

Step 1 — Read this ADR. This page is linked on every execution ticket. The agent reads it in full before doing anything else.

Step 2 — Read the ticket. The agent reads the full Jira ticket description, including: prerequisites, governing ADRs, behavioral specification reference, scope, and exit criteria.

Step 3 — Verify prerequisites. The agent executes every prerequisite verification check listed on the ticket. If any check fails, the agent transitions the ticket to Blocked (see §4) and stops. No implementation begins until all prerequisites pass.

There is no Step 0. The agent does not inspect the repository, read code, or make assumptions about project state before completing Steps 1–3.

### 2. The Closed Boundary Rule

Every ticket defines a Scope — Closed Boundary section. This section contains two lists:

- Delivers: The complete, exhaustive set of artifacts this ticket creates or modifies.

- Touches (read-only): The complete set of artifacts this ticket reads but does not modify.

These lists are a closed boundary. The union of "Delivers" and "Touches" is the complete set of files, modules, packages, interfaces, configurations, and artifacts the agent interacts with during execution.

If the agent needs to interact with anything not in these lists, the ticket is missing a requirement.

#### What the agent MUST NOT do when encountering a gap:

| Prohibited Action                        | Why It's Prohibited                                                                                        |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Create a stub function                   | A stub's signature is an unreviewed API design decision                                                    |
| Create a placeholder file                | A placeholder's existence implies a contract to downstream consumers                                       |
| Create a TODO comment                    | TODOs are invisible to Jira. The gap leaves the system of record.                                          |
| Create a mock interface                  | A mock's shape is an unreviewed type contract                                                              |
| Create an empty module                   | An empty module's export structure is an unreviewed package design decision                                |
| Import from an unspecified package       | The import establishes an undocumented cross-package dependency                                            |
| Define a type not in the behavioral spec | The type's shape is an unreviewed domain model decision                                                    |
| Use any to bypass a missing type         | any hides a specification gap behind a type erasure                                                        |
| Add a dependency not in the ticket scope | The dependency adds supply chain cost without review ([ADR-010](ADR-010-quality-gates-enforcement.md) §10) |
| Make a "reasonable assumption"           | Reasonable assumptions are unreviewed design decisions with no audit trail                                 |

#### What the agent MUST do when encountering a gap:

- Stop immediately. Do not write any more code.

- Transition the ticket to Blocked (see §4).

- Add a Jira comment with:

- What the agent was implementing when the gap was discovered

- What specific artifact, interface, type, or behavior is needed but not in scope

- Where the agent believes the gap should be resolved: which behavioral specification section, which ADR, or which upstream ticket

- If applicable, 2–3 options for how the gap could be resolved (but NOT a recommendation — the decision is not the agent's to make)

- Commit partial work to the existing branch. If no code has been written, no commit is needed. If code has been written and is in a valid state (builds, existing tests pass), commit to the feature/ branch the agent was already working on and reference the commit SHA in the Jira comment. The branch stays as-is — Jira ticket status is the authoritative signal for whether work is blocked, not branch naming.

### 3. Code Requirements

These requirements apply to all code written under any execution ticket.

#### 3a. No Code Without Specification

Every public function, type, interface, and export must trace to a behavioral specification assertion. Code that implements behavior not defined in the spec is out of scope — even if the behavior "obviously" should exist.

The behavioral specification is the source of truth for what the code does. The ADRs are the source of truth for how the code is structured. The ticket scope is the source of truth for what the agent touches. If these three authorities are silent on something, the something does not get built.

#### 3b. Test-First From Specification

Implementation follows a strict red-green sequence:

- Read the behavioral specification for the contract being implemented.

- Write the test that asserts the specified behavior. The test MUST fail (red phase). If the test passes before implementation, either the test is wrong or the behavior already exists — investigate before proceeding.

- Write the implementation that makes the test pass (green phase).

- Verify that no other tests broke.

Tests are not an afterthought or a coverage-padding exercise. Tests are the executable form of the behavioral specification. Writing the test IS reading the spec.

#### 3c. No Implicit Contracts

Every cross-package dependency must be through a documented, specified interface.

| If you need to...                  | The authority is...                                                                                                            |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Import from another @mmmnt package | The behavioral spec for that package defines the public API                                                                    |
| Define a shared type               | The behavioral spec for the owning package defines the type shape                                                              |
| Add a configuration option         | [ADR-009](ADR-009-ci-testing-strategy.md) or [ADR-010](ADR-010-quality-gates-enforcement.md) defines configuration conventions |
| Add an environment variable        | [ADR-011](ADR-011-environment-variable-secrets-manifest.md) defines the environment variable manifest                          |
| Change a file path convention      | [ADR-009](ADR-009-ci-testing-strategy.md) defines the monorepo structure                                                       |

If the authority is silent, the agent does not improvise. It blocks.

#### 3d. Code Style and Structure

- All code follows the lint rules defined in [ADR-010](ADR-010-quality-gates-enforcement.md) §3–4.

- All code follows the TypeScript configuration defined in [ADR-009](ADR-009-ci-testing-strategy.md) §3.

- No any types in public API surfaces. Internal any requires a code comment explaining why it's necessary and a corresponding test covering the untyped path.

- No eslint-disable comments. No @ts-ignore. No v8 ignore. If the tool says the code has a problem, the code has a problem.

- Functions respect the cyclomatic complexity ceiling of 10 ([ADR-010](ADR-010-quality-gates-enforcement.md) §10).

### 4. Failure Protocol — Jira State Transitions

All failure handling happens through Jira ticket transitions. There is no other failure reporting mechanism. The agent does not rely on session output, chat messages, log files, or any other channel to communicate failure.

#### State Transition Table

| Current State | Event                          | New State   | Required Comment                                                             |
| ------------- | ------------------------------ | ----------- | ---------------------------------------------------------------------------- |
| To Do         | Agent picks up ticket          | In Progress | "Session started. Prerequisites verified: [pass/fail summary]."              |
| In Progress   | All exit criteria pass         | Done        | "All exit criteria verified. Commit: [SHA]. Verification output: [summary]." |
| In Progress   | Prerequisite fails post-start  | Blocked     | "Prerequisite [ID] failed: [what was observed vs. expected]."                |
| In Progress   | Scope gap discovered           | Blocked     | Per §2 — what's needed, what's missing, where to resolve.                    |
| In Progress   | ADR silent on needed decision  | Blocked     | "ADR-[NNN] does not address [question]. Proposed options: [...]."            |
| In Progress   | Spec silent on needed behavior | Blocked     | "Spec §[N.N] does not define [behavior]. Needed for [context]."              |
| In Progress   | Cannot make tests pass         | Blocked     | "Test [name] fails. Attempted: [approaches]. Suspect: [hypothesis]."         |
| Blocked       | Gap resolved (by human)        | To Do       | Human unblocks with resolution comment. Agent re-enters from Step 1.         |

#### Key Rules

- Blocked is not failure. Blocked is the system working correctly. It means the agent identified a gap that needs human resolution. This is a feature, not a bug.

- There is no "In Progress with issues" state. Work either completes fully or blocks. There is no middle ground.

- Re-entry after unblock always starts from Step 1 (§1). The agent re-reads this ADR, re-reads the ticket (which may have been amended during block resolution), and re-verifies prerequisites. It does not assume the codebase is in the same state as when it blocked.

- Done is final. Once a ticket transitions to Done, no further changes are made under that ticket. If the work needs revision, a new ticket is created.

### 5. Exit Criteria Verification

Exit criteria are the proof that the ticket's work is complete. Every exit criterion must be machine-verifiable — a command that returns pass/fail, a file that exists or doesn't, a test that passes or fails.

#### Verification Protocol

- The agent runs every exit criterion check listed on the ticket.

- If ALL checks pass, the agent transitions to Done with a comment containing the verification output.

- If ANY check fails, the agent transitions to Blocked with a comment identifying which criterion failed and what was observed.

- The agent does not "fix up" failing exit criteria after the fact. If an exit criterion reveals a problem, the ticket blocks. The problem may indicate a scope gap, a spec gap, or a genuine defect — the human decides which.

#### Exit Criteria Categories

Tickets define exit criteria in three categories:

Structural (EXIT-S): File existence, build success, configuration correctness. These verify the artifacts exist in the right shape.

Behavioral (EXIT-B): Test results, coverage thresholds, spec assertion coverage. These verify the artifacts do the right thing.

Contract (EXIT-C): Public API surface matches spec, no any types, downstream prerequisites are satisfiable. These verify the artifacts are consumable by the next ticket.

### 6. Testing Requirements

Testing requirements inherit from [ADR-009](ADR-009-ci-testing-strategy.md) (test strategy) and [ADR-010](ADR-010-quality-gates-enforcement.md) (coverage thresholds). This section adds the execution-level rules.

#### 6a. Specification-Driven Test Authoring

Every test traces to a behavioral specification assertion. The mapping is 1:1: one spec assertion = one test case. The agent does not write tests that don't trace to a spec assertion, and does not skip spec assertions that should have tests.

If a spec assertion is ambiguous or untestable, the ticket blocks. The spec gets amended. Then the agent continues.

#### 6b. Test File Organization

Test files follow the structure defined in the behavioral specification's section headings:

```
src/__tests__/
├── constructs/       → Spec §: Construct Parsing
├── validation/       → Spec §: Validation Rules
├── composition/      → Spec §: Composition Scenarios
├── edge-cases/       → Spec §: Edge Cases
└── manifest/         → Spec §: Manifest Validation
```

Each test file is named for the spec assertion group it validates.

#### 6c. No Test Utilities Outside Scope

If a test requires a utility function (a builder, a factory, a fixture loader), that utility must be within the ticket's scope. If it's not, the ticket blocks — the utility needs to be specified and delivered in its own ticket or added to this ticket's scope.

This prevents the "test helpers that encode design decisions" problem. A test builder that constructs AST nodes is defining the AST structure — that's a spec-level decision, not a test-level convenience.

### 7. Branch and Commit Requirements

#### 7a. Branch Naming

Two branch prefixes. No exceptions.

| Issue Type   | Branch Prefix | Example                          |
| ------------ | ------------- | -------------------------------- |
| Story / Task | feature/      | feature/MMNT-8-scaffold-packages |
| Bug          | fix/          | fix/MMNT-15-tsconfig-resolution  |

Branch names use the Jira ticket key and a short kebab-case description. If the GitHub for Jira integration is connected, branches can be created directly from the Jira ticket UI.

There is no wip/ prefix. If an agent blocks mid-implementation (§2, §4), it commits to the existing feature/ branch and transitions the Jira ticket to Blocked. The Jira ticket status is the authoritative signal for whether work is blocked — not the branch name.

#### 7b. Commit Messages

All commits follow Conventional Commits ([ADR-010](ADR-010-quality-gates-enforcement.md) §7). The scope is the ticket key:

```
feat(MMNT-8): scaffold monorepo with Turborepo and pnpm workspaces
test(MMNT-8): add failing construct parsing tests from behavioral spec
```

#### 7c. One Ticket, One PR

Each ticket produces exactly one PR. If a ticket is too large for one PR, the ticket is scoped wrong — it should be decomposed into multiple tickets.

### 8. Jira Issue Link Policy

#### 8a. No Blocks Issue Links

The project does not use Jira Blocks / is blocked by issue links. All dependency information is tracked exclusively in the ticket description's Prerequisites section as structured text:

```
Predecessor: MMNT-9 — Configure shared tooling [HARD DEPENDENCY]
  Verify: `pnpm turbo build` exits 0
```

Rationale: Dependencies encoded in ticket descriptions are already consumed by the agent at session start (§1 Step 2). Adding Jira issue links creates a second source of truth that must be manually synchronized on every ticket creation pass. This synchronization is an O(n) human cost per milestone that does not scale — each new milestone's ticket batch would require a separate linking pass, and link drift (descriptions say one thing, links say another) introduces false signals on the board.

The agent never queries the Jira link API to resolve dependencies — it reads the description. The description is the single source of truth. Jira links would be a visual convenience for board views with no execution consumer.

Sequence within an epic is captured by epic position (ticket ordering). Agents pick up the next ticket in epic order. This is lighter than link management and doesn't create false blocking signals.

#### 8b. Remote Links — ADR and Specification References

Each governing ADR and behavioral specification referenced in the ticket description is also linked as a remote link to its Confluence page. ADR-012 is always the first remote link on every ticket.

### 9. Relationship to Other ADRs

This ADR does not replace [ADR-009](ADR-009-ci-testing-strategy.md) or [ADR-010](ADR-010-quality-gates-enforcement.md). It complements them:

| Concern                                        | Authority                                                   |
| ---------------------------------------------- | ----------------------------------------------------------- |
| What the CI pipeline does                      | [ADR-009](ADR-009-ci-testing-strategy.md)                   |
| What blocks a merge                            | [ADR-010](ADR-010-quality-gates-enforcement.md)             |
| What environment variables exist               | [ADR-011](ADR-011-environment-variable-secrets-manifest.md) |
| How an agent behaves within a ticket           | ADR-012 (this ADR)                                          |
| What the code should do (behavioral contracts) | Behavioral Specifications (per-package, in Confluence)      |
| What the code structure looks like             | Architecture Palette                                        |
| What the syntax rules are                      | Grammar Reference                                           |

## Consequences

What becomes easier:

- Every agent session starts from the same baseline. No session-specific instructions. No "remember to..." preambles. The ADR is the instruction.

- Gaps are surfaced immediately and resolved at the right level (spec, ADR, or ticket scope). No invisible debt accumulates.

- Jira board reflects reality. If a ticket is In Progress, work is happening. If it's Blocked, a specific gap needs resolution. If it's Done, all exit criteria passed.

- New agents (or new AI models) can be onboarded by pointing them at this ADR. The rules are model-agnostic.

What becomes harder:

- Ticket authoring requires exhaustive scope definition. Every file, every module, every dependency must be enumerated. This is significant upfront investment — but the alternative is agents improvising at implementation time, which is more expensive to fix.

- More tickets will block. This is by design. A high block rate means the specifications and ticket scoping are catching gaps early. A low block rate after the first few tickets means the specifications are maturing.

- No "just make it work" shortcuts. The agent cannot paper over a gap with a stub or assumption. This means human involvement is required for every gap, which is slower in the moment but prevents compounding architectural drift.

What to watch:

- Block rate by ticket. If the same category of gap causes repeated blocks, the specification template needs improvement.

- Time-to-unblock. If blocked tickets sit for days, the feedback loop is too slow. Target: unblock within the same working day.

- Exit criteria false positives. If tickets pass exit criteria but downstream tickets discover problems, the exit criteria need tightening.

## Alternatives Considered

1. Embed rules in each ticket description (rejected): Creates maintenance burden — rules change in one place but must be updated across all tickets. A single ADR is the single source of truth.

2. Allow stubs with mandatory follow-up tickets (rejected): Stubs are unreviewed design decisions. A stub's function signature, return type, and parameter list are all API commitments made without specification. Follow-up tickets to "replace stubs" inevitably inherit the stub's contract rather than questioning it.

3. Allow agents to make "minor" decisions locally with documentation (rejected): There is no reliable way to distinguish "minor" from "major" decisions at implementation time. A type name is minor until three packages import it. A default parameter value is minor until it becomes a behavioral contract. All decisions go through specification or ADR.

4. Use a README in the repository instead of a Confluence ADR (rejected): The system of record is Confluence. Jira tickets link to Confluence pages. The execution rules must live where the rest of the architectural decisions live.

5. Softer failure protocol — warn and continue (rejected): Warnings get lost between stateless sessions. If an agent notes a concern but continues, the next agent has no visibility into that concern. The only reliable signal is a Jira state transition.

6. wip/ branch prefix for blocked work (rejected): Originally specified in v2. Removed because Jira ticket status is the authoritative signal for whether work is blocked, not branch naming conventions. An agent blocks mid-work on a feature/ branch the same way it blocks before starting: Jira transition + structured comment. Branch prefixes indicate the type of change (feature vs. fix), not the state of the work.

7. Blocks issue links (rejected — evolved through two iterations):

- v2: Blocks links for all sequential tickets within an epic. Rejected because sequence is not dependency — recommended ordering is captured by epic position.

- v3: Blocks links reserved for hard dependencies only (predecessor output consumed by successor scope). Rejected in v4 because dependencies are already encoded in ticket description text and consumed by the agent at session start (§1 Step 2). Jira links created a second source of truth requiring manual synchronization on every ticket creation pass — an O(n) human cost per milestone that does not scale with users. The agent never queries the Jira link API; description text is the single authoritative source.

\<!-- END_DOCUMENT -->
