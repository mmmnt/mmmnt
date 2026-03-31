/**
 * CredentialResolver — Layered git authentication (ADR-025)
 *
 * Resolves GitHub credentials by trying strategies in priority order.
 * Strategies: env var → gh CLI → git credential helper → OAuth cache.
 */

export interface GitCredentials {
  readonly username: string;
  readonly password: string;
}

export interface CredentialStrategy {
  readonly name: string;
  resolve(): Promise<GitCredentials | undefined>;
}

export interface CredentialResolver {
  resolve(): Promise<GitCredentials>;
}
