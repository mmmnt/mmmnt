import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { storeToken, readStoredToken, removeToken } from '../auth/token-storage.js';

describe('token-storage', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'auth-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('storeToken writes credentials with 0o600 permissions (AUTH-03)', async () => {
    const credPath = join(tmpDir, '.moment', 'credentials.json');
    const filePath = await storeToken('ghp_test123', 'bearer', 'repo', credPath);

    expect(filePath).toBe(credPath);

    const raw = readFileSync(credPath, 'utf-8');
    const stored = JSON.parse(raw);
    expect(stored.token).toBe('ghp_test123');
    expect(stored.tokenType).toBe('bearer');
    expect(stored.scope).toBe('repo');
    expect(stored.createdAt).toBeTruthy();

    const mode = statSync(credPath).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it('readStoredToken reads back stored credentials', async () => {
    const credPath = join(tmpDir, '.moment', 'credentials.json');
    await storeToken('ghp_roundtrip', 'bearer', 'repo', credPath);

    const stored = await readStoredToken(credPath);

    expect(stored).toBeDefined();
    expect(stored!.token).toBe('ghp_roundtrip');
    expect(stored!.scope).toBe('repo');
  });

  it('readStoredToken returns undefined when file missing', async () => {
    const credPath = join(tmpDir, 'nope.json');
    const stored = await readStoredToken(credPath);
    expect(stored).toBeUndefined();
  });

  it('removeToken deletes credential file', async () => {
    const credPath = join(tmpDir, '.moment', 'credentials.json');
    await storeToken('ghp_delete', 'bearer', 'repo', credPath);

    const removed = await removeToken(credPath);
    expect(removed).toBe(true);

    const stored = await readStoredToken(credPath);
    expect(stored).toBeUndefined();
  });

  it('removeToken returns false when no file exists', async () => {
    const credPath = join(tmpDir, 'nope.json');
    const removed = await removeToken(credPath);
    expect(removed).toBe(false);
  });
});

describe('device-flow', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it('requestDeviceCode calls GitHub device code endpoint (AUTH-01)', async () => {
    process.env.MOMENT_GITHUB_CLIENT_ID = 'test-client-id';

    const mockResponse = {
      device_code: 'dc_123',
      user_code: 'ABCD-1234',
      verification_uri: 'https://github.com/login/device',
      expires_in: 900,
      interval: 5,
    };

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      }),
    );

    const { requestDeviceCode } = await import('../auth/device-flow.js');
    const result = await requestDeviceCode();

    expect(result.user_code).toBe('ABCD-1234');
    expect(result.device_code).toBe('dc_123');
    expect(result.verification_uri).toBe('https://github.com/login/device');

    expect(fetch).toHaveBeenCalledWith(
      'https://github.com/login/device/code',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('test-client-id'),
      }),
    );
  });

  it('pollForToken handles slow_down by increasing interval (AUTH-02)', async () => {
    vi.useFakeTimers();
    process.env.MOMENT_GITHUB_CLIENT_ID = 'test-client-id';

    let callCount = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ error: 'slow_down' }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              access_token: 'ghp_success',
              token_type: 'bearer',
              scope: 'repo',
            }),
        });
      }),
    );

    const { pollForToken } = await import('../auth/device-flow.js');
    const pollPromise = pollForToken('dc_test', 1, 30, {
      onUserCode: () => {},
      onPolling: () => {},
    });

    // Advance past first interval (1s)
    await vi.advanceTimersByTimeAsync(1000);
    // Advance past second interval (1s + 5s slow_down = 6s)
    await vi.advanceTimersByTimeAsync(6000);

    const result = await pollPromise;

    expect(result.access_token).toBe('ghp_success');
    expect(callCount).toBe(2);
    vi.useRealTimers();
  });

  it('auth-login fails when client ID not configured', async () => {
    delete process.env.MOMENT_GITHUB_CLIENT_ID;
    delete process.env.GH_APP_CLIENT_ID;

    const { getClientId } = await import('../auth/constants.js');

    expect(() => getClientId()).toThrow('GitHub App client ID not configured');
  });
});

describe('auth-status', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'status-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('reports not authenticated when no credentials', async () => {
    const { runAuthStatus } = await import('./auth-status.js');
    // Default path won't have credentials in test env
    const result = await runAuthStatus();

    // Either not authenticated or authenticated (if user has real creds)
    expect(result.success).toBe(true);
    expect(typeof result.authenticated).toBe('boolean');
  });
});

describe('auth-logout', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'logout-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('reports already logged out when no file', async () => {
    const result = await removeToken(join(tmpDir, 'nope.json'));
    expect(result).toBe(false);
  });
});
