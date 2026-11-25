# ADR-035: CLI Credential Resolution — Layered Git Authentication

Migrated from Confluence page 44957698 (version 2, last updated 2026-04-21), https://winnovation.atlassian.net/wiki/spaces/MMMNT/pages/44957698. The Confluence space is private; this file is now the record.

Page renumbered from ADR-025 to ADR-035 (2026-04-20) due to numbering collision with ADR-025: Translation Layer Architecture. Original content preserved below.

Note: This ADR was originally published as ADR-025 on 2026-03-31. It was renumbered to ADR-035 on 2026-04-20 because ADR-025 was subsequently assigned to the Translation Layer Architecture (page 67076117, registered 2026-04-17). All cross-references from [ADR-024](ADR-024-git-artifact-retrieval-trees-api-semantic-index.md) and [ADR-026](ADR-026-oauth-device-flow-github-app-authentication-for-moment-cli.md) should reference ADR-035.

(Original page content follows — unchanged except for the number in the title.)

[RECOVERED FROM PAGE HISTORY v1 — live page body was lost in the 2026-04-20 renumbering edit]

ADR-035 (orig ADR-025): CLI Credential Resolution — Layered Git Authentication (2026-03-31, Proposed).

Context: GitRemoteManager uses isomorphic-git (pure JS) which inherits no system git credentials (no SSH keys, credential helpers, gh tokens, .netrc, keychains).

Decision: LayeredCredentialResolver tries strategies in priority order, first success wins:

1. EnvCredentialStrategy — MOMENT_GITHUB_TOKEN then GITHUB_TOKEN; returns {username: 'x-access-token', password: token}.

2. GhCliCredentialStrategy — `gh auth token` subprocess.

3. GitCredentialStrategy — `git credential fill` subprocess (delegates to configured helper).

4. OAuthDeviceFlowStrategy — cached ~/.moment/credentials.json (0600); populated by `moment auth login` ([ADR-026](ADR-026-oauth-device-flow-github-app-authentication-for-moment-cli.md)); does not initiate the flow itself.

Resolver throws actionable error if all fail. LocalGitRemoteManager accepts CredentialResolver instead of per-call onAuth. Cloud uses GitHubAppCredentialStrategy (platform layer, same interface).

Rejected: manual token only; native git binary for all ops; direct SSH key reading.
