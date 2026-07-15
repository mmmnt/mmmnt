/**
 * moment auth status — ADR-026
 */

import { readStoredTokenResult, getDefaultCredentialsPath } from '../auth/token-storage.js';
import { readQuorumCredentials } from '../auth/quorum-storage.js';

export interface AuthStatusResult {
  readonly success: boolean;
  readonly message: string;
  readonly authenticated: boolean;
}

async function quorumStatusLine(): Promise<string> {
  const quorum = await readQuorumCredentials();
  if (quorum.status === 'ok') {
    const token = quorum.credentials.token;
    const masked = token.slice(0, 4) + '****' + token.slice(-4);
    const origin = quorum.source === 'env' ? 'environment' : 'stored';
    return `Quorum: authenticated (${origin})\n  Token: ${masked}\n  Server: ${quorum.credentials.serverUrl}`;
  }
  if (quorum.status === 'insecure') {
    return `Quorum: credentials at ${quorum.path} have permissions that are too open (chmod 600 to fix).`;
  }
  return 'Quorum: not authenticated. Run `moment auth quorum --token <jwt>` or set QUORUM_TOKEN.';
}

export async function runAuthStatus(credentialsPath?: string): Promise<AuthStatusResult> {
  const result = await readStoredTokenResult(credentialsPath);
  const quorumLine = await quorumStatusLine();

  if (result.status === 'insecure') {
    return {
      success: false,
      message:
        `Credentials found at ${result.path} but permissions are too open.\n` +
        '  Run `chmod 600 ' +
        result.path +
        '` or `moment auth login` to fix.\n' +
        quorumLine,
      authenticated: false,
    };
  }

  if (result.status === 'missing') {
    return {
      success: true,
      message: `GitHub: not authenticated. Run \`moment auth login\` to authenticate.\n${quorumLine}`,
      authenticated: false,
    };
  }

  const stored = result.credentials;
  const masked = stored.token.slice(0, 4) + '****' + stored.token.slice(-4);
  const path = credentialsPath ?? getDefaultCredentialsPath();

  return {
    success: true,
    message:
      `GitHub: authenticated\n  Token: ${masked} (${stored.scope})\n  Stored at: ${path}\n  Created: ${stored.createdAt}\n` +
      quorumLine,
    authenticated: true,
  };
}
