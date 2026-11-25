# ADR-011: Environment Variable & Secrets Manifest

Migrated from Confluence page 13238274 (version 3, last updated 2026-03-10), https://winnovation.atlassian.net/wiki/spaces/MMMNT/pages/13238274. The Confluence space is private; this file is now the record.

- **Status:** Accepted
- **Date:** March 9, 2026
- **Deciders:** listenrightmeow, Claude (DDD Coaching Project)
- **Tags:** ci, secrets, environment, github-actions, snyk, npm, turborepo, xray
- **Related ADRs:** [ADR-009](ADR-009-ci-testing-strategy.md) (CI & Testing Strategy), [ADR-010](ADR-010-quality-gates-enforcement.md) (Quality Gates & Enforcement), [ADR-014](ADR-014-qms-test-management-xray-integration.md) (QMS Test Management — Xray Integration)

## Context

[ADR-009](ADR-009-ci-testing-strategy.md) and [ADR-010](ADR-010-quality-gates-enforcement.md) define the CI pipeline, quality gates, and publishing workflow for the Moment monorepo. Both ADRs reference service integrations — npm, Snyk, GitHub Actions, Turborepo — that require tokens, secrets, and configuration variables. [ADR-014](ADR-014-qms-test-management-xray-integration.md) adds Xray Test Management integration for QMS compliance, introducing two additional secrets for CI-driven test result import. This ADR enumerates every required secret, where it's stored, how it's provisioned, and what breaks when it's missing.

This ADR serves as that manifest. It is a living document — updated whenever a new service integration is added to the CI pipeline or local development toolchain.

## Decision

### 1. GitHub Actions Secrets (Repository Level)

These secrets are configured in GitHub → Repository → Settings → Secrets and variables → Actions → Repository secrets.

| Secret Name        | Source                                                                               | Used By                                                                                                                         | Purpose                                                                                  | Rotation                |
| ------------------ | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------- |
| NPM_TOKEN          | npm account listenrightmeeow → Access Tokens → Generate New Token (type: Automation) | Release workflow ([ADR-009](ADR-009-ci-testing-strategy.md) §6)                                                                 | Publishes @mmmnt/\* packages to npm registry. Automation token type bypasses 2FA for CI. | Annual or on compromise |
| SNYK_TOKEN         | Snyk Dashboard → Settings → General → Auth Token (or Service Account token for org)  | CI workflow — security/snyk-sca, security/snyk-sast, security/snyk-license ([ADR-010](ADR-010-quality-gates-enforcement.md) §9) | Authenticates Snyk CLI for dependency scanning, SAST, and license compliance checks      | Annual or on compromise |
| XRAY_CLIENT_ID     | Xray Cloud → Settings → API Keys → Generate                                          | CI workflow — Xray JUnit + Cucumber import steps ([ADR-014](ADR-014-qms-test-management-xray-integration.md))                   | Client ID half of Xray API key pair. Exchanged for bearer token on each CI run.          | Annual or on compromise |
| XRAY_CLIENT_SECRET | Xray Cloud → Settings → API Keys → Generate (paired with Client ID)                  | CI workflow — Xray JUnit + Cucumber import steps ([ADR-014](ADR-014-qms-test-management-xray-integration.md))                   | Client secret half of Xray API key pair. Never logged, never echoed.                     | Annual or on compromise |

Total repository secrets: 4

Important: GITHUB_TOKEN is not listed here because it is automatically provided by GitHub Actions to every workflow run. It does not need to be created or stored as a repository secret. See §2 for its permission configuration.

### 2. GitHub Actions Permissions (Workflow Level)

These are declared in the workflow YAML, not stored as secrets. They control what the auto-provisioned GITHUB_TOKEN can do.

| Permission    | Value | Workflow | Purpose                                                                                                                      |
| ------------- | ----- | -------- | ---------------------------------------------------------------------------------------------------------------------------- |
| contents      | write | Release  | Changesets creates version bump commits and tags on main                                                                     |
| pull-requests | write | Release  | Changesets opens and updates "Version Packages" PRs                                                                          |
| id-token      | write | Release  | OIDC token for npm provenance attestation ([ADR-009](ADR-009-ci-testing-strategy.md) §6)                                     |
| checks        | write | CI       | dorny/test-reporter publishes test results as PR check annotations ([ADR-010](ADR-010-quality-gates-enforcement.md) §5)      |
| pull-requests | write | CI       | davelosert/vitest-coverage-report-action posts coverage summary comment ([ADR-010](ADR-010-quality-gates-enforcement.md) §5) |

