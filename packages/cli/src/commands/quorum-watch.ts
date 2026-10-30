/**
 * moment quorum watch — subscribe to a quorum substrate stream (spike).
 *
 * Polls the quorum core REST API for new stream entries and materializes
 * them as ComplaiEventEnvelope JSONL under .domain/ — the exact format the
 * ADR-028 import path (SiftEventStreamReader) already consumes. Cursor
 * state persists at .domain/.quorum-cursor.json (mirrors the ADR-028
 * import-checkpoint semantics), so repeated invocations resume where the
 * last one stopped.
 *
 *   moment quorum watch <streamId> [--server <url>] [--out <dir>]
 *                        [--interval <ms>] [--once]
 */

import { parseArgs } from 'node:util';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  fetchStreamEntries,
  resolveQuorumConnection,
  toComplaiEnvelope,
  type QuorumConnection,
} from '../lib/quorum-client.js';

export interface QuorumWatchResult {
  readonly success: boolean;
  readonly message: string;
  readonly appended?: number;
}

interface CursorFile {
  version: 1;
  cursors: Record<string, number>;
}

function readCursor(cursorPath: string, streamId: string): number {
  try {
    const parsed = JSON.parse(readFileSync(cursorPath, 'utf-8')) as CursorFile;
    return parsed.cursors[streamId] ?? 0;
  } catch {
    return 0;
  }
}

function writeCursor(cursorPath: string, streamId: string, position: number): void {
  let file: CursorFile = { version: 1, cursors: {} };
  try {
    file = JSON.parse(readFileSync(cursorPath, 'utf-8')) as CursorFile;
  } catch {
    /* fresh cursor file */
  }
  file.cursors[streamId] = position;
  writeFileSync(cursorPath, JSON.stringify(file, null, 2) + '\n', 'utf-8');
}

function streamSlug(streamId: string): string {
  return streamId.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
}

async function pollOnce(
  conn: QuorumConnection,
  streamId: string,
  outDir: string,
  cursorPath: string,
  productSource: string,
  log: (msg: string) => void,
): Promise<{ appended: number; error?: string }> {
  const from = readCursor(cursorPath, streamId);
  const result = await fetchStreamEntries(conn, streamId, from);
  if (!result.ok) return { appended: 0, error: result.error };
  if (result.entries.length === 0) return { appended: 0 };

  const outFile = join(outDir, `${streamSlug(streamId)}.jsonl`);
  const lines = result.entries.map((entry, i) =>
    JSON.stringify(toComplaiEnvelope(entry, streamId, from + i, productSource)),
  );
  appendFileSync(outFile, lines.join('\n') + '\n', 'utf-8');
  writeCursor(cursorPath, streamId, from + result.entries.length);

  log(
    `[quorum] ${streamId}: +${result.entries.length} entries → ${outFile} (cursor ${from} → ${from + result.entries.length})`,
  );
  return { appended: result.entries.length };
}

interface WatchOptions {
  readonly streamId: string;
  readonly server?: string;
  readonly outDir: string;
  readonly intervalMs: number;
  readonly productSource: string;
  readonly once: boolean;
}

function parseWatchArgs(argv: string[]): WatchOptions | { usage: string } {
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      server: { type: 'string' },
      out: { type: 'string' },
      interval: { type: 'string' },
      source: { type: 'string' },
      once: { type: 'boolean' },
    },
    allowPositionals: true,
    strict: false,
  });

  const streamId = positionals[0];
  if (!streamId) {
    return {
      usage:
        'Usage: moment quorum watch <streamId> [--server <url>] [--out <dir>] [--interval <ms>] [--source <name>] [--once]',
    };
  }

  return {
    streamId,
    server: typeof values.server === 'string' ? values.server : undefined,
    outDir: resolve(typeof values.out === 'string' ? values.out : '.domain'),
    intervalMs:
      typeof values.interval === 'string' ? Math.max(1000, Number(values.interval)) : 5000,
    productSource: typeof values.source === 'string' ? values.source : 'quorum',
    once: values.once === true,
  };
}

export async function runQuorumWatch(
  argv: string[],
  log: (msg: string) => void = console.log,
  logError: (msg: string) => void = console.error,
): Promise<QuorumWatchResult> {
  const opts = parseWatchArgs(argv);
  if ('usage' in opts) return { success: false, message: opts.usage };
  const { streamId, outDir, intervalMs, productSource } = opts;

  const conn = await resolveQuorumConnection(opts.server);
  if ('error' in conn) return { success: false, message: `Error: ${conn.error}` };

  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const cursorPath = join(outDir, '.quorum-cursor.json');

  const first = await pollOnce(conn, streamId, outDir, cursorPath, productSource, log);
  if (first.error) return { success: false, message: `Error: ${first.error}` };

  if (opts.once) {
    return {
      success: true,
      message: `Fetched ${first.appended} new entr${first.appended === 1 ? 'y' : 'ies'} from ${streamId}.`,
      appended: first.appended,
    };
  }

  log(`[quorum] watching ${streamId} every ${intervalMs}ms — Ctrl+C to stop`);
  // Long-running poll loop; errors are logged and retried on the next tick.
  const timer = setInterval(() => {
    void pollOnce(conn, streamId, outDir, cursorPath, productSource, log).then((r) => {
      if (r.error) logError(`[quorum] poll error: ${r.error}`);
    });
  }, intervalMs);
  process.on('SIGINT', () => {
    clearInterval(timer);
    process.exit(0);
  });

  return {
    success: true,
    message: `Watching ${streamId} (cursor at ${readCursor(cursorPath, streamId)}).`,
    appended: first.appended,
  };
}
