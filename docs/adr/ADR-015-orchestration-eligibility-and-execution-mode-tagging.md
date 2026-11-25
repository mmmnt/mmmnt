# ADR-015: Orchestration Eligibility and Execution Mode Tagging

Migrated from Confluence page 13598759 (version 1, last updated 2026-03-10), https://winnovation.atlassian.net/wiki/spaces/MMMNT/pages/13598759. The Confluence space is private; this file is now the record.

- **Status:** Proposed
- **Date:** March 10, 2026
- **Deciders:** listenrightmeow, Claude (DDD Coaching Project)
- **Tags:** orchestration, parallel, sequential, tagging, agent-teams, execution-mode
- **Complements:** [ADR-012](ADR-012-execution-rules-for-agent-driven-tickets.md) (Execution Rules for Agent-Driven Tickets)

## Context

[ADR-012](ADR-012-execution-rules-for-agent-driven-tickets.md) defines the behavioral contract for a single agent executing a single ticket. It is silent on a prerequisite question: which tickets can be dispatched concurrently?

The Moment project uses AI agents (Claude Code) as the primary implementation workforce. In early milestones, tickets are necessarily sequential — shared files, shared configuration surfaces, and foundational dependencies mean each ticket's output is the next ticket's input. As the project matures past infrastructure setup, the bounded context architecture creates natural isolation boundaries where multiple agents can work concurrently without violating [ADR-012](ADR-012-execution-rules-for-agent-driven-tickets.md)'s Closed Boundary Rule (§2).

Without a formal signal for execution mode, the ticket author carries implicit knowledge about which tickets are safe to parallelize. This knowledge is invisible on the Jira board, lost between planning sessions, and unverifiable by an orchestration system (human or automated).

### The Problem This Solves

- Invisible sequencing assumptions: Epic 1.1 is sequential because its tickets share package.json, turbo.json, and tsconfig.base.json. Epic 1.3 has parallel-eligible stories after 1.3.1 lands because they touch different CI workflow sections. This information exists in the ticket author's head, not on the board.

- No structural gate on parallelism: Without eligibility criteria, parallel dispatch is a judgment call with no audit trail. If two agents are dispatched concurrently and their file scopes overlap, the resulting merge conflicts and silent overwrites violate [ADR-012](ADR-012-execution-rules-for-agent-driven-tickets.md)'s guarantees.

- Orchestration tool readiness: Claude Code Agent Teams and similar orchestration tools need a machine-readable signal for which tickets can be assigned to concurrent teammates. A Jira label is the simplest contract that both humans and tools can consume.

- Planning visibility: When authoring future milestones, the ticket author needs a forcing function to evaluate parallelism at planning time — not at execution time when an agent is already running.

## Decision

### 1. Execution Mode Labels

Every epic and every story in the MMNT project carries exactly one execution mode label from the exec: namespace.

| Label           | Meaning                                                                                                                                   | Applied To                                                                                                       |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| exec:sequential | This ticket must complete before its successor begins. Dispatch one at a time in epic order.                                              | Epics whose stories share file scope; stories with overlapping "Delivers" lists.                                 |
| exec:parallel   | This ticket can execute concurrently with other exec:parallel siblings in the same epic, provided all shared prerequisites are satisfied. | Epics whose stories have disjoint file scopes after a common prerequisite; stories with zero "Delivers" overlap. |

Default assumption: An unlabeled ticket is treated as exec:sequential. However, all tickets SHOULD be explicitly labeled for board readability. Explicit labeling is a planning-time assertion that the author evaluated the ticket's orchestration eligibility.

### 2. Label Semantics at Each Level

Epic-level exec:parallel means: "After this epic's prerequisite chain is satisfied, the stories within it are candidates for concurrent dispatch." It does NOT mean all stories are parallel — it means the epic contains parallelizable work. The individual story labels govern actual dispatch.

Epic-level exec:sequential means: "Stories in this epic must execute in strict order. No concurrent dispatch is safe regardless of file scope analysis." This is the signal for shared-state epics like 1.1 (Repository Scaffolding) where every story modifies root-level configuration files.

Story-level exec:parallel means: "This story can run concurrently with other exec:parallel stories in the same epic that share its prerequisite set." Two stories are concurrent siblings if they share the same predecessor(s) and both carry exec:parallel.

Story-level exec:sequential means: "This story must complete before the next story in epic order begins." This is the default for tickets in a dependency chain.

### 3. Parallel Eligibility Checklist

A ticket may carry the exec:parallel label if and only if ALL of the following criteria are satisfied. This checklist is evaluated at planning time by the ticket author.

#### 3a. File-Scope Disjointness (Primary Rule)

The ticket's Delivers list ([ADR-012](ADR-012-execution-rules-for-agent-driven-tickets.md) §2) has zero intersection with the Delivers list of every other exec:parallel sibling in the same epic.

This is a mechanical check: take the union of file paths in each ticket's Delivers section and verify no path appears in more than one ticket. If a single file appears in two tickets' Delivers lists, those tickets cannot both carry exec:parallel.

