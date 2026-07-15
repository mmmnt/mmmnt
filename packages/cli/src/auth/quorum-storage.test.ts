import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, statSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  storeQuorumToken,
  readQuorumCredentials,
  removeQuorumToken,
  getQuorumCredentialsPath,
  DEFAULT_QUORUM_SERVER_URL,
} from './quorum-storage.js';

describe('quorum-storage', () => {
  let tmpDir: string;
  let credPath: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'quorum-auth-test-'));
    credPath = join(tmpDir, '.moment', 'quorum-credentials.json');
    delete process.env.QUORUM_TOKEN;
    delete process.env.QUORUM_SERVER_URL;
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.QUORUM_TOKEN;
    delete process.env.QUORUM_SERVER_URL;
  });

  it('storeQuorumToken writes credentials with 0o600 permissions', async () => {
    const filePath = await storeQuorumToken('jwt_test', 'https://quorum.example', credPath);

    expect(filePath).toBe(credPath);
    const stored = JSON.parse(readFileSync(credPath, 'utf-8'));
    expect(stored.token).toBe('jwt_test');
    expect(stored.serverUrl).toBe('https://quorum.example');
    expect(stored.createdAt).toBeTruthy();

    const mode = statSync(credPath).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it('readQuorumCredentials round-trips stored credentials', async () => {
    await storeQuorumToken('jwt_roundtrip', 'https://quorum.example', credPath);

    const result = await readQuorumCredentials(credPath);

    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.source).toBe('file');
      expect(result.credentials.token).toBe('jwt_roundtrip');
      expect(result.credentials.serverUrl).toBe('https://quorum.example');
    }
  });

  it('QUORUM_TOKEN env takes precedence over the stored file', async () => {
    await storeQuorumToken('jwt_file', 'https://file.example', credPath);
    process.env.QUORUM_TOKEN = 'jwt_env';

    const result = await readQuorumCredentials(credPath);

    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.source).toBe('env');
      expect(result.credentials.token).toBe('jwt_env');
      expect(result.credentials.serverUrl).toBe(DEFAULT_QUORUM_SERVER_URL);
    }
  });

  it('QUORUM_SERVER_URL env overrides both env-token default and stored serverUrl', async () => {
    process.env.QUORUM_TOKEN = 'jwt_env';
    process.env.QUORUM_SERVER_URL = 'https://env.example';

    const envResult = await readQuorumCredentials(credPath);
    expect(envResult.status).toBe('ok');
    if (envResult.status === 'ok') {
      expect(envResult.credentials.serverUrl).toBe('https://env.example');
    }

    delete process.env.QUORUM_TOKEN;
    await storeQuorumToken('jwt_file', 'https://file.example', credPath);

    const fileResult = await readQuorumCredentials(credPath);
    expect(fileResult.status).toBe('ok');
    if (fileResult.status === 'ok') {
      expect(fileResult.credentials.serverUrl).toBe('https://env.example');
    }
  });

  it('returns missing when no file exists', async () => {
    const result = await readQuorumCredentials(join(tmpDir, 'nope.json'));
    expect(result.status).toBe('missing');
  });

  it('returns missing when stored file has no token', async () => {
    await storeQuorumToken('', 'https://quorum.example', credPath);
    const result = await readQuorumCredentials(credPath);
    expect(result.status).toBe('missing');
  });

  it('rejects group/world-readable credential files as insecure', async () => {
    await storeQuorumToken('jwt_insecure', 'https://quorum.example', credPath);
    chmodSync(credPath, 0o644);

    const result = await readQuorumCredentials(credPath);

    expect(result.status).toBe('insecure');
    if (result.status === 'insecure') {
      expect(result.path).toBe(credPath);
    }
  });

  it('removeQuorumToken deletes the file and reports absence', async () => {
    await storeQuorumToken('jwt_gone', 'https://quorum.example', credPath);

    expect(await removeQuorumToken(credPath)).toBe(true);
    expect(await removeQuorumToken(credPath)).toBe(false);
    expect((await readQuorumCredentials(credPath)).status).toBe('missing');
  });

  it('getQuorumCredentialsPath points at ~/.moment/quorum-credentials.json', () => {
    expect(getQuorumCredentialsPath()).toMatch(/\.moment[/\\]quorum-credentials\.json$/);
  });
});
