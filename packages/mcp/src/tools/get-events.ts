/**
 * moment_get_events — Read local Moment event signals from .complai/events/moment/.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { okResult, wrapTool } from './shared.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

interface GetEventsParams {
  projectDir: string;
  limit?: number;
  since?: string;
}

interface ParsedEvent {
  readonly timestamp: string;
  readonly [key: string]: unknown;
}

function readEventLines(eventDir: string): ParsedEvent[] {
  const files = readdirSync(eventDir).filter((f) => f.endsWith('.jsonl')).sort();
  const events: ParsedEvent[] = [];

  for (const file of files) {
    const content = readFileSync(join(eventDir, file), 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const parsed = JSON.parse(trimmed) as ParsedEvent;
        if (parsed.timestamp) events.push(parsed);
      } catch {
        /* skip malformed lines */
      }
    }
  }

  return events;
}

function filterAndSort(events: ParsedEvent[], since: string | undefined, limit: number): ParsedEvent[] {
  let filtered = events;
  if (since) {
    filtered = filtered.filter((e) => e.timestamp >= since);
  }
  filtered.sort((a, b) => (b.timestamp > a.timestamp ? 1 : -1));
  return filtered.slice(0, limit);
}

async function getEventsImpl(params: GetEventsParams): Promise<CallToolResult> {
  const resolvedDir = resolve(params.projectDir);
  const eventDir = join(resolvedDir, '.complai', 'events', 'moment');

  if (!existsSync(eventDir)) {
    return okResult({ success: true, eventCount: 0, events: [] });
  }

  const allEvents = readEventLines(eventDir);
  const limit = params.limit ?? 50;
  const result = filterAndSort(allEvents, params.since, limit);

  return okResult({
    success: true,
    eventCount: result.length,
    events: result,
  });
}

export const getEvents = wrapTool(getEventsImpl);
