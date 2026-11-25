# ADR-014: QMS Test Management — Xray Integration

Migrated from Confluence page 13598725 (version 1, last updated 2026-03-10), https://winnovation.atlassian.net/wiki/spaces/MMMNT/pages/13598725. The Confluence space is private; this file is now the record.

- **Status:** Accepted
- **Author:** listenrightmeow
- **Created:** 2026-03-09
- **Governs:** CI pipeline, Jira test issue hierarchy, environment secrets

## Context

Moment requires documented test evidence for Quality Management System (QMS) compliance. Testing must be traceable from requirement → test case → execution evidence. A QMS is not just "tests passed" — it's a provable chain: we identified what needed testing, we defined how to test it, we executed the tests, and we can prove the chain from requirement to evidence is unbroken.

Moment's architecture produces two test artifact formats: Vitest TypeScript specs (.spec.ts) producing JUnit XML results, and Cucumber/Gherkin feature files (.feature) producing Cucumber JSON results. Both formats have native import paths into Xray Test Management for Jira.

## Decision

Adopt Xray Test Management for Jira as the QMS tooling layer. Use Option B: Pre-created test structure with CI-driven execution recording.

### Two-Layer Model

Structure layer (what tests exist, what they trace to): Test issues, Test Plans, and Test Sets are pre-created in Jira before implementation begins. Each Test issue links to the story it verifies. Test Sets organize tests by epic. Test Plans organize Test Sets by milestone. This is the traceability chain auditors inspect.

Execution layer (what actually ran, what passed/failed): Test Execution issues are created automatically by the CI pipeline via Xray's REST import API. Each CI run imports JUnit XML and Cucumber JSON results. Xray matches results to pre-existing Test issues by identifier, creating timestamped execution records with pass/fail status, duration, and CI run link as evidence.

### How Matching Works

Xray matches imported results to existing Test issues using deterministic identifiers:

- JUnit XML: Test class name + test method name → maps to the describe/it path in Vitest (e.g., MomentParser > V1 > resolves entry name to ManifestEntry)

- Cucumber JSON: Feature name + Scenario name → maps directly to generated .feature file structure (e.g., Feature: First Time Ingestion > Scenario: NormalizationCompleted crosses to interpretation)

Because Moment's generation pipeline produces both formats with deterministic naming, the test identifiers are stable and predictable. The Gherkin tag taxonomy (12 tags) maps to Xray labels for organization.

### CI Pipeline Integration

Two new steps are added to the CI workflow after the test execution phase:

Step 1 — Import JUnit results:

```
- name: Import JUnit results to Xray
  if: always()
  run: |
    TOKEN=$(curl -s -X POST \
      "https://xray.cloud.getxray.app/api/v2/authenticate" \
      -H "Content-Type: application/json" \
      -d "{\"client_id\":\"$XRAY_CLIENT_ID\",\"client_secret\":\"$XRAY_CLIENT_SECRET\"}" | tr -d '"')
    curl -X POST \
      "https://xray.cloud.getxray.app/api/v2/import/execution/junit" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/xml" \
      -d @test-results/junit.xml
  env:
    XRAY_CLIENT_ID: ${{ secrets.XRAY_CLIENT_ID }}
    XRAY_CLIENT_SECRET: ${{ secrets.XRAY_CLIENT_SECRET }}
```

Step 2 — Import Cucumber results:

```
- name: Import Cucumber results to Xray
  if: always()
  run: |
    TOKEN=$(curl -s -X POST \
      "https://xray.cloud.getxray.app/api/v2/authenticate" \
      -H "Content-Type: application/json" \
      -d "{\"client_id\":\"$XRAY_CLIENT_ID\",\"client_secret\":\"$XRAY_CLIENT_SECRET\"}" | tr -d '"')
    curl -X POST \
      "https://xray.cloud.getxray.app/api/v2/import/execution/cucumber" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d @test-results/cucumber.json
  env:
    XRAY_CLIENT_ID: ${{ secrets.XRAY_CLIENT_ID }}
    XRAY_CLIENT_SECRET: ${{ secrets.XRAY_CLIENT_SECRET }}
```

The if: always() condition ensures results are imported even when tests fail — failed test evidence is just as important as passing evidence for QMS compliance.

### Authentication

Xray Cloud uses API key authentication via a client ID + client secret pair. These are exchanged for a short-lived bearer token on each CI run. This is separate from the Jira API — Xray has its own authentication endpoint.

### Environment Variables (ADR-011 cascade)

| Secret             | Source                | Used By              | Type                  |
| ------------------ | --------------------- | -------------------- | --------------------- |
| XRAY_CLIENT_ID     | Xray Cloud → API Keys | CI Xray import steps | GitHub Actions secret |
| XRAY_CLIENT_SECRET | Xray Cloud → API Keys | CI Xray import steps | GitHub Actions secret |

Updated total repository secrets: 4 (NPM_TOKEN, SNYK_TOKEN, XRAY_CLIENT_ID, XRAY_CLIENT_SECRET)