Read-only overlap is acceptable. Two tickets may both list the same file in their Touches (read-only) section. The Closed Boundary Rule already guarantees read-only files are not modified.

Package-level heuristic: If two tickets deliver artifacts in different @mmmnt/\* packages and neither modifies root-level configuration files (package.json, turbo.json, tsconfig.base.json, .github/workflows/\*), they are structurally disjoint by construction. This is the common case for M3+ milestones where work maps 1:1 to bounded contexts.

#### 3b. No In-Flight Predecessor Dependency

Two exec:parallel siblings must not both depend on a predecessor that is still in-flight. If story A and story B both list "Predecessor: MMNT-X" and MMNT-X is in "In Progress" status, neither A nor B can be dispatched. Both wait until MMNT-X reaches "Done."

This is already enforced by [ADR-012](ADR-012-execution-rules-for-agent-driven-tickets.md) §1 Step 3 (prerequisite verification), but is restated here because it's the scheduling constraint an orchestrator must respect. [ADR-012](ADR-012-execution-rules-for-agent-driven-tickets.md) catches the violation at the agent level; this ADR catches it at the dispatch level.

#### 3c. No Shared Build Output Dependency

Two exec:parallel siblings must not produce build outputs that a third ticket consumes as a combined unit. For example: if ticket C's prerequisite is "packages @mmmnt/derive AND @mmmnt/generate both build successfully," then the tickets delivering those packages cannot be dispatched until both are independently complete, even if their file scopes are disjoint.

This is the "join point" problem. The tickets themselves are parallel-eligible, but their consumer creates an implicit synchronization point. The tickets still carry exec:parallel — the constraint is on the consumer ticket's prerequisite verification, not on the parallel siblings' labels.

#### 3d. No Root Configuration Mutation

If a ticket's Delivers list includes any root-level configuration file — package.json (root), turbo.json, tsconfig.base.json, pnpm-workspace.yaml, .npmrc, or any file in .github/workflows/ — it cannot carry exec:parallel unless no other ticket in the same epic modifies the same root file.

Root configuration files are the shared state of the monorepo. Concurrent modification of these files produces merge conflicts or silent last-write-wins overwrites, both of which violate [ADR-012](ADR-012-execution-rules-for-agent-driven-tickets.md)'s deterministic execution guarantee.

### 4. Applying Labels to Existing Epics

Based on the M1 Execution Plan Manifest and the eligibility checklist:

| Epic                                    | Label           | Rationale                                                                                                                                                                                  |
| --------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| MMNT-1 (1.1 — Repository Scaffolding)   | exec:sequential | All 4 stories modify root-level config files. §3d violation for any parallel pair.                                                                                                         |
| MMNT-2 (1.2 — Environment Provisioning) | exec:sequential | Human-only epic. Stories are sequential service provisioning steps.                                                                                                                        |
| MMNT-3 (1.3 — Quality Gates)            | exec:parallel   | After MMNT-13 (1.3.1 — build pipeline), stories 1.3.2/1.3.3/1.3.4 deliver to separate CI workflow job sections with disjoint file scope. 1.3.5–1.3.7 have independent prerequisite chains. |
| MMNT-4 (1.4 — Branch Protection)        | exec:sequential | Single-story epic. Sequential by construction.                                                                                                                                             |
| MMNT-5 (1.5 — Xray QMS Setup)           | exec:sequential | Human-only epic. Stories are sequential Xray provisioning steps.                                                                                                                           |

Story-level labels for MMNT-1 and MMNT-3 are applied as follows:

Epic 1.1 stories (all exec:sequential):

- MMNT-6: exec:sequential — first ticket, no predecessor

- MMNT-7: exec:sequential — depends on MMNT-6, modifies root package.json + turbo.json

- MMNT-8: exec:sequential — depends on MMNT-7, modifies root pnpm-workspace.yaml + turbo.json

- MMNT-9: exec:sequential — depends on MMNT-8, modifies root package.json + .editorconfig + multiple vitest.config.ts

Epic 1.3 stories (mixed):

- 1.3.1: exec:sequential — prerequisite for all others, creates .github/workflows/ci.yml

- 1.3.2: exec:parallel — Tier 1 checks (CI job section); disjoint from 1.3.3 and 1.3.4

- 1.3.3: exec:parallel — Security checks (CI job section); disjoint from 1.3.2 and 1.3.4

- 1.3.4: exec:parallel — Quality checks (CI job section); disjoint from 1.3.2 and 1.3.3

- 1.3.5: exec:sequential — Xray import; depends on 1.3.2 output

- 1.3.6: exec:sequential — Test reporters; depends on 1.3.1

- 1.3.7: exec:parallel — Pre-commit hooks; disjoint from CI workflow files

### 5. Planning-Time Workflow

When authoring tickets for a new epic or milestone:

