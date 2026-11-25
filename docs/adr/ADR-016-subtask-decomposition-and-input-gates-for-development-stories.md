# ADR-016: Subtask Decomposition and Input Gates for Development Stories

Migrated from Confluence page 14548994 (version 7, last updated 2026-03-26), https://winnovation.atlassian.net/wiki/spaces/MMMNT/pages/14548994. The Confluence space is private; this file is now the record.

- **Status:** Accepted
- **Date:** March 10, 2026
- **Amended:** March 26, 2026 — v2: Subtask B Xray linking requirements (Sprint 2 findings)
- **Amended:** March 26, 2026 — v3: Subtask naming verification at session start (Sprint 2 CI gate failures)
- **Amended:** March 26, 2026 — v4: Subtask C mandatory post-CI traceability linking (Sprint 2 orphan recurrence)
- **Amended:** March 26, 2026 — v5: New Subtask D (Traceability Verification) + CI enforcement gate + restructured §9
- **Deciders:** listenrightmeow, Claude (DDD Coaching Project)
- **Tags:** execution, agent, jira, subtasks, input-gates, xray, qms, testing
- **Extends:** [ADR-012](ADR-012-execution-rules-for-agent-driven-tickets.md) (Execution Rules for Agent-Driven Tickets)
- **Operationalizes:** [ADR-014](ADR-014-qms-test-management-xray-integration.md) (QMS Test Management — Xray Integration)

## Amendment Log

| Version | Date           | Change                                                                                                                                                                                                                                                                 | Trigger                                                                                                                                                            |
| ------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| v1      | March 10, 2026 | Initial decision                                                                                                                                                                                                                                                       | [ADR-012](ADR-012-execution-rules-for-agent-driven-tickets.md)/[ADR-014](ADR-014-qms-test-management-xray-integration.md) gap analysis                             |
| v2      | March 26, 2026 | §2 Subtask B: Added mandatory Jira issue link step + CI Xray import dual-layer clarification + Test Set assignment procedure                                                                                                                                           | Sprint 2 audit — 229 orphaned Test issues discovered with zero parent links and zero Test Set assignments                                                          |
| v3      | March 26, 2026 | §2A: Added mandatory subtask naming verification step before any work begins. §6: Clarified naming is enforced at both ticket authoring time and agent session start.                                                                                                  | Sprint 2 CI gate failures — Epics 2.3/2.4 subtasks authored with wrong naming pattern, agent did not verify before proceeding                                      |
| v4      | March 26, 2026 | §2C.1: Added mandatory post-CI traceability step — agent must query for and link all CI-created Test issues to parent story before marking Subtask C as Done.                                                                                                          | Sprint 2 orphan recurrence — 23 new orphaned Test issues created by CI import for MMNT-213/215/216 after the initial 229-link cleanup                              |
| v5      | March 26, 2026 | New Subtask D — Traceability Verification. New CI job test-traceability-verification. Moved all traceability linking requirements from nested §2B/§2C subsections into standalone §9. Structural enforcement — agent cannot skip linking because CI gate blocks merge. | Agent repeatedly skipped traceability steps when Jira API was unavailable. Instruction-based requirements insufficient — needs structural enforcement via CI gate. |

## Context

[ADR-012](ADR-012-execution-rules-for-agent-driven-tickets.md) establishes the global execution contract for agent-driven tickets. It defines how an agent behaves within a ticket: read the ADR, read the ticket, verify prerequisites, respect the closed boundary, block on gaps. [ADR-014](ADR-014-qms-test-management-xray-integration.md) establishes Xray as the QMS test management layer with a two-layer model: pre-created test structure (what tests exist) and CI-driven execution recording (what actually ran).

Both ADRs assume something that is not structurally enforced: that the agent gathers sufficient context before writing code.

[ADR-012](ADR-012-execution-rules-for-agent-driven-tickets.md) §1 Step 2 says "read the ticket." The ticket's GOVERNING ADRs section links to Confluence pages. But nothing forces the agent to follow those links and read the governing ADRs before implementation begins. The link is there for human traceability — it is not an execution constraint that a stateless agent is obligated to honor. The agent may read the ticket description, see enough structure to feel confident, and start implementing without ever fetching [ADR-012](ADR-012-execution-rules-for-agent-driven-tickets.md) or [ADR-008](ADR-008-parser-technology-langium.md) from Confluence.

