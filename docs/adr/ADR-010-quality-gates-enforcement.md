# ADR-010: Quality Gates & Enforcement

Migrated from Confluence page 13107202 (version 5, last updated 2026-03-23), https://winnovation.atlassian.net/wiki/spaces/MMMNT/pages/13107202. The Confluence space is private; this file is now the record.

- **Status:** Accepted
- **Date:** March 9, 2026
- **Deciders:** listenrightmeow, Claude (DDD Coaching Project)
- **Tags:** quality-gates, security, enforcement, snyk, gitleaks, commitlint, husky
- **Derived From:** Sift ADR-039 (CI Quality Gates — Mandatory Coverage, PR Enforcement & Agent Feedback Cycle)

## Context

[ADR-009](ADR-009-ci-testing-strategy.md) defines the CI/CD pipeline architecture: Turborepo orchestration, Vitest testing, esbuild CLI bundling, Changesets publishing, and GitHub Actions workflows. It describes what the pipeline does. This ADR mandates what blocks a merge.

The rationale is inherited directly from Sift ADR-039: the primary implementation agent for the Moment codebase is Claude Code. Claude Code operates across sessions with context resets — it does not retain memory of what it built, what tests it wrote, or what quality standards were enforced in a prior session. Quality enforcement must be structural, not instructional.

### Key differences from Sift ADR-039

Sift ADR-039 was designed for a commercial product with SOC 2/HIPAA compliance requirements, multi-environment deployment (development → qa → staging → production), and Lambda infrastructure. Moment is an MIT-licensed open-source project with a simpler branch model and no infrastructure. The following adaptations apply:

| Sift ADR-039                            | Moment ADR-010                                                              | Rationale                                                                                       |
| --------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 100% coverage, all packages             | Graduated thresholds (75–95%) per [ADR-009](ADR-009-ci-testing-strategy.md) | Coverage targets were a deliberate Pass 2 decision reflecting each package's role in the system |
| Multi-environment branch hierarchy      | Feature → main (trunk-based)                                                | Open-source project, no staged deployment environments                                          |
| Docker Compose Tier 2 integration tests | Tier 3 subprocess smoke tests ([ADR-009](ADR-009-ci-testing-strategy.md))   | Moment has no infrastructure — CLI subprocess tests are the integration tier                    |
| Prompt evaluation gate                  | Not applicable                                                              | Moment has no LLM prompts                                                                       |
| SOC 2/HIPAA compliance sections         | Not applicable                                                              | MIT open-source, not commercial                                                                 |
| Lambda bundle size budgets              | CLI bundle size budget                                                      | Same principle, different artifact                                                              |

Everything else carries over: gates-first implementation order, required status checks, security scanning, commit conventions, pre-commit hooks, agent feedback cycle, complexity gates, and dependency audit.

## Decision

### 1. Implementation Order: Gates First, Application Code Second

The quality gates are the first implementation deliverable in the Moment repository. The implementation sequence is:

- Repository scaffolding (monorepo structure, Turborepo, pnpm workspace, package stubs)

- Quality gates (this ADR — GitHub Actions workflows, branch protection rules, coverage enforcement, security scanning)

- Langium grammar (@mmmnt/core parser foundation)

- Application code (package implementations)

No application code PR is accepted until the quality gate workflows are merged to main and branch protection rules are active. This is a sequencing constraint, not a goal.

### 2. Branch Model: Trunk-Based with Enforced Protection

Moment uses a trunk-based development model: feature branches merge directly to main. No environment branches.

Branch protection rules (configured in GitHub repository settings):

| Branch     | Required status checks                   | Required reviews | Dismiss stale reviews | Require up-to-date | Force push | Delete  |
| ---------- | ---------------------------------------- | ---------------- | --------------------- | ------------------ | ---------- | ------- |
| main       | All (see §3)                             | 1                | Yes                   | Yes                | Blocked    | Blocked |
| feature/\* | All Tier 1 + Security + Quality (see §3) | 0                | N/A                   | N/A                | Allowed    | Allowed |

