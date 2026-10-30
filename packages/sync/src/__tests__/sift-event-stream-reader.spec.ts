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

  it('accumulates every Sift building-block event into its context and aggregate', () => {
    const lines = [
      envelope('AggregateAdded', {
        contextName: 'Orders',
        aggregateName: 'Order',
        identityField: { name: 'orderId', type: 'UUID' },
      }),
      envelope('BoundedContextDefined', { contextName: 'Billing' }),
      envelope('CommandDefined', {
        contextName: 'Orders',
        aggregateName: 'Order',
        commandName: 'PlaceOrder',
        inputs: [{ name: 'sku', type: 'string' }],
        emitsEvent: 'OrderPlaced',
      }),
      envelope('EventDefined', {
        contextName: 'Orders',
        aggregateName: 'Order',
        eventName: 'OrderPlaced',
        fields: [
          { name: 'sku', type: 'string' },
          { name: 'code', type: 'string', deprecated: { reason: 'renamed', replacement: 'sku' } },
        ],
      }),
      envelope('ValueObjectDefined', {
        contextName: 'Orders',
        aggregateName: 'Order',
        voName: 'Money',
        fields: [{ name: 'amount', type: 'number' }],
      }),
      envelope('InvariantDefined', {
        contextName: 'Ledger',
        invariantId: 'inv-1',
        description: 'balanced',
        scope: 'context',
      }),
      envelope('PolicyDefined', {
        contextName: 'Shipping',
        policyName: 'ShipOnPay',
        trigger: 'Paid',
        action: 'Ship',
      }),
      envelope('SagaDefined', {
        contextName: 'Fulfilment',
        sagaName: 'Fulfil',
        trigger: 'OrderPlaced',
        states: ['started'],
        compensation: 'Cancel',
        timeout: '1h',
      }),
    ];

    const result = new SiftEventStreamReader().read(
      domainDir({ 'orders.jsonl': lines.join('\n') + '\n' }),
    );

    expect(result.errors).toEqual([]);
    expect(result.eventsProcessed).toBe(8);
    const blocks = result.input.buildingBlocks;
    expect(blocks.map((b) => b.contextName)).toEqual([
      'Orders',
      'Billing',
      'Ledger',
      'Shipping',
      'Fulfilment',
    ]);
    expect(blocks[1].classification).toBeUndefined();
    expect(blocks[0].aggregates).toEqual([
      {
        name: 'Order',
        identityField: { name: 'orderId', type: 'UUID' },
        commands: [
          {
            name: 'PlaceOrder',
            inputs: [{ name: 'sku', type: 'string' }],
            emitsEvent: 'OrderPlaced',
          },
        ],
        events: [
          {
            name: 'OrderPlaced',
            fields: [
              { name: 'sku', type: 'string' },
              {
                name: 'code',
                type: 'string',
                deprecated: { reason: 'renamed', replacement: 'sku' },
              },
            ],
          },
        ],
        valueObjects: [{ name: 'Money', fields: [{ name: 'amount', type: 'number' }] }],
      },
    ]);
  });

  it('reports a missing .domain directory', () => {
    const missing = join(tmpdir(), 'sift-reader-does-not-exist-' + process.pid);
    const result = new SiftEventStreamReader().read(missing);
    expect(result.errors).toEqual([`Directory not found: ${missing}`]);
    expect(result.filesRead).toBe(0);
    expect(result.input.buildingBlocks).toEqual([]);
  });

  it('reports lines missing an eventType or payload, and invalid JSON', () => {
    const result = new SiftEventStreamReader().read(
      domainDir({
        'orders.jsonl': [
          JSON.stringify({ productSource: 'sift', eventType: 'BoundedContextDefined' }),
          'not json',
          contextLine,
        ].join('\n'),
      }),
    );
    expect(result.eventsProcessed).toBe(1);
    expect(result.errors).toEqual([
      expect.stringMatching(/orders\.jsonl:1: Missing eventType or payload$/),
      expect.stringMatching(/orders\.jsonl:2: Invalid JSON$/),
    ]);
  });
});