Similarly, [ADR-014](ADR-014-qms-test-management-xray-integration.md) defines Option B — pre-created test structure — as the decision. But the ticket template has no structural mechanism to ensure Xray Test issues are created and linked before implementation begins. The behavioral specification lives as prose in the ticket description. The Xray Test entity — the QMS-traceable artifact that proves the test was planned, not retroactively documented — must be created as a deliberate step before code is written.

### The Problem This Solves

- Input-side gap: [ADR-012](ADR-012-execution-rules-for-agent-driven-tickets.md) and [ADR-010](ADR-010-quality-gates-enforcement.md) enforce constraints on output (exit criteria, CI quality gates). There is no enforcement on input — no mechanism guarantees the agent has read and internalized governing context before execution begins.

- Test structure gap: [ADR-014](ADR-014-qms-test-management-xray-integration.md) defines the two-layer model but does not define when in the ticket lifecycle the structure layer (Xray Test issues) gets created. Without a structural gate, test issues may be created after implementation — retroactive traceability that violates [ADR-014](ADR-014-qms-test-management-xray-integration.md)'s rationale for Option B.

- Stateless context loss: Each agent session starts with zero context. A development story that links to three governing ADRs requires the agent to make three Confluence fetches and synthesize constraints before writing a single line of code. Without a subtask forcing this step, the agent may skip it entirely or do it incompletely.

## Decision

### 1. Applicability — When This ADR Applies

This ADR applies to every Jira Story that satisfies both of the following conditions:

- Condition A: The story requires development work (code deliverables in the Scope — Closed Boundary section).

- Condition B: The story has at least one of: (i) a GOVERNING ADRs section listing one or more ADRs, or (ii) a BEHAVIORAL SPECIFICATION section defining testable requirements.

Stories that are documentation-only, configuration-only, or human-only (labeled human-only per [ADR-015](ADR-015-orchestration-eligibility-and-execution-mode-tagging.md)) are exempt.

When this ADR applies, the story MUST be decomposed into subtasks following §2.

### 2. Subtask Decomposition — Required Structure

Every applicable story is decomposed into a minimum of three subtasks. Subtask types A and B are fixed. Subtask types C onward are story-specific.

#### Subtask A — Context Review

Purpose: Force the agent to read and synthesize all governing documentation before any other work begins.

Deliverable: A structured comment posted on the parent story (not on the subtask) containing:

- A list of every governing ADR read, with the specific sections relevant to this story.

- A list of binding constraints extracted from those ADRs that govern this story's implementation. A binding constraint is any rule, convention, or requirement from the ADR that the implementation must satisfy.

- A list of every behavioral specification section read, with the specific assertions relevant to this story.

- Any ambiguities, conflicts, or gaps discovered during review. If gaps are found, Subtask A transitions to Blocked per [ADR-012](ADR-012-execution-rules-for-agent-driven-tickets.md) §4 and the gap is resolved before proceeding.

Exit Criteria:

- EXIT-S1: Comment exists on the parent story containing the constraint summary.

- EXIT-C1: Every ADR listed in the parent story's GOVERNING ADRs section is accounted for in the summary.

- EXIT-C2: Every behavioral specification assertion relevant to this story is listed.

Blocking: Subtask A blocks Subtask B. Subtask B cannot begin until Subtask A is Done.

##### §2A.1 — Subtask Naming Verification (v3 amendment)

Before beginning Subtask A work, the agent MUST verify that all subtask summaries on the parent story match the naming convention from §6:

```
{story-key}-A — Context Review
{story-key}-B — Test Specification
{story-key}-C — {description}
```

Specifically, verify:

- The subtask summary contains {story-key}-A — Context Review (for gate A) or {story-key}-B — Test Specification (for gate B). These exact patterns are matched by the CI quality gate (§5).

- If any subtask summary does NOT match the required pattern, the agent MUST rename it using the Jira REST API (PUT /rest/api/3/issue/{key} with fields.summary) before proceeding.

- If the Jira MCP tools are unavailable, the agent MUST use the Jira REST API directly via curl with the provisioned credentials. Tool unavailability is not a valid reason to skip this step.

Why this step exists: Subtasks are authored at ticket planning time, potentially by a different session or human. The naming convention from §6 is the contract consumed by the CI quality gate (§5). If the subtask summaries don't match the pattern, the CI gate will fail at PR time — after implementation is complete. Catching naming mismatches at session start prevents wasted work.

