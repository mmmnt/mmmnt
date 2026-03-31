/**
 * moment auth status — ADR-026
 */

import { readStoredToken, getDefaultCredentialsPath } from '../auth/token-storage.js';

export interface AuthStatusResult {
  readonly success: boolean;
  readonly message: string;
  readonly authenticated: boolean;
}

export async function runAuthStatus(): Promise<AuthStatusResult> {
  const stored = await readStoredToken();

  if (!stored) {
    return {
      success: true,
      message: 'Not authenticated. Run `moment auth login` to authenticate.',
      authenticated: false,
    };
  }

  const masked = stored.token.slice(0, 4) + '****' + stored.token.slice(-4);
  const path = getDefaultCredentialsPath();

  return {
    success: true,
    message: `Authenticated\n  Token: ${masked} (${stored.scope})\n  Stored at: ${path}\n  Created: ${stored.createdAt}`,
    authenticated: true,
  };
}
