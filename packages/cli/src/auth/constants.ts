/**
 * Auth constants — ADR-026
 *
 * Client ID is injected at build time via esbuild `define`.
 * GH_APP_CLIENT_ID environment secret is set in CI.
 * At runtime, MOMENT_GITHUB_CLIENT_ID env var is checked first (for dev/testing override).
 */

declare const __GH_APP_CLIENT_ID__: string;

export function getClientId(): string {
  // Runtime override for dev/testing
  if (process.env.MOMENT_GITHUB_CLIENT_ID) {
    return process.env.MOMENT_GITHUB_CLIENT_ID;
  }

  // Build-time injected value
  if (typeof __GH_APP_CLIENT_ID__ !== 'undefined' && __GH_APP_CLIENT_ID__) {
    return __GH_APP_CLIENT_ID__;
  }

  throw new Error(
    'GitHub App client ID not configured. ' +
      'Set MOMENT_GITHUB_CLIENT_ID or build with GH_APP_CLIENT_ID.',
  );
}

export const GITHUB_DEVICE_CODE_URL = 'https://github.com/login/device/code';
export const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
export const GITHUB_USER_URL = 'https://api.github.com/user';
export const TOKEN_SCOPE = 'repo';
