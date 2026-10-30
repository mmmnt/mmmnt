/**
 * moment auth quorum — register a quorum substrate identity (spike scope).
 *
 * Stores a JWT bearer token + server URL for the quorum event-stream
 * substrate. Browser PKCE / device flow against the quorum broker is future
 * work (ADR-037 backlog); for now the token is supplied directly
 * (`--token`, or QUORUM_TOKEN in the environment for ephemeral use).
 *
 *   moment auth quorum --token <jwt> [--server <url>]
 *   moment auth quorum --logout
 */

import { parseArgs } from 'node:util';
import {
  storeQuorumToken,
  removeQuorumToken,
  DEFAULT_QUORUM_SERVER_URL,
} from '../auth/quorum-storage.js';

export interface AuthQuorumResult {
  readonly success: boolean;
  readonly message: string;
}

export async function runAuthQuorum(argv: string[]): Promise<AuthQuorumResult> {
  const { values } = parseArgs({
    args: argv,
    options: {
      token: { type: 'string' },
      server: { type: 'string' },
      logout: { type: 'boolean' },
    },
    strict: false,
  });

  if (values.logout === true) {
    const removed = await removeQuorumToken();
    return {
      success: true,
      message: removed ? 'Quorum credentials removed.' : 'No quorum credentials stored.',
    };
  }

  const token = typeof values.token === 'string' ? values.token : undefined;
  if (!token) {
    return {
      success: false,
      message:
        'Usage: moment auth quorum --token <jwt> [--server <url>] | --logout\n' +
        '  (or set QUORUM_TOKEN / QUORUM_SERVER_URL in the environment)',
    };
  }

  const serverUrl = typeof values.server === 'string' ? values.server : DEFAULT_QUORUM_SERVER_URL;
  const path = await storeQuorumToken(token, serverUrl);
  const masked = token.slice(0, 4) + '****' + token.slice(-4);

  return {
    success: true,
    message: `Quorum identity stored\n  Token: ${masked}\n  Server: ${serverUrl}\n  Stored at: ${path}`,
  };
}
