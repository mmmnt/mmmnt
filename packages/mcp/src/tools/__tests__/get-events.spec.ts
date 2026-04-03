import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getEvents } from '../get-events.js';

function parseContent(result: Awaited<ReturnType<typeof getEvents>>): Record<string, unknown> {
  return JSON.parse((result.content[0] as { text: string }).text);
}

describe('getEvents', () => {
  it('returns empty events when no events directory exists', async () => {
    const result = await getEvents({ projectDir: '/tmp/nonexistent-project-dir-xyz' });
    expect(result.isError).toBeUndefined();
    const data = parseContent(result);
    expect(data.success).toBe(true);
    expect(data.eventCount).toBe(0);
    expect(data.events).toEqual([]);
  });

  describe('with temp event files', () => {
    let tempDir: string;
    let eventDir: string;

    beforeEach(() => {
      tempDir = join(tmpdir(), `mcp-test-events-${Date.now()}`);
      eventDir = join(tempDir, '.complai', 'events', 'moment');
      mkdirSync(eventDir, { recursive: true });

      const events = [
        { timestamp: '2025-01-01T10:00:00Z', eventType: 'A', payload: {} },
        { timestamp: '2025-01-02T10:00:00Z', eventType: 'B', payload: {} },
        { timestamp: '2025-01-03T10:00:00Z', eventType: 'C', payload: {} },
      ];

      writeFileSync(
        join(eventDir, '2025-01-events.jsonl'),
        events.map((e) => JSON.stringify(e)).join('\n') + '\n',
      );
    });

    afterEach(() => {
      rmSync(tempDir, { recursive: true, force: true });
    });

    it('reads all events from JSONL files', async () => {
      const result = await getEvents({ projectDir: tempDir });
      const data = parseContent(result);
      expect(data.success).toBe(true);
      expect(data.eventCount).toBe(3);
    });

    it('respects the limit parameter', async () => {
      const result = await getEvents({ projectDir: tempDir, limit: 2 });
      const data = parseContent(result);
      expect(data.eventCount).toBe(2);
    });

    it('filters events by since parameter', async () => {
      const result = await getEvents({ projectDir: tempDir, since: '2025-01-02T00:00:00Z' });
      const data = parseContent(result);
      expect(data.eventCount).toBe(2);
    });

    it('sorts events newest-first', async () => {
      const result = await getEvents({ projectDir: tempDir });
      const data = parseContent(result);
      const events = data.events as Array<{ timestamp: string }>;
      expect(events[0].timestamp).toBe('2025-01-03T10:00:00Z');
      expect(events[2].timestamp).toBe('2025-01-01T10:00:00Z');
    });
  });
});
