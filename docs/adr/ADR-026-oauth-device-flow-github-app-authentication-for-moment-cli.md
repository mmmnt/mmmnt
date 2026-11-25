# ADR-026: OAuth Device Flow — GitHub App Authentication for Moment CLI

Migrated from Confluence page 44990466 (version 1, last updated 2026-03-31), https://winnovation.atlassian.net/wiki/spaces/MMMNT/pages/44990466. The Confluence space is private; this file is now the record.

This page cites the credential resolution ADR by its old number, ADR-025. That ADR is now [ADR-035](ADR-035-cli-credential-resolution-layered-git-authentication.md), and those links point there.

- **Status:** Proposed
- **Date:** 2026-03-31
- **Author:** Claude (AI agent session)
- **Scope:** @mmmnt/cli, @mmmnt/sync
- **Supersedes:** None
- **Relates to:** [ADR-025](ADR-035-cli-credential-resolution-layered-git-authentication.md) (CLI Credential Resolution), PADR-009-PLAT (Cascade Execution Infrastructure)

## Context

[ADR-025](ADR-035-cli-credential-resolution-layered-git-authentication.md) established a layered credential resolver with four strategies. Strategy 4 (OAuth device flow) requires a cached token at ~/.moment/credentials.json, but no mechanism exists to obtain that token. The moment auth login command and the underlying OAuth exchange are unimplemented.

The OAuth device flow requires:

- A GitHub OAuth App registered by the Moment team (provides client_id)

- A CLI command (moment auth login) that performs the device authorization grant

- Token storage, refresh, and expiry management

Without this, the only credential paths are environment variables and gh auth token — both require manual setup. First-time onboarding has no guided path.

### Why Device Flow

GitHub supports several OAuth grant types. Device flow (RFC 8628) is the correct choice for CLI tools because:

- No redirect URI needed (CLI has no web server)

- No client secret needed (safe to embed client_id in shipped binary)

- User authenticates in their browser, not the terminal

- GitHub CLI (gh) uses this exact pattern

## Decision

### 1. GitHub OAuth App Registration

The Moment team registers a GitHub OAuth App:

- App name: Moment CLI

- Homepage URL: https://github.com/mmmnt/mmmnt

- Authorization callback URL: (not used for device flow, set to homepage)

- Enable Device Flow: checked

This produces a client_id. No client_secret is used (device flow is a public client).

The client_id is embedded in the CLI source code. This is safe — device flow is designed for public clients per RFC 8628.

### 2. moment auth login Command

```
$ moment auth login

Moment CLI needs permission to access your GitHub repositories.

1. Open https://github.com/login/device in your browser
2. Enter code: ABCD-1234

Waiting for authorization...
✓ Authenticated as @username
  Token stored at ~/.moment/credentials.json
```

### 3. Device Flow Implementation

#### Step 1: Request Device Code

```
POST https://github.com/login/device/code
Content-Type: application/json
Accept: application/json

{
  "client_id": "<MOMENT_CLIENT_ID>",
  "scope": "repo"
}
```

Response:

```
{
  "device_code": "...",
  "user_code": "ABCD-1234",
  "verification_uri": "https://github.com/login/device",
  "expires_in": 900,
  "interval": 5
}
```

#### Step 2: Display Code and Poll

Display user_code and verification_uri to the user. Poll the token endpoint at the specified interval:

```
POST https://github.com/login/oauth/access_token
Content-Type: application/json
Accept: application/json

{
  "client_id": "<MOMENT_CLIENT_ID>",
  "device_code": "...",
  "grant_type": "urn:ietf:params:oauth:grant-type:device_code"
}
```

Poll responses:

- authorization_pending — keep polling

- slow_down — increase interval by 5 seconds

- expired_token — device code expired, restart

- access_denied — user denied, abort

- Success — returns access_token

#### Step 3: Store Token

```
interface StoredCredentials {
  readonly token: string;
  readonly tokenType: string;
  readonly scope: string;
  readonly createdAt: string;
}
```

