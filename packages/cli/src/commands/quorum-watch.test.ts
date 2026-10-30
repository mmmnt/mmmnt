import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { createServer, type Server, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  chmodSync,
} from 'node:fs';
import { join } from 'node:path';
import { homedir, tmpdir } from 'node:os';

// Credentials default to ~/.moment; point "home" at a temp dir so the developer's real files are
// never read or written.
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  const { mkdtempSync: mkdtemp } = await import('node:fs');
  const { join: joinPath } = await import('node:path');
  const home = mkdtemp(joinPath(actual.tmpdir(), 'quorum-home-'));
  return { ...actual, homedir: () => home };
});

import { runQuorumWatch } from './quorum-watch.js';
import { fetchStreamEntries, toComplaiEnvelope } from '../lib/quorum-client.js';

interface Recorded {
  url: string;
  auth: string | undefined;
}

const fakeHome = homedir();

let server: Server;
let baseUrl: string;
let requests: Recorded[];
let respond: (req: IncomingMessage) => { status: number; body: string };

beforeAll(async () => {
  server = createServer((req, res) => {
    requests.push({ url: req.url ?? '', auth: req.headers.authorization });
    const { status, body } = respond(req);
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(body);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  rmSync(fakeHome, { recursive: true, force: true });
});

const ENTRIES = [
  {
    id: 'e1',
    entryType: 'OrderPlaced',
    correlationId: 'c1',
    causationId: 'x0',
    timestamp: '2026-01-01T00:00:00.000Z',
    payload: { orderId: 'o1' },
  },
  { entryType: 'Note', content: 'hello' },
];

describe('moment quorum watch', () => {
  let outDir: string;
  const logs: string[] = [];
  const log = (m: string): void => {
    logs.push(m);
  };

  beforeEach(() => {
    requests = [];
    logs.length = 0;
    outDir = join(mkdtempSync(join(tmpdir(), 'quorum-watch-')), '.domain');
    process.env.QUORUM_TOKEN = 'jwt_test_token';
    process.env.QUORUM_SERVER_URL = baseUrl;
    respond = () => ({ status: 200, body: JSON.stringify(ENTRIES) });
  });

  afterEach(() => {
    delete process.env.QUORUM_TOKEN;
    delete process.env.QUORUM_SERVER_URL;
    rmSync(join(outDir, '..'), { recursive: true, force: true });
  });

  it('prints usage when no stream id is given', async () => {
    const result = await runQuorumWatch(['--once'], log);
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/^Usage: moment quorum watch <streamId>/);
    expect(requests).toEqual([]);
  });

  it('fails with guidance when no credentials are available', async () => {
    delete process.env.QUORUM_TOKEN;
    const result = await runQuorumWatch(['s1', '--once', '--out', outDir], log);
    expect(result.success).toBe(false);
    expect(result.message).toContain('No quorum credentials');
    expect(existsSync(outDir)).toBe(false);
  });

  it('refuses a stored credentials file that other users can read', async () => {
    delete process.env.QUORUM_TOKEN;
    const credPath = join(fakeHome, '.moment', 'quorum-credentials.json');
    mkdirSync(join(fakeHome, '.moment'), { recursive: true });
    writeFileSync(credPath, JSON.stringify({ token: 't', serverUrl: baseUrl }));
    chmodSync(credPath, 0o644);
    try {
      const result = await runQuorumWatch(['s1', '--once', '--out', outDir], log);
      expect(result.success).toBe(false);
      expect(result.message).toContain('permissions that are too open');
    } finally {
      rmSync(credPath, { force: true });
    }
  });

  it('--once materializes entries as envelope JSONL, advances the cursor, and sends the bearer token', async () => {
    const result = await runQuorumWatch(
      ['team/orders', '--once', '--out', outDir, '--source', 'sift'],
      log,
    );

    expect(result).toEqual({
      success: true,
      message: 'Fetched 2 new entries from team/orders.',
      appended: 2,
    });
    expect(requests).toEqual([
      {
        url: '/streams/team%2Forders/entries?start_pos=0&limit=100',
        auth: 'Bearer jwt_test_token',
      },
    ]);

    const lines = readFileSync(join(outDir, 'team-orders.jsonl'), 'utf-8').trim().split('\n');
    const [first, second] = lines.map((l) => JSON.parse(l) as Record<string, unknown>);
    expect(first).toEqual({
      eventId: 'e1',
      eventType: 'OrderPlaced',
      version: 1,
      productSource: 'sift',
      sessionId: 'ses_system_quorum_watch',
      causationEventIds: ['x0'],
      correlationId: 'c1',
      timestamp: '2026-01-01T00:00:00.000Z',
      payload: { orderId: 'o1' },
    });
    expect(second).toMatchObject({
      eventId: 'quorum-team/orders-1',
      eventType: 'Note',
      causationEventIds: [],
      correlationId: 'team/orders',
      payload: { content: 'hello' },
    });

    const cursor = JSON.parse(readFileSync(join(outDir, '.quorum-cursor.json'), 'utf-8'));
    expect(cursor).toEqual({ version: 1, cursors: { 'team/orders': 2 } });
    expect(logs[0]).toContain('+2 entries');
    expect(logs[0]).toContain('cursor 0 → 2');
  });

  it('resumes from the stored cursor and keeps other streams cursors', async () => {
    mkdirSync(outDir, { recursive: true });
    writeFileSync(
      join(outDir, '.quorum-cursor.json'),
      JSON.stringify({ version: 1, cursors: { s1: 5, other: 9 } }),
    );
    respond = () => ({ status: 200, body: JSON.stringify([ENTRIES[0]]) });

    const result = await runQuorumWatch(['s1', '--once', '--out', outDir], log);

    expect(result.message).toBe('Fetched 1 new entry from s1.');
    expect(requests[0].url).toBe('/streams/s1/entries?start_pos=5&limit=100');
    const cursor = JSON.parse(readFileSync(join(outDir, '.quorum-cursor.json'), 'utf-8'));
    expect(cursor.cursors).toEqual({ s1: 6, other: 9 });
  });

  it('reports zero entries without creating a stream file', async () => {
    respond = () => ({ status: 200, body: '[]' });
    const result = await runQuorumWatch(['s1', '--once', '--out', outDir], log);
    expect(result).toMatchObject({
      success: true,
      message: 'Fetched 0 new entries from s1.',
      appended: 0,
    });
    expect(existsSync(join(outDir, 's1.jsonl'))).toBe(false);
  });

  it('--server overrides the configured server URL', async () => {
    process.env.QUORUM_SERVER_URL = 'http://127.0.0.1:1';
    const result = await runQuorumWatch(
      ['s1', '--once', '--out', outDir, '--server', `${baseUrl}/`],
      log,
    );
    expect(result.success).toBe(true);
    expect(requests).toHaveLength(1);
  });

  it('fails on an HTTP error status', async () => {
    respond = () => ({ status: 401, body: '{"error":"unauthorized"}' });
    const result = await runQuorumWatch(['s1', '--once', '--out', outDir], log);
    expect(result.success).toBe(false);
    expect(result.message).toMatch(
      /^Error: HTTP 401 from http:\/\/127\.0\.0\.1:\d+\/streams\/s1\/entries/,
    );
  });

  it('fails when the response is not an array', async () => {
    respond = () => ({ status: 200, body: '{"entries":[]}' });
    const result = await runQuorumWatch(['s1', '--once', '--out', outDir], log);
    expect(result).toEqual({
      success: false,
      message: 'Error: Unexpected response shape (expected array)',
    });
  });

  it('fails with the network error when the server cannot be reached', async () => {
    process.env.QUORUM_SERVER_URL = 'http://127.0.0.1:1';
    const result = await runQuorumWatch(['s1', '--once', '--out', outDir], log);
    expect(result.success).toBe(false);
    expect(result.message).toContain('Failed to reach quorum at http://127.0.0.1:1/streams/s1');
  });

  it('without --once keeps polling on the interval and logs poll errors', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const errors: string[] = [];
    const onSpy = vi.spyOn(process, 'on');
    try {
      const result = await runQuorumWatch(['s1', '--out', outDir, '--interval', '10'], log, (m) =>
        errors.push(m),
      );
      expect(result).toEqual({ success: true, message: 'Watching s1 (cursor at 2).', appended: 2 });
      // The interval is clamped to at least one second.
      expect(logs).toContain('[quorum] watching s1 every 1000ms — Ctrl+C to stop');

      respond = () => ({ status: 503, body: '' });
      vi.advanceTimersByTime(1000);
      await vi.waitFor(() => expect(errors).toHaveLength(1));
      expect(errors[0]).toMatch(/^\[quorum\] poll error: HTTP 503/);
      expect(onSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function));
    } finally {
      // Stop the poll loop the command registered.
      const sigint = onSpy.mock.calls.find(([ev]) => ev === 'SIGINT')?.[1] as
        (() => void) | undefined;
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
      sigint?.();
      expect(exitSpy).toHaveBeenCalledWith(0);
      if (sigint) process.off('SIGINT', sigint);
      vi.useRealTimers();
      vi.restoreAllMocks();
    }
  });
});

describe('quorum client', () => {
  it('reports a non-Error fetch rejection by its string value', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue('socket hang up'));
    try {
      const result = await fetchStreamEntries({ serverUrl: 'http://q', token: 't' }, 's', 0, 10);
      expect(result).toEqual({
        ok: false,
        entries: [],
        error:
          'Failed to reach quorum at http://q/streams/s/entries?start_pos=0&limit=10: socket hang up',
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('defaults missing envelope fields', () => {
    const env = toComplaiEnvelope({}, 'stream', 3);
    expect(env).toMatchObject({
      eventId: 'quorum-stream-3',
      eventType: 'unknown',
      productSource: 'quorum',
      causationEventIds: [],
      correlationId: 'stream',
      payload: {},
    });
    expect(typeof env.timestamp).toBe('string');
  });
});
