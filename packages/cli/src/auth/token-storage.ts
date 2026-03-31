/**
 * Token storage — ADR-026
 *
 * Stores OAuth tokens at ~/.moment/credentials.json with 0o600 permissions.
 */

import { readFile, writeFile, mkdir, unlink, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

export interface StoredCredentials {
  readonly token: string;
  readonly tokenType: string;
  readonly scope: string;
  readonly createdAt: string;
}

const MOMENT_DIR = join(homedir(), '.moment');
const CREDENTIALS_PATH = join(MOMENT_DIR, 'credentials.json');

export async function storeToken(
  token: string,
  tokenType: string,
  scope: string,
  credentialsPath?: string,
): Promise<string> {
  const filePath = credentialsPath ?? CREDENTIALS_PATH;
  const dir = join(filePath, '..');

  // AUTH-03: Directory at 0o700, file at 0o600
  await mkdir(dir, { recursive: true, mode: 0o700 });

  const stored: StoredCredentials = {
    token,
    tokenType,
    scope,
    createdAt: new Date().toISOString(),
  };

  await writeFile(filePath, JSON.stringify(stored, null, 2) + '\n', {
    encoding: 'utf-8',
    mode: 0o600,
  });

  return filePath;
}

export async function readStoredToken(
  credentialsPath?: string,
): Promise<StoredCredentials | undefined> {
  const filePath = credentialsPath ?? CREDENTIALS_PATH;

  try {
    const fileStat = await stat(filePath);
    const mode = fileStat.mode & 0o777;
    if ((mode & 0o077) !== 0) return undefined;

    const raw = await readFile(filePath, 'utf-8');
    const stored: StoredCredentials = JSON.parse(raw);
    if (!stored.token) return undefined;
    return stored;
  } catch {
    return undefined;
  }
}

export async function removeToken(credentialsPath?: string): Promise<boolean> {
  const filePath = credentialsPath ?? CREDENTIALS_PATH;
  try {
    await unlink(filePath);
    return true;
  } catch {
    return false;
  }
}

export function getDefaultCredentialsPath(): string {
  return CREDENTIALS_PATH;
}