This verification is part of [ADR-012](ADR-012-execution-rules-for-agent-driven-tickets.md) §1 Step 2 (“read the ticket”). Reading the ticket includes verifying that the ticket's structural metadata (subtask names) will pass the enforcement mechanisms defined in this ADR.

#### Subtask B — Test Specification

Purpose: Translate the behavioral requirements (from the story description) and the binding constraints (from the Subtask A comment) into Xray Test issues in Jira, establishing the QMS traceability chain before implementation begins.

Deliverable: Xray Test issues in Jira, each:

- Linked to the parent story as requirement coverage (Xray tests relationship).

- Containing a test identifier that matches the planned .spec.ts describe/it path. This identifier is the contract between the Xray entity and the CI import mechanism defined in [ADR-014](ADR-014-qms-test-management-xray-integration.md). The naming convention is: TopLevelSuite > SubSuite > test assertion matching the test runner output exactly.

- Organized into the appropriate Xray Test Set (epic-level grouping per [ADR-014](ADR-014-qms-test-management-xray-integration.md)).

- Tagged with applicable labels from the Gherkin tag taxonomy ([ADR-014](ADR-014-qms-test-management-xray-integration.md)) where the test maps to a generated .feature file scenario.

##### §2B.1 — Mandatory Jira Issue Link (v2 amendment)

After creating each Test issue via the Jira REST API (createJiraIssue), the agent MUST immediately create a Jira issue link of type Test (link type ID 10038) connecting the Test issue to the parent story:

```
createIssueLink({
  inwardIssue: "<test-issue-key>",   // e.g., MMNT-652
  outwardIssue: "<parent-story-key>", // e.g., MMNT-25
  type: "Test"                        // outward: "tests", inward: "is tested by"
})
```

Why this is a separate step: The Jira REST API's createJiraIssue endpoint creates a Jira issue but does NOT establish Xray-native associations. The Test link type is a standard Jira issue link that Xray recognizes for requirement coverage. Without this link, the Test issue is orphaned — it exists in Jira but has no traceability back to the story it validates.

This is not optional. A Test issue without a tests link to its parent story is a traceability gap that violates [ADR-014](ADR-014-qms-test-management-xray-integration.md)'s QMS chain. The CI import may match test results to the Test issue by name, but without the tests link, the Xray requirement coverage report will not show the story as tested.

##### §2B.2 — Test Set Assignment (v2 amendment)

Test Set assignment requires the Xray Cloud GraphQL API (addTestsToTestSet mutation), which uses separate authentication (XRAY_CLIENT_ID / XRAY_CLIENT_SECRET) from the Jira REST API. The agent should:

- If Xray GraphQL credentials are available: Call addTestsToTestSet to wire each Test issue into its epic-level Test Set (e.g., MMNT-591 for Epic 2.1, MMNT-592 for Epic 2.2).

- If Xray GraphQL credentials are NOT available: Document the pending Test Set assignments in the Subtask B completion comment on the parent story, listing each Test issue key and its intended Test Set. Flag this as a follow-up for a human or a session with Xray credentials.

The Test Set assignment is important for QMS reporting but is NOT a blocking gate — the tests issue link (§2B.1) is the critical traceability artifact.

##### §2B.3 — CI Xray Import and Dual-Layer Test Issues (v2 amendment)

The CI pipeline's Xray JUnit import (xray-import job) automatically creates individual Test issues for each describe/it path in the test output. This produces a dual-layer of Test issues:

- Suite-level (created by the agent in Subtask B): Grouped test identifiers under a single Test issue (e.g., "MMNT-25 Langium Pipeline > Structural Configuration" with 3 JUnit identifiers listed in the description).

- Individual-level (created by CI Xray import): One Test issue per describe/it path (e.g., separate issues for each of the 3 assertions).

Both layers are intentional and serve different purposes:

| Layer            | Created By        | Purpose                                              | Traceability                                                    |
| ---------------- | ----------------- | ---------------------------------------------------- | --------------------------------------------------------------- |
| Suite-level      | Agent (Subtask B) | Planning — defines test scope before implementation  | Linked to parent story via tests issue link                     |
| Individual-level | CI Xray import    | Execution evidence — records pass/fail per assertion | Matched by JUnit test identifier; auto-linked to Test Execution |

