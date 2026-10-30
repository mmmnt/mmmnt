/**
 * Minimal quorum substrate client (spike scope — promotion to a dedicated
 * @mmmnt/quorum package is backlog, pending the quorum integration ADR).
 *
 * Talks to the quorum core REST API:
 *   GET {server}/streams/{id}/entries?start_pos={n}&limit={n}
 * with a JWT bearer token. Uses Node 20 global fetch — zero dependencies.
 */

import { readQuorumCredentials } from '../auth/quorum-storage.js';

/** Quorum event envelope as returned by the core REST API. */
export interface QuorumEntry {
  readonly id?: string;
  readonly correlationId?: string;
  readonly causationId?: string;
  readonly timestamp?: string;
  readonly entryType?: string;
  readonly payload?: Record<string, unknown>;
  readonly content?: string;
  readonly tokenSize?: number;
}

export interface QuorumClientResult {
  readonly ok: boolean;
  readonly entries: QuorumEntry[];
  readonly error?: string;
}

export interface QuorumConnection {
  readonly serverUrl: string;
  readonly token: string;
}

export async function resolveQuorumConnection(
  serverOverride?: string,
): Promise<QuorumConnection | { error: string }> {
  const creds = await readQuorumCredentials();
  if (creds.status === 'insecure') {
    return { error: `Quorum credentials file has permissions that are too open (${creds.path}).` };
  }
  if (creds.status === 'missing') {
    return {
      error: 'No quorum credentials. Run `moment auth quorum --token <jwt>` or set QUORUM_TOKEN.',
    };
  }
  return {
    serverUrl: serverOverride ?? creds.credentials.serverUrl,
    token: creds.credentials.token,
  };
}

export async function fetchStreamEntries(
  conn: QuorumConnection,
  streamId: string,
  startPos: number,
  limit = 100,
): Promise<QuorumClientResult> {
  const url = `${conn.serverUrl.replace(/\/$/, '')}/streams/${encodeURIComponent(streamId)}/entries?start_pos=${startPos}&limit=${limit}`;
  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${conn.token}`,
        Accept: 'application/json',
      },
    });
    if (!res.ok) {
      return { ok: false, entries: [], error: `HTTP ${res.status} from ${url}` };
    }
    const body: unknown = await res.json();
    if (!Array.isArray(body)) {
      return { ok: false, entries: [], error: 'Unexpected response shape (expected array)' };
    }
    return { ok: true, entries: body as QuorumEntry[] };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, entries: [], error: `Failed to reach quorum at ${url}: ${msg}` };
  }
}

/**
 * Map a quorum envelope to the ComplaiEventEnvelope JSONL shape that
 * .domain/ consumers (SiftEventStreamReader, ADR-028) already read.
 */
export function toComplaiEnvelope(
  entry: QuorumEntry,
  streamId: string,
  position: number,
  productSource = 'quorum',
): Record<string, unknown> {
  return {
    eventId: entry.id ?? `quorum-${streamId}-${position}`,
    eventType: entry.entryType ?? 'unknown',
    version: 1,
    productSource,
    sessionId: 'ses_system_quorum_watch',
    causationEventIds: entry.causationId ? [entry.causationId] : [],
    correlationId: entry.correlationId ?? streamId,
    timestamp: entry.timestamp ?? new Date().toISOString(),
    payload: entry.payload ?? (entry.content !== undefined ? { content: entry.content } : {}),
  };
}
