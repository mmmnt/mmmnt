/**
 * Quorum credential storage — quorum substrate integration (spike).
 *
 * Quorum (the event-stream substrate) authenticates with JWT bearer tokens
 * (broker/Cognito issuers). Tokens are stored at
 * ~/.moment/quorum-credentials.json with 0o600 permissions — a separate file
 * from the GitHub credentials (ADR-026) so the two schemas evolve
 * independently. Environment variables QUORUM_TOKEN / QUORUM_SERVER_URL take
 * precedence over the stored file (CI/automation path).
 */

import { readFile, writeFile, mkdir, unlink, stat, chmod } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

export interface QuorumCredentials {
  readonly token: string;
  readonly serverUrl: string;
  readonly createdAt: string;
}

export type QuorumReadResult =
  | { status: 'ok'; credentials: QuorumCredentials; source: 'env' | 'file' }
  | { status: 'missing' }
  | { status: 'insecure'; path: string };

const QUORUM_CREDENTIALS_PATH = join(homedir(), '.moment', 'quorum-credentials.json');

export const DEFAULT_QUORUM_SERVER_URL = 'http://localhost:3000';

export async function storeQuorumToken(
  token: string,
  serverUrl: string,
  credentialsPath?: string,
): Promise<string> {
  const filePath = credentialsPath ?? QUORUM_CREDENTIALS_PATH;
  await mkdir(dirname(filePath), { recursive: true, mode: 0o700 });

  const stored: QuorumCredentials = {
    token,
    serverUrl,
    createdAt: new Date().toISOString(),
  };

  await writeFile(filePath, JSON.stringify(stored, null, 2) + '\n', {
    encoding: 'utf-8',
    mode: 0o600,
  });
  await chmod(filePath, 0o600);

  return filePath;
}

export async function readQuorumCredentials(credentialsPath?: string): Promise<QuorumReadResult> {
  // Environment wins — CI/automation and ephemeral sessions.
  const envToken = process.env.QUORUM_TOKEN;
  if (envToken) {
    return {
      status: 'ok',
      source: 'env',
      credentials: {
        token: envToken,
        serverUrl: process.env.QUORUM_SERVER_URL ?? DEFAULT_QUORUM_SERVER_URL,
        createdAt: 'env',
      },
    };
  }

  const filePath = credentialsPath ?? QUORUM_CREDENTIALS_PATH;
  try {
    const fileStat = await stat(filePath);
    if ((fileStat.mode & 0o077) !== 0) {
      return { status: 'insecure', path: filePath };
    }
    const stored: QuorumCredentials = JSON.parse(await readFile(filePath, 'utf-8'));
    if (!stored.token) return { status: 'missing' };
    return {
      status: 'ok',
      source: 'file',
      credentials: {
        ...stored,
        serverUrl: process.env.QUORUM_SERVER_URL ?? stored.serverUrl,
      },
    };
  } catch {
    return { status: 'missing' };
  }
}

export async function removeQuorumToken(credentialsPath?: string): Promise<boolean> {
  const filePath = credentialsPath ?? QUORUM_CREDENTIALS_PATH;
  try {
    await unlink(filePath);
    return true;
  } catch (error) {
    if (error && typeof error === 'object' && (error as NodeJS.ErrnoException).code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

export function getQuorumCredentialsPath(): string {
  return QUORUM_CREDENTIALS_PATH;
}
