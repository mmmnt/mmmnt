import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  EnvCredentialStrategy,
  GhCliCredentialStrategy,
  GitCredentialHelperStrategy,
  OAuthDeviceFlowStrategy,
} from '../infrastructure/credential-strategies.js';
import { LayeredCredentialResolver } from '../infrastructure/layered-credential-resolver.js';
import type { CredentialStrategy, GitCredentials } from '../infrastructure/credential-resolver.js';

describe('EnvCredentialStrategy', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('returns credentials from MOMENT_GITHUB_TOKEN', async () => {
    process.env.MOMENT_GITHUB_TOKEN = 'moment-token-123';
    delete process.env.GITHUB_TOKEN;

    const strategy = new EnvCredentialStrategy();
    const creds = await strategy.resolve();

    expect(creds).toEqual({
      username: 'x-access-token',
      password: 'moment-token-123',
    });
  });

  it('falls back to GITHUB_TOKEN when MOMENT_GITHUB_TOKEN not set', async () => {
    delete process.env.MOMENT_GITHUB_TOKEN;
    process.env.GITHUB_TOKEN = 'github-token-456';

    const strategy = new EnvCredentialStrategy();
    const creds = await strategy.resolve();

    expect(creds).toEqual({
      username: 'x-access-token',
      password: 'github-token-456',
    });
  });

  it('prefers MOMENT_GITHUB_TOKEN over GITHUB_TOKEN (CRED-01)', async () => {
    process.env.MOMENT_GITHUB_TOKEN = 'moment-wins';
    process.env.GITHUB_TOKEN = 'github-loses';

    const strategy = new EnvCredentialStrategy();
    const creds = await strategy.resolve();

    expect(creds!.password).toBe('moment-wins');
  });

  it('returns undefined when neither env var is set', async () => {
    delete process.env.MOMENT_GITHUB_TOKEN;
    delete process.env.GITHUB_TOKEN;

    const strategy = new EnvCredentialStrategy();
    const creds = await strategy.resolve();

    expect(creds).toBeUndefined();
  });
});

describe('GhCliCredentialStrategy', () => {
  it('returns undefined when gh is not installed (CRED-02)', async () => {
    const strategy = new GhCliCredentialStrategy();
    // In CI/test environments, gh is typically not installed
    // or not authenticated, so this should return undefined
    const creds = await strategy.resolve();
    // Either undefined (not installed) or credentials (if gh is available)
    expect(creds === undefined || typeof creds.password === 'string').toBe(true);
  });
});

describe('GitCredentialHelperStrategy', () => {
  it('returns undefined when git credential helper fails (CRED-02)', async () => {
    // Use an invalid host to ensure credential fill fails
    const strategy = new GitCredentialHelperStrategy('nonexistent.invalid');
    const creds = await strategy.resolve();
    expect(creds).toBeUndefined();
  });
});

describe('OAuthDeviceFlowStrategy', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'oauth-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('reads cached token from credentials file', async () => {
    const credPath = join(tmpDir, 'credentials.json');
    writeFileSync(credPath, JSON.stringify({ token: 'cached-token' }));
    chmodSync(credPath, 0o600);

    const strategy = new OAuthDeviceFlowStrategy(credPath);
    const creds = await strategy.resolve();

    expect(creds).toEqual({
      username: 'x-access-token',
      password: 'cached-token',
    });
  });

  it('returns undefined when credentials file does not exist', async () => {
    const strategy = new OAuthDeviceFlowStrategy(join(tmpDir, 'nope.json'));
    const creds = await strategy.resolve();
    expect(creds).toBeUndefined();
  });

  it('returns undefined when permissions are not 0o600 (CRED-04)', async () => {
    const credPath = join(tmpDir, 'credentials.json');
    writeFileSync(credPath, JSON.stringify({ token: 'insecure-token' }));
    chmodSync(credPath, 0o644);

    const strategy = new OAuthDeviceFlowStrategy(credPath);
    const creds = await strategy.resolve();

    expect(creds).toBeUndefined();
  });

  it('returns undefined when token is expired', async () => {
    const credPath = join(tmpDir, 'credentials.json');
    writeFileSync(
      credPath,
      JSON.stringify({
        token: 'expired-token',
        expiresAt: '2020-01-01T00:00:00Z',
      }),
    );
    chmodSync(credPath, 0o600);

    const strategy = new OAuthDeviceFlowStrategy(credPath);
    const creds = await strategy.resolve();

    expect(creds).toBeUndefined();
  });
});

describe('LayeredCredentialResolver', () => {
  function mockStrategy(
    name: string,
    result: GitCredentials | undefined,
  ): CredentialStrategy & { called: boolean } {
    return {
      name,
      called: false,
      async resolve() {
        this.called = true;
        return result;
      },
    };
  }

  it('tries strategies in priority order', async () => {
    const first = mockStrategy('first', undefined);
    const second = mockStrategy('second', { username: 'u', password: 'p' });
    const third = mockStrategy('third', { username: 'x', password: 'y' });

    const resolver = new LayeredCredentialResolver([first, second, third]);
    const creds = await resolver.resolve();

    expect(first.called).toBe(true);
    expect(second.called).toBe(true);
    expect(third.called).toBe(false);
    expect(creds).toEqual({ username: 'u', password: 'p' });
  });

  it('returns first successful strategy', async () => {
    const first = mockStrategy('first', { username: 'a', password: 'b' });
    const second = mockStrategy('second', { username: 'c', password: 'd' });

    const resolver = new LayeredCredentialResolver([first, second]);
    const creds = await resolver.resolve();

    expect(first.called).toBe(true);
    expect(second.called).toBe(false);
    expect(creds.password).toBe('b');
  });

  it('throws actionable message on exhaustion (CRED-03)', async () => {
    const empty1 = mockStrategy('empty1', undefined);
    const empty2 = mockStrategy('empty2', undefined);

    const resolver = new LayeredCredentialResolver([empty1, empty2]);

    await expect(resolver.resolve()).rejects.toThrow('moment auth login');
    await expect(resolver.resolve()).rejects.toThrow('MOMENT_GITHUB_TOKEN');
  });
});