### Jira Issue Type Hierarchy

Xray adds custom issue types to the Jira project:

| Issue Type     | Purpose                                                                        | Created By                        |
| -------------- | ------------------------------------------------------------------------------ | --------------------------------- |
| Test Plan      | Milestone-level test organization. One per milestone (M1–M5).                  | Pre-created manually or by Claude |
| Test Set       | Epic-level test grouping. One per epic (14 total).                             | Pre-created manually or by Claude |
| Test           | Individual test case linked to a story. Identifier matches test runner output. | Pre-created before implementation |
| Test Execution | Timestamped record of a test run with pass/fail evidence.                      | Auto-created by CI import         |
| Precondition   | Shared setup/prerequisite referenced by multiple Tests.                        | Pre-created as needed             |

### Traceability Chain

```
Story (requirement)
  └── Test (what we test, linked via "tests" relationship)
        └── Test Execution (when we tested, auto-created by CI)
              └── Evidence (pass/fail, duration, CI run link)

Test Set (epic grouping)
  └── Tests belonging to that epic

Test Plan (milestone grouping)
  └── Test Sets belonging to that milestone
```

### Xray + Moment Gherkin Synergy

Moment's generated .feature files use a 12-tag taxonomy that maps cleanly to Xray organization:

| Gherkin Tag                | Xray Mapping                              |
| -------------------------- | ----------------------------------------- |
| @moment-spec:\<name>       | Test label — source spec identifier       |
| @context:\<name>           | Test label — bounded context ownership    |
| @contract:\<type>          | Test label — relationship type            |
| @cross-context             | Test label — integration test marker      |
| @crossing:\<src>-to-\<tgt> | Test label — specific crossing identifier |
| @terminal                  | Test label — terminal state               |
| @branch:\<condition>       | Test label — branch path                  |

Xray's Cucumber integration reads these tags natively, making the generated feature files directly importable as Xray Test issues with full label taxonomy.

## Rationale

### Why Xray

Xray is the most widely adopted test management tool for Jira. It uses native Jira issue types, which means standard Jira APIs can manage the structure layer (creating Tests, linking to stories, organizing into Test Plans). The CI import API handles the execution layer with zero manual intervention. The Cucumber/Gherkin native integration is particularly valuable because Moment generates .feature files as a first-class output.

### Why Option B (Pre-created structure) over Option A (CI auto-creation)

A QMS requires the traceability chain to exist before execution, not retroactively. Pre-creating Test issues linked to requirements means:

- Auditors can inspect the test inventory before any code is written

- Coverage gaps are visible before implementation begins

- The requirement → test link is intentional, not inferred after the fact

- Test Plans and Test Sets provide milestone/epic-level reporting out of the box

### Why CI-driven execution over manual execution

Manual test execution recording is error-prone, time-consuming, and doesn't scale for a solo practitioner running agent-driven sessions. CI automation ensures every test run produces evidence, every failure is recorded, and the execution history is complete without human intervention.

## Rejected Alternatives

| Alternative                              | Reason                                                                                                      |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Manual test execution in Xray UI         | Doesn't scale for agent-driven development; error-prone evidence chain                                      |
| Zephyr Scale                             | Less mature Cucumber integration; Xray's native Gherkin support aligns with Moment's dual-format generation |
| TestRail (external)                      | Separate system from Jira; breaks the single-system traceability chain                                      |
| No QMS tooling (JUnit XML archives only) | Raw result files don't provide the structured traceability chain auditors require                           |
| Option A — CI auto-creation only         | Retroactive traceability; requirement → test links must be created manually after import                    |

## Consequences

- [ADR-011](ADR-011-environment-variable-secrets-manifest.md) updated: 2 new secrets (XRAY_CLIENT_ID, XRAY_CLIENT_SECRET), total repository secrets now 4

- [ADR-009](ADR-009-ci-testing-strategy.md)/[ADR-010](ADR-010-quality-gates-enforcement.md) cascade: CI workflow gains 2 new steps (JUnit import, Cucumber import) after test execution

- Xray app must be installed in the Jira project before any Test issues can be created

- Each behavioral spec story in the Execution Plan Manifest implicitly produces corresponding Test issues — the spec defines what to test, the Test issue is the Jira representation of that spec assertion

- Test result reporters must be configured in Vitest (vitest.config.ts → reporters: ['default', 'junit']) and Cucumber (cucumber.js → format: ['json:test-results/cucumber.json'])

- The Execution Plan Manifest needs a new epic in M1 for Xray project setup and a recurring pattern of Test issue creation alongside behavioral spec stories

## References

- Xray Cloud REST API: https://docs.getxray.app/display/XRAYCLOUD/REST+API

- Xray CI/CD Integration: https://docs.getxray.app/display/XRAYCLOUD/Integration+with+CI+CD

- Xray Cucumber Integration: https://docs.getxray.app/display/XRAYCLOUD/Testing+with+Cucumber

\<!-- END_DOCUMENT -->