Principle of least privilege: The CI workflow does not request contents: write. Only the Release workflow writes to the repository.

### 3. GitHub Repository Configuration

| Setting                   | Location                                      | Value                                                                                                                                                                                            | ADR Reference                                      |
| ------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| Branch protection on main | Settings → Branches → Branch protection rules | Required status checks (all 16 from [ADR-010](ADR-010-quality-gates-enforcement.md) §3), 1 required reviewer, dismiss stale reviews, require up-to-date branch, block force push, block deletion | [ADR-010](ADR-010-quality-gates-enforcement.md) §2 |
| Snyk GitHub Integration   | Snyk Dashboard → Integrations → GitHub        | Connect Snyk org to the moment repository for inline PR annotations                                                                                                                              | [ADR-010](ADR-010-quality-gates-enforcement.md) §9 |
| Changesets bot            | GitHub App or Actions workflow                | changesets/action@v1 runs on merge to main                                                                                                                                                       | [ADR-009](ADR-009-ci-testing-strategy.md) §7       |

### 4. Service Accounts & External Registrations

| Service    | Account / Org                                   | Owner                        | Provisioning Notes                                                                              |
| ---------- | ----------------------------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------- |
| npm        | Org: @mmmnt (free tier, public)                 | listenrightmeeow npm account | Create org at npmjs.com → Add Organization                                                      |
| Snyk       | Org: TBD (free tier covers open-source)         | listenrightmeow              | Create org at snyk.io. Import the moment GitHub repo.                                           |
| GitHub     | Repo: TBD (e.g., listenrightmeow/moment or org) | listenrightmeow              | Repository must have GitHub Actions enabled (default for public repos)                          |
| Xray Cloud | Jira project: MMMNT                             | listenrightmeow              | Install Xray app in Jira project. Generate API key pair under Xray Cloud → Settings → API Keys. |

### 5. Local Development Environment Variables

| Variable   | Required | Purpose                                                     | How to Set                                                                                              |
| ---------- | -------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| SNYK_TOKEN | Optional | Run snyk test / snyk code test locally to check before push | export SNYK_TOKEN=\<token> or add to .env.local (gitignored). Alternatively, authenticate via snyk auth |

No other local env vars required. The Moment toolchain runs entirely without environment configuration. Xray credentials are CI-only — no local development use case.

### 6. Turborepo Remote Cache (Deferred)

| Variable    | Purpose                                 |
| ----------- | --------------------------------------- |
| TURBO_TOKEN | Authentication for remote cache API     |
| TURBO_TEAM  | Team/org identifier for cache namespace |

Decision: Deferred to post-V1.

### 7. Variables NOT Used (Explicit Exclusions)

| Variable          | Why Not Used                                                                                                                  |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| CODECOV_TOKEN     | Coverage uses vitest-coverage-report-action, not Codecov ([ADR-010](ADR-010-quality-gates-enforcement.md) §5)                 |
| SONAR_TOKEN       | Quality uses ESLint + Vitest, not SonarQube ([ADR-010](ADR-010-quality-gates-enforcement.md))                                 |
| DOCKER_\*         | No Docker infrastructure. CLI is an npm package ([ADR-009](ADR-009-ci-testing-strategy.md) §3)                                |
| AWS_\*            | No cloud infrastructure. Moment is a local toolchain                                                                          |
| DATABASE_\*       | No database. Pure transformation pipeline                                                                                     |
| ANTHROPIC_API_KEY | No LLM integration in Moment. Sift uses Anthropic; Moment does not                                                            |
| VERCEL_TOKEN      | No Vercel deployment. moment viz uses local preview server ([ADR-007](ADR-007-visualization-hosting-local-preview-server.md)) |

### 8. Secret Hygiene

Gitleaks enforcement ([ADR-010](ADR-010-quality-gates-enforcement.md) §9): The .gitleaks.toml includes detection patterns for every secret type in this manifest: npm tokens, Snyk tokens (UUID), Xray client secrets (UUID), GitHub PATs (ghp_, ghs_, github_pat_), and generic high-entropy strings.