"Require up-to-date" means the PR branch must be rebased on main's HEAD before merge. Tests ran against current code or they don't count.

No direct commits to main. All changes arrive via PR.

### 3. Required Status Checks: Every PR Must Go Green

The following GitHub Actions status checks must pass before any PR merges. Failure of any check blocks the merge button.

| Check name                | What it runs                                                                                                                                               | Failure blocks merge |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| tier1/unit-tests          | Vitest across all affected packages (Turborepo filtering)                                                                                                  | Yes                  |
| tier1/coverage            | Per-package coverage thresholds per [ADR-009](ADR-009-ci-testing-strategy.md) §8 (core: 95%, derive: 90%, generate: 90%, harness: 85%, viz: 80%, cli: 75%) | Yes                  |
| tier1/lint                | ESLint + Prettier check (no auto-fix — fail if code doesn't conform)                                                                                       | Yes                  |
| tier1/typecheck           | tsc --noEmit across all affected packages                                                                                                                  | Yes                  |
| tier1/build               | tsc for libraries, esbuild for CLI — catches import errors, declaration emission issues                                                                    | Yes                  |
| tier1/commit-lint         | Conventional Commits format validation via commitlint                                                                                                      | Yes                  |
| tier1/integration         | Tier 3 CLI subprocess smoke tests via execa ([ADR-009](ADR-009-ci-testing-strategy.md) §5.6)                                                               | Yes                  |
| tier1/gherkin-validity    | Generated .feature files parse under @cucumber/gherkin                                                                                                     | Yes                  |
| tier1/snapshot-freshness  | No stale Vitest snapshots                                                                                                                                  | Yes                  |
| security/snyk-sca         | Snyk dependency vulnerability scan — block on high/critical CVEs                                                                                           | Yes                  |
| security/snyk-sast        | Snyk static application security testing — block on high findings                                                                                          | Yes                  |
| security/snyk-license     | Snyk license compliance — block on copyleft or unknown licenses                                                                                            | Yes                  |
| security/secret-detection | Gitleaks secret scan — block on any finding                                                                                                                | Yes                  |
| quality/complexity        | ESLint complexity rule — block on cyclomatic complexity > 10 per function                                                                                  | Yes                  |
| quality/bundle-size       | esbuild metafile analysis — block if CLI bundle exceeds 5MB                                                                                                | Yes                  |
| quality/dependency-audit  | pnpm-lock.yaml diff analysis — block on 3+ new direct deps or 50+ new transitive deps                                                                      | Yes                  |

No escape hatches. There is no [skip-tests], no [skip-coverage], no [skip-lint], no [skip-security], no [skip-quality]. These gates are absolute.

### 4. Coverage Enforcement

Coverage thresholds are per-package as established in [ADR-009](ADR-009-ci-testing-strategy.md) §8. This ADR adds enforcement mechanics.

Coverage tool: Vitest with v8 coverage provider.

Thresholds (per-package vitest.config.ts):

| Package         | Lines | Branches | Functions | Statements |
| --------------- | ----- | -------- | --------- | ---------- |
| @mmmnt/core     | 95%   | 95%      | 95%       | 95%        |
| @mmmnt/derive   | 90%   | 90%      | 90%       | 90%        |
| @mmmnt/generate | 90%   | 90%      | 90%       | 90%        |
| @mmmnt/harness  | 85%   | 85%      | 85%       | 85%        |
| @mmmnt/viz      | 80%   | 80%      | 80%       | 80%        |
| @mmmnt/cli      | 75%   | 75%      | 75%       | 75%        |

No exclusion comments: /\* v8 ignore next \*/, /\* istanbul ignore \*/, and equivalent coverage exclusion directives are banned. If the line exists, it must be tested. If it cannot be tested, it should not exist. A custom ESLint rule flags coverage exclusion comments as errors.

Exception — generated code: Files generated by Langium (src/generated/\*\*) are excluded via coverage.exclude in the vitest config, not inline comments. The exclusion list is maintained in config files and is itself subject to PR review.

### 5. PR Test Reports: Inline Visibility

Test results and coverage reports are published directly on the PR. The agent and reviewer see results without navigating to the Actions tab.

Test result reporting: Vitest outputs JUnit XML via --reporter=junit. The CI workflow uses dorny/test-reporter to publish results as a PR check with inline annotations. Failed tests appear as annotations on the exact lines where assertions failed.

Coverage reporting: Vitest outputs LCOV and JSON summary. The CI workflow uses davelosert/vitest-coverage-report-action to publish a coverage summary comment showing: total coverage per package, diff coverage (lines changed in this PR), and uncovered lines with file paths and line numbers.

Security reporting: Snyk findings appear as inline PR annotations on the affected file and line via the Snyk GitHub integration. Gitleaks findings appear as check annotations with the detected pattern and file location.

Report persistence: Test reports, coverage reports, and security scan results are uploaded as GitHub Actions artifacts on every PR. Retained for 90 days.

### 6. Agent Feedback Cycle: Fast, Unambiguous, Actionable

The quality gates are designed for a tight feedback loop with Claude Code.

Feedback speed targets:

| Gate                                        | Target time  | How                                                   |
| ------------------------------------------- | ------------ | ----------------------------------------------------- |
| tier1/typecheck                             | < 30 seconds | tsc --noEmit with Turborepo caching                   |
| tier1/lint + quality/complexity             | < 30 seconds | ESLint flat config, complexity rule included          |
| tier1/unit-tests + tier1/coverage           | < 2 minutes  | Vitest with Turborepo affected filtering, v8 coverage |
| tier1/build + quality/bundle-size           | < 1 minute   | tsc + esbuild with metafile analysis                  |
| security/snyk-sca + security/snyk-license   | < 1 minute   | Snyk CLI against lockfile                             |
| security/snyk-sast                          | < 2 minutes  | Snyk Code analysis on affected source                 |
| security/secret-detection                   | < 30 seconds | Gitleaks scan on diff only                            |
| quality/dependency-audit                    | < 15 seconds | pnpm-lock.yaml diff analysis                          |
| Full Tier 1 + Security + Quality (parallel) | < 3 minutes  | All checks in parallel as separate jobs               |
| tier1/integration                           | < 2 minutes  | CLI subprocess tests (after build)                    |

Failure messages: When a check fails, the output includes: the exact test(s) that failed with assertion messages, the exact lines that are uncovered with file paths, the exact lint rule(s) violated with ESLint rule IDs, the exact type errors with TypeScript diagnostic codes, the exact security findings with severity and remediation, and the exact complexity scores for offending functions.

Parallel execution: All checks run as parallel GitHub Actions jobs. The agent sees all failures at once, not sequentially. A PR with a type error, a lint violation, an uncovered line, and a committed secret reports all four simultaneously.

### 7. Commit Convention and PR Template

Conventional Commits: All commits follow the Conventional Commits specification (feat:, fix:, test:, refactor:, chore:, docs:, ci:). Enforced by commitlint in CI and pre-commit hook. Non-conforming messages block the PR.

Scope convention: Commit scopes match package names — feat(\<JIRA-TICKET-NUMBER>):, fix(\<JIRA-TICKET-NUMBER>):, test(\<JIRA-TICKET-NUMBER>):, chore(\<JIRA-TICKET-NUMBER>):. Unscoped commits are allowed for cross-cutting changes.

PR template (.github/pull_request_template.md):

```
## Summary
<!-- What does this PR do? -->

## Test Plan
<!-- How did you verify this works? What new tests were added? -->

## Coverage Impact
<!-- Which new code paths are tested? Any notable edge cases covered? -->

## Security Impact
<!-- Does this PR add new dependencies, change authentication, or handle sensitive data? -->

## ADR References
<!-- Which ADRs does this PR implement or relate to? -->
```

### 8. Pre-commit Hooks: Local Fast Feedback

A husky + lint-staged configuration runs checks before the commit reaches CI:

| Hook       | What it runs                                         | Purpose                                          |
| ---------- | ---------------------------------------------------- | ------------------------------------------------ |
| pre-commit | lint-staged — ESLint + Prettier on staged files only | Catch formatting and lint violations before push |
| pre-commit | gitleaks — secret scan on staged files               | Catch committed secrets before push              |
| commit-msg | commitlint — validates Conventional Commits format   | Catch non-conforming commit messages before push |

Pre-commit hooks provide instant local feedback (< 5 seconds). CI provides authoritative enforcement. Pre-commit is the fast lane; CI is the hard gate.

### 9. Security Gates: Snyk Integration

Snyk provides security scanning across three dimensions — all PR-blocking.

Snyk SCA (Software Composition Analysis) — security/snyk-sca:

Scans pnpm-lock.yaml for known vulnerabilities in direct and transitive dependencies. Block on high or critical severity. Medium/low reported as PR comments, no block.

Snyk SAST (Static Application Security Testing) — security/snyk-sast:

Analyzes TypeScript source for security anti-patterns: injection vulnerabilities, prototype pollution, path traversal, unsafe deserialization. Block on high severity. Medium findings reported as inline PR annotations, no block.

Snyk License Compliance — security/snyk-license:

Validates no dependency carries a copyleft license incompatible with MIT.

| License category                                                    | Action                  |
| ------------------------------------------------------------------- | ----------------------- |
| Permissive (MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC, 0BSD) | Allow                   |
| Weak copyleft (MPL-2.0, LGPL-2.1, LGPL-3.0)                         | Block — flag for review |
| Strong copyleft (GPL-2.0, GPL-3.0, AGPL-3.0)                        | Block — hard rejection  |
| Unknown / No license                                                | Block — flag for review |

This is critical for @mmmnt packages — they're MIT-licensed and consumed by both open-source users and Complai's commercial products. A copyleft transitive dependency would poison the license chain.

Secret Detection — security/secret-detection:

Gitleaks scans all committed files for secrets, API keys, tokens, and credentials. Block on any finding. Zero tolerance. The .gitleaks.toml includes patterns for AWS access keys, Anthropic API keys, npm tokens, and any Bearer or Basic auth tokens.

### 10. Code Quality Gates

Cyclomatic Complexity — quality/complexity:

ESLint complexity rule at max 10. A function with complexity > 10 has more than 10 independent paths — difficult to test exhaustively and a signal that decomposition is needed.

No per-function overrides. // eslint-disable-next-line complexity is banned.

CLI Bundle Size Budget — quality/bundle-size:

The esbuild CLI bundle has a maximum size of 5MB. The build.mjs script outputs a metafile; a CI script analyzes it.

| Condition        | Action            |
| ---------------- | ----------------- |
| CLI bundle < 4MB | Pass silently     |
| CLI bundle 4–5MB | Warn (PR comment) |
| CLI bundle > 5MB | Block             |

Why 5MB: The CLI should install and start fast. A 5MB bundle keeps npx @mmmnt/cli generate startup under 2 seconds on a warm cache. If the bundle grows beyond this, it signals unnecessary dependencies being inlined.

Dependency Count Audit — quality/dependency-audit:

Analyzes pnpm-lock.yaml diffs to detect dependency sprawl.

| Condition                                   | Action                                                               |
| ------------------------------------------- | -------------------------------------------------------------------- |
| 0 new direct dependencies                   | Pass silently                                                        |
| 1–2 new direct dependencies                 | Pass with informational PR comment (name, license, transitive count) |
| 3+ new direct dependencies                  | Block — justify in PR description                                    |
| Any new dependency adds 50+ transitive deps | Block — regardless of direct count                                   |

This is especially important for AI agent codebases. Claude Code reaches for npm packages rather than writing focused utility functions. The gate creates friction that favors smaller, more focused solutions.

### 11. Merge Requirements Summary

A PR is mergeable if and only if:

| Condition                                   | Enforcement                                                |
| ------------------------------------------- | ---------------------------------------------------------- |
| All required status checks pass (green)     | GitHub branch protection                                   |
| Branch is up-to-date with main              | GitHub branch protection                                   |
| 1 reviewer approved (main branch PRs)       | GitHub branch protection                                   |
| Per-package coverage thresholds met         | tier1/coverage gate                                        |
| Zero lint errors                            | tier1/lint gate                                            |
| Zero type errors                            | tier1/typecheck gate                                       |
| All tests pass                              | tier1/unit-tests gate                                      |
| All CLI smoke tests pass                    | tier1/integration gate                                     |
| All generated Gherkin parses                | tier1/gherkin-validity gate                                |
| No stale snapshots                          | tier1/snapshot-freshness gate                              |
| Build succeeds                              | tier1/build gate                                           |
| Conventional Commit messages                | tier1/commit-lint gate                                     |
| No high/critical dependency vulnerabilities | security/snyk-sca gate                                     |
| No high SAST findings                       | security/snyk-sast gate                                    |
| No copyleft or unknown licenses             | security/snyk-license gate                                 |
| No committed secrets                        | security/secret-detection gate                             |
| No functions with complexity > 10           | quality/complexity gate                                    |
| CLI bundle within size budget               | quality/bundle-size gate                                   |
| No excessive new dependencies               | quality/dependency-audit gate                              |
| Changeset present if packages changed       | Changesets bot ([ADR-009](ADR-009-ci-testing-strategy.md)) |

## Consequences

What becomes easier:

- Claude Code gets unambiguous feedback on every push — green or red, with exact error locations. No context from previous sessions needed.

- Quality is enforced structurally. The agent doesn't need to be told to write tests or avoid secrets — the CI gate refuses code that doesn't meet the bar.

- Security scanning catches vulnerabilities, license issues, and committed secrets before they reach main. The agent learns to avoid insecure patterns through CI feedback, not instructions.

- Complexity thresholds enforce function decomposition. The agent produces smaller, testable functions because it can't merge complex ones.

- Dependency audit prevents supply chain sprawl — every pnpm add has visible cost.

- PR reports make the full quality surface visible at a glance — tests, coverage, security, complexity, bundle size, dependencies — all on the PR.

What becomes harder:

- Coverage thresholds require disciplined test writing for every code path, including error handling and edge cases. This adds time to every PR.

- Snyk SAST may produce false positives that require triage. A periodic dashboard review is needed.

- The dependency audit gate may require splitting large PRs. This is by design — smaller PRs are more reviewable.

- The "gates first" implementation order means the first commits are CI configuration, not application features.

## Alternatives Considered

1. Graduated security enforcement (informational first, blocking later) (rejected): Informational scans get ignored. The agent has no persistent memory of "fix this next session." If a finding doesn't block, it doesn't get fixed.

2. SonarQube for quality analysis (rejected): Adds infrastructure (server or cloud subscription) and a separate dashboard. ESLint complexity + Vitest coverage + bundle size scripts provide equivalent enforcement within GitHub Actions.

3. Allow coverage exclusion comments for generated code patterns (rejected): Exclusion comments create a slippery slope. Generated code (Langium output) is excluded via config-level coverage.exclude, not inline comments. The distinction is: config exclusions are reviewable in PRs; inline exclusions are invisible.

4. No dependency count gate (rejected): Without friction on dependency additions, an AI agent pulls in packages for trivial functionality. The gate creates a decision point: "is this dependency worth its supply chain cost?"

5. GitHub Dependabot + CodeQL instead of Snyk (rejected): Dependabot covers dependency vulnerabilities but not SAST, license compliance, or container scanning. CodeQL's TypeScript support is less mature than Snyk Code. Snyk provides SCA, SAST, and license in a single tool with unified PR reporting.
