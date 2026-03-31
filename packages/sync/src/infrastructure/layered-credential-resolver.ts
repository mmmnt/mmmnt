/**
 * LayeredCredentialResolver — Composes strategies in priority order (ADR-025)
 *
 * CRED-03: Throws with actionable message when all strategies are exhausted.
 */

import type {
  CredentialResolver,
  CredentialStrategy,
  GitCredentials,
} from './credential-resolver.js';

export class LayeredCredentialResolver implements CredentialResolver {
  private readonly strategies: readonly CredentialStrategy[];

  constructor(strategies: readonly CredentialStrategy[]) {
    this.strategies = strategies;
  }

  async resolve(): Promise<GitCredentials> {
    for (const strategy of this.strategies) {
      const creds = await strategy.resolve();
      if (creds) return creds;
    }

    throw new Error(
      'No git credentials found. ' +
        'Run `moment auth login` or set MOMENT_GITHUB_TOKEN ' +
        'to authenticate with GitHub.',
    );
  }
}
