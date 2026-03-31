/**
 * moment auth status — ADR-026
 */

import { readStoredTokenResult, getDefaultCredentialsPath } from '../auth/token-storage.js';

export interface AuthStatusResult {
  readonly success: boolean;
  readonly message: string;
  readonly authenticated: boolean;
}

export async function runAuthStatus(credentialsPath?: string): Promise<AuthStatusResult> {
  const result = await readStoredTokenResult(credentialsPath);

  if (result.status === 'insecure') {
    return {
      success: false,
      message:
        `Credentials found at ${result.path} but permissions are too open.\n` +
        '  Run `chmod 600 ' +
        result.path +
        '` or `moment auth login` to fix.',
      authenticated: false,
    };
  }

  if (result.status === 'missing') {
    return {
      success: true,
      message: 'Not authenticated. Run `moment auth login` to authenticate.',
      authenticated: false,
    };
  }

  const stored = result.credentials;
  const masked = stored.token.slice(0, 4) + '****' + stored.token.slice(-4);
  const path = credentialsPath ?? getDefaultCredentialsPath();

  return {
    success: true,
    message: `Authenticated\n  Token: ${masked} (${stored.scope})\n  Stored at: ${path}\n  Created: ${stored.createdAt}`,
    authenticated: true,
  };
}