Written to ~/.moment/credentials.json with 0o600 permissions. Directory ~/.moment/ created with 0o700 if not exists.

### 4. Token Scope

Request repo scope only. This grants:

- Read/write access to repositories (needed for clone/push/pull)

- Access to private repositories

Do NOT request broader scopes (admin:org, user, etc.).

### 5. moment auth status Command

```
$ moment auth status

✓ Authenticated as @username
  Token: ghp_****abcd (repo scope)
  Stored at: ~/.moment/credentials.json
```

### 6. moment auth logout Command

```
$ moment auth logout

✓ Token removed from ~/.moment/credentials.json
```

Deletes the credential file. Does NOT revoke the token on GitHub (user can do that in Settings > Applications).

### 7. Client ID Configuration

The client_id is stored as a constant in the CLI source:

```
// packages/cli/src/auth/constants.ts
export const GITHUB_CLIENT_ID = '<registered-client-id>';
export const GITHUB_DEVICE_CODE_URL = 'https://github.com/login/device/code';
export const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
```

For development/testing, MOMENT_GITHUB_CLIENT_ID env var overrides the embedded value.

### 8. Integration with CredentialResolver

OAuthDeviceFlowStrategy ([ADR-025](ADR-035-cli-credential-resolution-layered-git-authentication.md)) already reads from ~/.moment/credentials.json. No changes needed — moment auth login writes to the same file.

## Consequences

### What becomes easier

- First-time onboarding: guided moment auth login

- No manual token generation in GitHub Settings

- Consistent auth model across all users

### What becomes harder

- GitHub OAuth App must be registered and maintained

- Client ID embedded in source (rotation requires new release)

- Token has no automatic expiry (GitHub OAuth tokens are long-lived)

### What this enables

- Complete credential chain ([ADR-025](ADR-035-cli-credential-resolution-layered-git-authentication.md) strategy 4 becomes functional)

- moment sync propose with push capability

- Future: moment auth login --org for org-scoped tokens

## Alternatives Considered

### 1. GitHub Personal Access Token only (rejected)

Require users to manually create a PAT in GitHub Settings. Rejected: poor onboarding experience, users must navigate GitHub UI, select correct scopes, copy-paste token.

### 2. GitHub App installation token (rejected for CLI)

Use a GitHub App with installation tokens. Rejected for CLI context: installation tokens require a server-side exchange (App private key), which the CLI doesn't have. Correct for cloud context (PADR-009-PLAT), wrong for CLI.

### 3. Web-based OAuth with localhost redirect (rejected)

Start a local HTTP server, redirect browser back to localhost. Rejected: port conflicts, firewall issues, more complex than device flow, and device flow is the standard for CLI tools.

## Setup Guide (for team)

### Registering the GitHub OAuth App

- Go to https://github.com/settings/developers (or org settings)

- Click "New OAuth App"

- Fill in:

- Application name: Moment CLI

- Homepage URL: https://github.com/mmmnt/mmmnt

- Authorization callback URL: https://github.com/mmmnt/mmmnt

- Click "Register application"

- On the app page, check "Enable Device Flow"

- Copy the Client ID (do NOT copy the client secret)

- Set the client ID in packages/cli/src/auth/constants.ts

### Testing the Flow

```
# Override client ID for testing
export MOMENT_GITHUB_CLIENT_ID=Ov23li...

# Run auth login
moment auth login

# Verify
moment auth status
cat ~/.moment/credentials.json
```

## Cascade Impact

| ADR                                                                        | Impact                                             |
| -------------------------------------------------------------------------- | -------------------------------------------------- |
| [ADR-025](ADR-035-cli-credential-resolution-layered-git-authentication.md) | OAuthDeviceFlowStrategy becomes fully functional   |
| [ADR-024](ADR-024-git-artifact-retrieval-trees-api-semantic-index.md)      | GitRemoteManager can authenticate via stored token |

## Version History

| Version | Date       | Changes          |
| ------- | ---------- | ---------------- |
| 0.1     | 2026-03-31 | Initial proposal |