The agent MUST link both layers to the parent story via the tests issue link. Suite-level links are created in Subtask B. Individual-level links must be created after the first CI run imports them — either by the agent in Subtask C, or by a post-CI automation step.

Exit Criteria (updated):

- EXIT-S1: Xray Test issues exist in Jira for every behavioral specification assertion in the parent story's scope.

- EXIT-B1: Every Test issue is linked to the parent story via the tests issue link (Jira link type Test).

- EXIT-C1: Every Test issue's identifier matches the planned describe/it naming convention.

- EXIT-C2: Test issues are added to the correct Test Set (or documented for follow-up if Xray GraphQL credentials unavailable).

- EXIT-C3: No implementation code exists yet — this subtask produces Xray entities only.

Blocking: Subtask B blocks all subsequent subtasks (C, D, ...). No implementation subtask can begin until Subtask B is Done.

#### Subtasks C, D, ... — Implementation

Purpose: Write code, write tests, green the behavioral spec. These follow [ADR-012](ADR-012-execution-rules-for-agent-driven-tickets.md)'s standard execution contract.

Requirements:

- All implementation subtasks operate on the story's branch (see §3).

- Test names in .spec.ts files MUST match the identifiers registered in the Xray Test issues from Subtask B. This is the naming contract that enables [ADR-014](ADR-014-qms-test-management-xray-integration.md)'s CI import matching.

- Commits are scoped to the subtask using conventional commit messages: feat(MMNT-{story}-{subtask}): description or test(MMNT-{story}-{subtask}): description.

- Each implementation subtask follows [ADR-012](ADR-012-execution-rules-for-agent-driven-tickets.md) §1–§6 in full — session start protocol, closed boundary, failure protocol, code requirements, exit criteria verification, testing requirements.

- (v2/v4) Complete the post-CI traceability linking per §2C.1 before transitioning Subtask C to Done.

##### §2C.1 — Mandatory Post-CI Traceability Linking (v4 amendment)

After the first CI run completes on the PR, the CI Xray import creates individual-level Test issues for each describe/it path. These issues exist in Jira but are NOT automatically linked to the parent story. The agent MUST link them before Subtask C can be marked Done.

Procedure:

- Query Jira for recently created Test issues that match the story's test output: project=MMNT AND issuetype=Test AND key >= MMNT-{recent} ORDER BY key ASC

- For each Test issue that has NO tests issue link, determine the parent story by matching the test summary (e.g., "SiftSpecificationImporter > ..." → MMNT-213).

- Create the tests issue link: createIssueLink(type: "Test", inwardIssue: testKey, outwardIssue: storyKey)

- If the Jira MCP tools are unavailable, use the Jira REST API directly: POST /rest/api/3/issueLink with the provisioned credentials.

This step is NOT optional. Without it, the Xray requirement coverage report will show the story as partially tested (only the suite-level Test issues from Subtask B will appear). The individual-level Test issues carry the actual pass/fail execution evidence from CI.

Exit gate: Subtask C cannot transition to Done until all Test issues created by CI import for this story are linked to the parent story via the tests issue link. This is verified by querying the story’s issue links panel and confirming all test summaries appear under “is tested by.”

Exit Criteria: Defined per-subtask on each ticket. At minimum:

- EXIT-B1: All tests attributed to this subtask's scope pass.

- EXIT-S1: All deliverable files from this subtask's scope exist.

#### Subtask D — Traceability Verification (v5)

Purpose: Verify that every Test issue — both suite-level (created by the agent in Subtask B) and individual-level (created by CI Xray import) — is linked to the parent story via the tests issue link. This subtask exists because agents repeatedly skipped the linking instructions when tooling was unavailable. A CI gate enforces this subtask.

Deliverable: The agent verifies and confirms:

- All suite-level Test issues (created in Subtask B) have a tests issue link to the parent story.

- All individual-level Test issues (created by CI Xray import after CI runs) have a tests issue link to the parent story.

- Any unlinked Test issues are linked using createIssueLink(type: "Test", inwardIssue: testKey, outwardIssue: storyKey).

Procedure:

- Query the parent story’s issue links: GET /rest/api/3/issue/{storyKey}?fields=issuelinks

- Count Test-type links. If zero, the gate will fail.

