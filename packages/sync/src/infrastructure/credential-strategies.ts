/**
 * Credential strategies — ADR-025 implementations
 *
 * Each strategy resolves GitCredentials or returns undefined.
 * Subprocess strategies return undefined (not throw) when binary not found (CRED-02).
 */

import { execFile } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { CredentialStrategy, GitCredentials } from './credential-resolver.js';

function toGitHubToken(token: string): GitCredentials {
  return { username: 'x-access-token', password: token };
}

function execAsync(cmd: string, args: string[], input?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = execFile(cmd, args, { timeout: 5000 }, (err, stdout) => {
      if (err) return reject(err);
      resolve(stdout.trim());
    });
    if (input && proc.stdin) {
      proc.stdin.write(input);
      proc.stdin.end();
    }
  });
}

/** CRED-01: Checks MOMENT_GITHUB_TOKEN before GITHUB_TOKEN */
export class EnvCredentialStrategy implements CredentialStrategy {
  readonly name = 'environment-variable';

  async resolve(): Promise<GitCredentials | undefined> {
    const token = process.env.MOMENT_GITHUB_TOKEN ?? process.env.GITHUB_TOKEN;
    if (!token) return undefined;
    return toGitHubToken(token);
  }
}

/** CRED-02: Returns undefined when gh not installed */
export class GhCliCredentialStrategy implements CredentialStrategy {
  readonly name = 'gh-cli';

  async resolve(): Promise<GitCredentials | undefined> {
    try {
      const token = await execAsync('gh', ['auth', 'token']);
      if (!token) return undefined;
      return toGitHubToken(token);
    } catch {
      return undefined;
    }
  }
}

/** CRED-02: Returns undefined when git not installed */
export class GitCredentialHelperStrategy implements CredentialStrategy {
  readonly name = 'git-credential-helper';
  private readonly host: string;

  constructor(host = 'github.com') {
    this.host = host;
  }

  async resolve(): Promise<GitCredentials | undefined> {
    try {
      const input = `protocol=https\nhost=${this.host}\n\n`;
      const output = await execAsync('git', ['credential', 'fill'], input);

      const lines = output.split('\n');
      let username: string | undefined;
      let password: string | undefined;

      for (const line of lines) {
        if (line.startsWith('username=')) username = line.slice(9);
        if (line.startsWith('password=')) password = line.slice(9);
      }

      if (!username || !password) return undefined;
      return { username, password };
    } catch {
      return undefined;
    }
  }
}

export interface StoredCredentials {
  readonly token: string;
  readonly expiresAt?: string;
  readonly refreshToken?: string;
}

const CREDENTIALS_PATH = join(homedir(), '.moment', 'credentials.json');

/** CRED-04: Reads cached token with 0o600 permissions check */
export class OAuthDeviceFlowStrategy implements CredentialStrategy {
  readonly name = 'oauth-device-flow';
  private readonly credentialsPath: string;

  constructor(credentialsPath?: string) {
    this.credentialsPath = credentialsPath ?? CREDENTIALS_PATH;
  }

  async resolve(): Promise<GitCredentials | undefined> {
    try {
      const fileStat = await stat(this.credentialsPath);
      const mode = fileStat.mode & 0o777;
      if ((mode & 0o077) !== 0) return undefined;

      const raw = await readFile(this.credentialsPath, 'utf-8');
      const stored: StoredCredentials = JSON.parse(raw);

      if (!stored.token) return undefined;

      if (stored.expiresAt) {
        const expiresAt = new Date(stored.expiresAt);
        if (Number.isNaN(expiresAt.getTime()) || expiresAt < new Date()) {
          return undefined;
        }
      }

      return toGitHubToken(stored.token);
    } catch {
      return undefined;
    }
  }
}