- Write all tickets with [ADR-012](ADR-012-execution-rules-for-agent-driven-tickets.md) §2 Closed Boundary sections (Delivers + Touches lists). This is already required by [ADR-012](ADR-012-execution-rules-for-agent-driven-tickets.md).

- Build the file-scope matrix: for each pair of stories in the epic, check whether their Delivers lists intersect.

- Apply the eligibility checklist (§3a–3d) to every story pair with disjoint file scope.

- Label each story with exec:sequential or exec:parallel.

- Label the epic: exec:parallel if the epic contains at least one exec:parallel story; exec:sequential if all stories are sequential.

This evaluation happens once at planning time and is recorded in the label. It is not re-evaluated at execution time unless the ticket's scope changes (in which case the ticket is re-labeled as part of the scope amendment).

### 6. Relationship to ADR-012

This ADR does not modify [ADR-012](ADR-012-execution-rules-for-agent-driven-tickets.md). It operates at a higher level:

| Concern                                      | Authority                                                      |
| -------------------------------------------- | -------------------------------------------------------------- |
| How a single agent behaves within a ticket   | [ADR-012](ADR-012-execution-rules-for-agent-driven-tickets.md) |
| Which tickets can be dispatched concurrently | ADR-015 (this ADR)                                             |

An agent executing an exec:parallel ticket follows [ADR-012](ADR-012-execution-rules-for-agent-driven-tickets.md) identically to an agent executing an exec:sequential ticket. The label governs dispatch, not execution. Once dispatched, the agent reads [ADR-012](ADR-012-execution-rules-for-agent-driven-tickets.md), reads the ticket, verifies prerequisites, and proceeds — the same protocol regardless of execution mode.

The exec:parallel label is a pre-dispatch assertion that the structural conditions for safe concurrent execution have been verified. It is NOT a runtime coordination mechanism. Agents do not communicate with each other during execution. They rely on [ADR-012](ADR-012-execution-rules-for-agent-driven-tickets.md)'s Closed Boundary Rule to guarantee isolation.

## Consequences

What becomes easier:

- Execution planning is visible on the Jira board. Any stakeholder can filter by exec:parallel to see where concurrent dispatch is available.

- Future orchestration tools (Agent Teams or equivalent) have a machine-readable signal for dispatch decisions. No human interpretation required.

- Milestone-level parallelism budgets are calculable: count the exec:parallel stories per epic to estimate the maximum concurrency for that phase.

- Planning-time evaluation forces the ticket author to think about file scope overlap before tickets are dispatched — not after agents conflict.

What becomes harder:

- Every ticket requires an explicit execution mode evaluation. This adds ~2 minutes per ticket at planning time. The cost is front-loaded and fixed; the alternative (discovering conflicts at execution time) is unbounded.

- Scope changes to a ticket may invalidate its execution mode label and the labels of its siblings. Any scope amendment triggers a re-evaluation of the file-scope matrix for the affected epic.

What to watch:

- False parallel labels: If two exec:parallel tickets turn out to have overlapping file scope that wasn't caught at planning time, agents will produce merge conflicts. The mitigation is [ADR-012](ADR-012-execution-rules-for-agent-driven-tickets.md)'s Closed Boundary Rule — each agent independently verifies its file scope — but the conflict is discovered at PR time, not dispatch time.

- Over-conservative sequential labels: If tickets are labeled exec:sequential when they could be parallel, execution time increases unnecessarily. Review sequential labels during retrospectives to identify missed parallelism.

- Label drift: If a ticket's scope is amended after labeling but the label isn't updated, the board signal becomes unreliable. Include label re-evaluation in the scope amendment checklist.

## Alternatives Considered

1. Use Jira issue links (parallelizes with) instead of labels (rejected): Issue links express pairwise relationships. Labels express a property of the ticket itself. A ticket's execution mode is an intrinsic property — it's either safe to parallelize or it's not. Modeling this as pairwise links would require O(n²) links for n parallel siblings, which doesn't scale and obscures the signal.

2. Embed execution mode in the ticket description instead of a label (rejected): Labels are filterable, searchable, and visible on board views without opening the ticket. Description text requires reading each ticket individually. Labels are also consumable by automation and orchestration tools via the Jira API.

3. Define a richer topology (fan-out, join, human-only) (rejected for V1): Fan-out and join are implicit in the prerequisite structure — a fan-out is a ticket with multiple exec:parallel successors; a join is a ticket whose prerequisites include multiple exec:parallel predecessors. Adding explicit topology labels for V1 would add labeling overhead without a consumer that needs the signal. If orchestration tooling matures to need these signals, this ADR can be amended to add them. Human-only tagging is an orthogonal concern (it's about the executor type, not the execution mode) and is tracked separately.

4. No ADR — rely on judgment at dispatch time (rejected): Judgment at dispatch time has no audit trail, is not repeatable across sessions, and cannot be consumed by automation. The structural criteria in §3 are mechanical checks that should be evaluated once and recorded, not re-evaluated by each person who looks at the board.

\<!-- END_DOCUMENT -->