- Query for recently created Test issues whose summaries match this story’s test output (e.g., test names containing the service/module name).

- For each unlinked Test issue, create the tests issue link.

- If MCP tools are unavailable, use the Jira REST API directly with provisioned credentials.

Exit Criteria:

- EXIT-D1: All Test issues for this story are linked via the tests issue link.

- EXIT-D2: The parent story’s “is tested by” panel in Jira shows all test issues.

Blocking: Subtask D blocks PR merge. The CI job test-traceability-verification (§9) checks that this subtask is Done and that at least one tests link exists on the story. If either condition fails, the PR cannot merge.

Naming convention: {story-key}-D — Traceability Verification

### 3. Branch Strategy — Single Branch, Subtask-Scoped Commits

The parent story defines the branch name following [ADR-012](ADR-012-execution-rules-for-agent-driven-tickets.md) §7a conventions (e.g., feature/MMNT-35-implement-moment-parser). All subtasks operate on this single branch.

Rationale: Per-subtask branches introduce coordination cost for a stateless executor. If Subtask C creates feature/mmnt-35-c and Subtask D starts in a new session, that session must know the merge state of C's branch. With a single story branch, every subtask session checks out the story branch and picks up where the last subtask left off. Sequencing is implicit in the branch state.

Traceability: Subtask-level traceability comes from commit messages keyed to the subtask identifier, not from branch separation. Code review at the story level examines the full PR; subtask-scoped commits provide the decomposition within that PR.

Subtask A and B: These subtasks produce no code commits. Subtask A's deliverable is a Jira comment. Subtask B's deliverable is Xray Test issues + issue links. The branch is created at the start of Subtask C (or whichever is the first implementation subtask).

### 4. Dependency Chain — Blocking Rules

The blocking chain within a story is strictly sequential for A and B, then follows ticket-defined ordering for implementation subtasks:

```
Subtask A (Context Review)
    │
    ▼ blocks
Subtask B (Test Specification)
    │
    ▼ blocks
Subtask C (Implementation — first)
    │
    ▼ blocks (if sequential) or parallel (if disjoint per ADR-015)
Subtask D (Implementation — subsequent)
    │
    ...
```

A blocks B: The constraint summary from A is required input for B. Without understanding the governing ADR constraints, the agent cannot correctly translate behavioral requirements into Xray Test issues — it might miss constraints that should be test cases.

B blocks C, D, ...: The Xray Test issue identifiers from B are required input for implementation. The .spec.ts naming must match. If an implementation subtask creates a test with a name that doesn't match an Xray Test issue, the CI import ([ADR-014](ADR-014-qms-test-management-xray-integration.md)) will not link the execution evidence to the QMS record, breaking the traceability chain.

Implementation subtask ordering: Follows the same rules as story-level ordering. If implementation subtasks have disjoint file scope, they may be eligible for parallel execution per [ADR-015](ADR-015-orchestration-eligibility-and-execution-mode-tagging.md). If they share file scope, they are sequential. This is evaluated at ticket authoring time and recorded in the subtask description.

### 5. Blocking Enforcement — CI Quality Gate

(Unchanged from v1 — see original §5 for CI workflow step, authentication, failure modes.)

Jira does not natively enforce subtask ordering. The enforcement mechanism is a required CI quality gate that queries the Jira API to verify input gate subtasks are complete before allowing merge.

### 6. Subtask Naming Convention

(Unchanged from v1.)

Subtask summaries follow a fixed convention for machine-readability and board clarity:

```
{story-key}-A — Context Review
{story-key}-B — Test Specification
{story-key}-C — {implementation scope description}
{story-key}-D — {implementation scope description}
```

### 7. CI Feedback Loop — Closing the Chain

(Unchanged from v1.)

### 8. Relationship to Other ADRs

(Unchanged from v1.)

### 9. Test Traceability Enforcement — CI Quality Gate (v5)

Test traceability is enforced by a required CI quality gate that runs on every PR, following the same pattern as the input gate verification (§5). This gate cannot be skipped by the agent — it is structural enforcement.

#### How It Works

- Extract the story key from the branch name (same mechanism as §5).

- Query the Jira REST API for the story’s subtasks and issue links.

- Verify Subtask D (-D — Traceability Verification) exists and is in Done status.

- Verify at least one tests issue link exists on the story. Zero test links means no traceability chain was established.

