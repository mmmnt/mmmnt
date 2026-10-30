import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { chmodSync, existsSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Every auth command defaults to files under ~/.moment; point "home" at a temp dir so the
// developer's real credentials are never read, written or removed.
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  const { mkdtempSync } = await import('node:fs');
  const { join: joinPath } = await import('node:path');
  const home = mkdtempSync(joinPath(actual.tmpdir(), 'auth-home-'));
  return { ...actual, homedir: () => home };
});

import { homedir } from 'node:os';
import { runAuthLogin } from './auth-login.js';
import { runAuthLogout } from './auth-logout.js';
import { runAuthQuorum } from './auth-quorum.js';
import { runAuthStatus } from './auth-status.js';
import { storeToken } from '../auth/token-storage.js';

const home = homedir();
const githubCreds = join(home, '.moment', 'credentials.json');
const quorumCreds = join(home, '.moment', 'quorum-credentials.json');

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  delete process.env.QUORUM_TOKEN;
  delete process.env.QUORUM_SERVER_URL;
  process.env.MOMENT_GITHUB_CLIENT_ID = 'test-client-id';
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
});

afterEach(() => {
  rmSync(join(home, '.moment'), { recursive: true, force: true });
  delete process.env.MOMENT_GITHUB_CLIENT_ID;
  delete process.env.QUORUM_TOKEN;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('moment auth login', () => {
  const deviceCode = {
    device_code: 'dc_1',
    user_code: 'WXYZ-0001',
    verification_uri: 'https://github.com/login/device',
    expires_in: 60,
    interval: 0,
  };

  it('runs the device flow, stores the token, and names the GitHub user', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(deviceCode))
      .mockResolvedValueOnce(jsonResponse({ error: 'authorization_pending' }))
      .mockResolvedValueOnce(
        jsonResponse({ access_token: 'gho_abcdef123456', token_type: 'bearer', scope: 'repo' }),
      )
      .mockResolvedValueOnce(jsonResponse({ login: 'octocat' }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await runAuthLogin();

    expect(result.success).toBe(true);
    expect(result.username).toBe('octocat');
    expect(result.message).toBe(`Authenticated as @octocat\n  Token stored at ${githubCreds}`);
    expect(console.log).toHaveBeenCalledWith('2. Enter code: WXYZ-0001\n');
    // One progress dot per poll.
    expect(process.stdout.write).toHaveBeenCalledTimes(2);
    expect(JSON.parse(readFileSync(githubCreds, 'utf-8')).token).toBe('gho_abcdef123456');
    expect(fetchMock.mock.calls[3][1]).toEqual({
      headers: { Authorization: 'Bearer gho_abcdef123456' },
    });
  });

  it('still succeeds without a username when the user lookup fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse(deviceCode))
        .mockResolvedValueOnce(
          jsonResponse({ access_token: 'gho_x', token_type: 'bearer', scope: 'repo' }),
        )
        .mockResolvedValueOnce(jsonResponse({ message: 'Bad credentials' }, 401)),
    );
    const result = await runAuthLogin();
    expect(result.success).toBe(true);
    expect(result.username).toBeUndefined();
    expect(result.message).toBe(`Authenticated\n  Token stored at ${githubCreds}`);
  });

  it('still succeeds when the user lookup cannot reach GitHub', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse(deviceCode))
        .mockResolvedValueOnce(
          jsonResponse({ access_token: 'gho_x', token_type: 'bearer', scope: 'repo' }),
        )
        .mockRejectedValueOnce(new TypeError('fetch failed')),
    );
    const result = await runAuthLogin();
    expect(result.success).toBe(true);
    expect(result.message).toMatch(/^Authenticated\n/);
  });

  it('fails with the HTTP error when GitHub rejects the device code request', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(new Response('bad client', { status: 400 })),
    );
    const result = await runAuthLogin();
    expect(result).toEqual({ success: false, message: 'HTTP 400: bad client' });
    expect(existsSync(githubCreds)).toBe(false);
  });

  it.each([
    ['access_denied', 'Authorization denied by user.'],
    ['expired_token', 'Device code expired. Please try again.'],
    ['bogus', 'Unexpected error: bogus'],
  ])('fails with a clear message when polling returns %s', async (error, message) => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse(deviceCode))
        .mockResolvedValueOnce(jsonResponse({ error })),
    );
    const result = await runAuthLogin();
    expect(result).toEqual({ success: false, message });
  });

  it('reports an unexpected poll body without an error code as unknown', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse(deviceCode))
        .mockResolvedValueOnce(jsonResponse({})),
    );
    expect(await runAuthLogin()).toEqual({ success: false, message: 'Unexpected error: unknown' });
  });

  it('fails when the device code has already expired', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(jsonResponse({ ...deviceCode, expires_in: 0 })),
    );
    expect(await runAuthLogin()).toEqual({
      success: false,
      message: 'Device code expired. Please try again.',
    });
  });

  it('fails without a client id instead of calling GitHub', async () => {
    delete process.env.MOMENT_GITHUB_CLIENT_ID;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const result = await runAuthLogin();
    expect(result.success).toBe(false);
    expect(result.message).toContain('GitHub App client ID not configured');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports a non-Error failure by its string value', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce('offline'));
    expect(await runAuthLogin()).toEqual({ success: false, message: 'offline' });
  });
});

