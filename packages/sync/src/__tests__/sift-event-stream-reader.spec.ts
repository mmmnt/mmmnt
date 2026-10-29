import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SiftEventStreamReader } from '../services/sift-event-stream-reader.js';
import {
  IMPLEMENTATION_FEEDBACK_LOG,
  PUSH_FLOW_LOG,
  SYNC_STATE_LOG,
} from '../infrastructure/jsonl-sync-log-store.js';

const envelope = (eventType: string, payload: Record<string, unknown>): string =>
  JSON.stringify({ productSource: 'sift', eventType, payload });

function domainDir(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'sift-reader-'));
  for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), content);
  return dir;
}

describe('SiftEventStreamReader', () => {
  const contextLine = envelope('BoundedContextDefined', {
    contextName: 'Orders',
    classification: 'Core',
  });

  it('replays Sift events from every stream in .domain/', () => {
    const result = new SiftEventStreamReader().read(
      domainDir({ 'orders.jsonl': contextLine + '\n' }),
    );
    expect(result.errors).toEqual([]);
    expect(result.eventsProcessed).toBe(1);
    expect(result.filesRead).toBe(1);
    expect(result.input.buildingBlocks.map((b) => b.contextName)).toEqual(['Orders']);
  });

  it("skips Moment's own sync logs, which share .domain/ but are not Sift events (ADR-039)", () => {
    const syncLine = JSON.stringify({ type: 'ProposalRecorded', id: 'prop-0123456789abcdef' });
    const result = new SiftEventStreamReader().read(
      domainDir({
        'orders.jsonl': contextLine + '\n',
        [SYNC_STATE_LOG]: syncLine + '\n',
        [IMPLEMENTATION_FEEDBACK_LOG]: syncLine + '\n',
        [PUSH_FLOW_LOG]: syncLine + '\n',
      }),
    );
    expect(result.errors).toEqual([]);
    expect(result.filesRead).toBe(1);
    expect(result.eventsProcessed).toBe(1);
  });

  it('still reports a line that is not a Sift event in a stream file', () => {
    const result = new SiftEventStreamReader().read(
      domainDir({
        'orders.jsonl':
          JSON.stringify({ productSource: 'quorum', eventType: 'X', payload: {} }) + '\n',
      }),
    );
    expect(result.errors).toEqual([
      expect.stringContaining('Expected productSource "sift", got "quorum"'),
    ]);
  });

  it('reports a directory holding only sync logs as having no streams', () => {
    const result = new SiftEventStreamReader().read(domainDir({ [SYNC_STATE_LOG]: '{}\n' }));
    expect(result.errors).toEqual(['No .jsonl files found in .domain/']);
  });
});