.env.local is gitignored. No .env.example committed — this ADR is the canonical reference.

### 9. CI Workflow Environment Blocks

CI Workflow (.github/workflows/ci.yml):

```
jobs:
  security:
    runs-on: ubuntu-latest
    permissions:
      checks: write
      pull-requests: write
    env:
      SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}

  xray-import:
    needs: [test]
    if: always()
    runs-on: ubuntu-latest
    env:
      XRAY_CLIENT_ID: ${{ secrets.XRAY_CLIENT_ID }}
      XRAY_CLIENT_SECRET: ${{ secrets.XRAY_CLIENT_SECRET }}
    steps:
      - name: Authenticate with Xray
        run: |
          TOKEN=$(curl -s -X POST \
            "https://xray.cloud.getxray.app/api/v2/authenticate" \
            -H "Content-Type: application/json" \
            -d "{\"client_id\":\"$XRAY_CLIENT_ID\",\"client_secret\":\"$XRAY_CLIENT_SECRET\"}" | tr -d '"')
          echo "XRAY_TOKEN=$TOKEN" >> $GITHUB_ENV
      - name: Import JUnit results
        run: |
          curl -X POST \
            "https://xray.cloud.getxray.app/api/v2/import/execution/junit" \
            -H "Authorization: Bearer $XRAY_TOKEN" \
            -H "Content-Type: application/xml" \
            -d @test-results/junit.xml
      - name: Import Cucumber results
        run: |
          curl -X POST \
            "https://xray.cloud.getxray.app/api/v2/import/execution/cucumber" \
            -H "Authorization: Bearer $XRAY_TOKEN" \
            -H "Content-Type: application/json" \
            -d @test-results/cucumber.json
```

Release Workflow (.github/workflows/release.yml):

```
jobs:
  release:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
      id-token: write
    steps:
      - uses: changesets/action@v1
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
```

### 10. Provisioning Checklist

- Create npm org — npmjs.com → Add Organization → name: mmmnt → Free tier

- Generate npm token — npmjs.com → Access Tokens → Type: Automation

- Create Snyk account/org — snyk.io → Sign up with GitHub

- Get Snyk token — Snyk Dashboard → Settings → Auth Token

- Create GitHub repository — Create the moment repo (public)

- Add GitHub secrets (npm + Snyk) — Repo → Settings → Secrets → Add NPM_TOKEN and SNYK_TOKEN

- Install Xray app — Jira project MMMNT → Apps → Install Xray Test Management

- Generate Xray API key — Xray Cloud → Settings → API Keys → Generate client ID + secret pair

- Add GitHub secrets (Xray) — Repo → Settings → Secrets → Add XRAY_CLIENT_ID and XRAY_CLIENT_SECRET

- Connect Snyk to GitHub — Snyk Dashboard → Integrations → GitHub → Import moment repo

- Configure branch protection — Repo → Settings → Branches → Add rule for main per [ADR-010](ADR-010-quality-gates-enforcement.md) §2

- Verify gitleaks config — Confirm .gitleaks.toml includes patterns from §8 (including Xray UUID pattern)

- Run first CI workflow — Push scaffolding PR, confirm all checks register

## Consequences

What becomes easier: Single page answers "what do I need before CI works?" Provisioning checklist provides implementation order. Explicit exclusions prevent wasted investigation. Workflow env blocks are copy-pasteable. Gitleaks patterns aligned with actual secrets.

What becomes harder: This ADR must be updated when new service integrations are added.

Drift mitigation: PRs adding ${{ secrets.\* }} references should update this ADR. Enforced via PR template "Security Impact" section ([ADR-010](ADR-010-quality-gates-enforcement.md) §7).

## Alternatives Considered

1. .env.example file (rejected): Most variables are CI-only secrets. .env.example files lack narrative context and become stale faster than ADRs.

2. GitHub Environments (rejected): Moment uses trunk-based development with one deployment target (npm publish). No staging/production distinction.

3. HashiCorp Vault / AWS Secrets Manager (rejected): Adds infrastructure dependency. GitHub's built-in secrets management is sufficient for 4 secrets.

\<!-- END_DOCUMENT -->