describe('moment auth logout', () => {
  it('removes stored GitHub credentials', async () => {
    await storeToken('gho_x', 'bearer', 'repo');
    expect(await runAuthLogout()).toEqual({ success: true, message: 'Token removed.' });
    expect(existsSync(githubCreds)).toBe(false);
  });

  it('reports already logged out when nothing is stored', async () => {
    expect(await runAuthLogout()).toEqual({
      success: true,
      message: 'No credentials found. Already logged out.',
    });
  });
});

describe('moment auth quorum', () => {
  it('stores the token with the default server and masks it in the message', async () => {
    const result = await runAuthQuorum(['--token', 'jwt_1234567890']);
    expect(result.success).toBe(true);
    expect(result.message).toBe(
      `Quorum identity stored\n  Token: jwt_****7890\n  Server: http://localhost:3000\n  Stored at: ${quorumCreds}`,
    );
    const stored = JSON.parse(readFileSync(quorumCreds, 'utf-8'));
    expect(stored).toMatchObject({ token: 'jwt_1234567890', serverUrl: 'http://localhost:3000' });
    expect(statSync(quorumCreds).mode & 0o777).toBe(0o600);
  });

  it('stores a custom server URL', async () => {
    const result = await runAuthQuorum([
      '--token',
      'jwt_abcdefgh',
      '--server',
      'https://q.example',
    ]);
    expect(result.message).toContain('Server: https://q.example');
    expect(JSON.parse(readFileSync(quorumCreds, 'utf-8')).serverUrl).toBe('https://q.example');
  });

  it('prints usage without a token', async () => {
    const result = await runAuthQuorum([]);
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/^Usage: moment auth quorum --token <jwt>/);
    expect(existsSync(quorumCreds)).toBe(false);
  });

  it('--logout removes stored credentials, and says so when there are none', async () => {
    await runAuthQuorum(['--token', 'jwt_abcdefgh']);
    expect(await runAuthQuorum(['--logout'])).toEqual({
      success: true,
      message: 'Quorum credentials removed.',
    });
    expect(existsSync(quorumCreds)).toBe(false);
    expect(await runAuthQuorum(['--logout'])).toEqual({
      success: true,
      message: 'No quorum credentials stored.',
    });
  });
});

describe('moment auth status', () => {
  it('reports both identities as not authenticated when nothing is stored', async () => {
    const result = await runAuthStatus();
    expect(result.success).toBe(true);
    expect(result.authenticated).toBe(false);
    expect(result.message).toContain('GitHub: not authenticated');
    expect(result.message).toContain('Quorum: not authenticated');
  });

  it('reports stored GitHub credentials at the default path and a stored quorum identity', async () => {
    await storeToken('gho_abcdefgh', 'bearer', 'repo');
    await runAuthQuorum(['--token', 'jwt_12345678', '--server', 'https://q.example']);
    const result = await runAuthStatus();
    expect(result.authenticated).toBe(true);
    expect(result.message).toContain('Token: gho_****efgh (repo)');
    expect(result.message).toContain(`Stored at: ${githubCreds}`);
    expect(result.message).toContain(
      'Quorum: authenticated (stored)\n  Token: jwt_****5678\n  Server: https://q.example',
    );
  });

  it('labels a quorum token from the environment', async () => {
    process.env.QUORUM_TOKEN = 'jwt_envtoken';
    const result = await runAuthStatus();
    expect(result.message).toContain('Quorum: authenticated (environment)');
  });

  it('flags a quorum credentials file with open permissions', async () => {
    await runAuthQuorum(['--token', 'jwt_12345678']);
    chmodSync(quorumCreds, 0o644);
    const result = await runAuthStatus();
    expect(result.message).toContain(
      `Quorum: credentials at ${quorumCreds} have permissions that are too open`,
    );
  });
});