#### CI Workflow Job

```
test-traceability-verification:
  runs-on: ubuntu-latest
  needs: [build]
  if: github.event_name == 'pull_request'
  steps:
    - name: Verify test traceability
      run: |
        BRANCH="${{ github.head_ref }}"
        STORY_KEY=$(echo "$BRANCH" | sed -n 's/^[a-z]*\/\(MMNT-[0-9]*\).*/\1/p')

        if [ -z "$STORY_KEY" ]; then
          echo "::notice::No story key — skipping."
          exit 0
        fi

        RESPONSE=$(curl -s -u "$JIRA_USER_EMAIL:$JIRA_API_TOKEN" \
          "https://winnovation.atlassian.net/rest/api/3/issue/$STORY_KEY?fields=subtasks,issuelinks")

        # Check Subtask D
        GATE_D_STATUS=$(echo "$RESPONSE" | jq -r \
          '.fields.subtasks[] | select(.fields.summary | test("-D — Traceability Verification")) | .fields.status.name')

        if [ -z "$GATE_D_STATUS" ] || [ "$GATE_D_STATUS" != "Done" ]; then
          echo "::error::Traceability gate failed."
          exit 1
        fi

        # Check test links
        TEST_LINK_COUNT=$(echo "$RESPONSE" | jq '[.fields.issuelinks[] | select(.type.name == "Test")] | length')

        if [ "$TEST_LINK_COUNT" -eq 0 ]; then
          echo "::error::Zero test links on $STORY_KEY."
          exit 1
        fi

        echo "Traceability verified: $TEST_LINK_COUNT test links."
      env:
        JIRA_USER_EMAIL: \${{ secrets.JIRA_USER_EMAIL }}
        JIRA_API_TOKEN: \${{ secrets.JIRA_API_TOKEN }}
```

#### Relationship to Other Gates

| Gate                                | What It Checks                                                                 | When It Runs           |
| ----------------------------------- | ------------------------------------------------------------------------------ | ---------------------- |
| input-gate-verification (§5)        | Subtask A (Context Review) and B (Test Specification) are Done                 | Every PR               |
| test-traceability-verification (§9) | Subtask D (Traceability Verification) is Done + at least one tests link exists | Every PR (after build) |

Defense in depth: The input gate (§5) ensures the agent read the context and planned the tests before coding. The traceability gate (§9) ensures the agent linked the test evidence back to the story after coding. Together they close both ends of the lifecycle.

## Consequences

What becomes easier:

- Every development story has a provable record that governing context was read before code was written.

- Xray Test issues exist before implementation begins — the QMS traceability chain is structurally enforced.

- (v2) The tests issue link requirement ensures every Test issue is discoverable from its parent story in Jira's "is tested by" panel. Requirement coverage reports in Xray will correctly show which stories have test coverage.

- (v2) The dual-layer model (suite-level + individual-level) provides both planning traceability (agent-created) and execution evidence (CI-imported).

What becomes harder:

- (v2) Subtask B now requires TWO API calls per Test issue: createJiraIssue + createIssueLink. This adds operational overhead but prevents orphaned tests.

- (v2) Individual-level Test issues from CI import must also be linked post-CI-run. This is additional work in Subtask C or requires automation.

What to watch:

- (v2) Orphaned Test issues. Run periodic JQL queries for project = MMNT AND issuetype = Test AND issueFunction NOT in linkedIssuesOf("type = Story", "tests") to detect Test issues without parent story links. This was the Sprint 2 finding — 229 orphaned issues across 8 stories.

- (v4) Post-CI linking cadence. The agent must link CI-created Test issues after EVERY CI run that introduces new tests, not just the first run. If new tests are added in a follow-up commit (e.g., PR review feedback), the CI import will create additional Test issues that need linking.

- (v3) Subtask naming drift. Subtasks authored in different planning sessions may use different naming patterns. The agent’s session-start verification (§2A.1) is the last line of defense before CI gate failure. If naming drift is frequent, consider adding a Jira automation rule that validates subtask summaries against the {story-key}-{letter} — pattern at issue creation time.

- (v2) Test Set assignment gaps. Until Xray GraphQL credentials are provisioned in agent sessions, Test Set assignment requires manual follow-up or a dedicated script run.

## Rejected Alternatives

(Unchanged from v1.)

\<!-- END_DOCUMENT -->
