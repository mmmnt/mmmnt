import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import {
  WatchModePublisher,
  type WatchModePublisherOptions,
  type TopologyPublishTarget,
  type ComplaiEventEnvelope,
} from '../server/watch-mode-publisher.js';

const TEST_DIR = join(process.cwd(), '.test-publisher-tmp');

function makeTarget(): TopologyPublishTarget & { calls: ComplaiEventEnvelope[] } {
  const calls: ComplaiEventEnvelope[] = [];
  return {
    calls,
    async publish(envelope: ComplaiEventEnvelope) {
      calls.push(envelope);
    },
  };
}

function makeOptions(
  overrides: Partial<WatchModePublisherOptions> = {},
): WatchModePublisherOptions {
  return {
    watchPatterns: overrides.watchPatterns ?? ['**/*.moment'],
    cwd: overrides.cwd ?? TEST_DIR,
    debounceMs: overrides.debounceMs ?? 100,
    sessionId: overrides.sessionId ?? 'test-session-123',
    target: overrides.target ?? makeTarget(),
    buildTopology: overrides.buildTopology ?? (async () => ({ name: 'test', version: 1 })),
    onError: overrides.onError,
  };
}

describe('WatchModePublisher', () => {
  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    await new Promise((r) => setTimeout(r, 50));
    try {
      rmSync(TEST_DIR, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('starts within 2 seconds (PS-01)', async () => {
    const target = makeTarget();
    const options = makeOptions({ target });

    const publisher = new WatchModePublisher(options);
    const startTime = Date.now();
    await publisher.start();
    const elapsed = Date.now() - startTime;

    expect(elapsed).toBeLessThan(2000);
    await publisher.stop();
  });

  it('publishes initial topology on start', async () => {
    const target = makeTarget();
    const options = makeOptions({ target });

    const publisher = new WatchModePublisher(options);
    await publisher.start();

    expect(target.calls).toHaveLength(1);
    expect(target.calls[0].eventType).toBe('TopologyUpdated');
    expect(target.calls[0].payload).toHaveProperty('trigger', 'initial');
    await publisher.stop();
  });

  it('event payload conforms to ComplaiEventEnvelope (PADR-004)', async () => {
    const target = makeTarget();
    const options = makeOptions({ target, sessionId: 'sess-abc' });

    const publisher = new WatchModePublisher(options);
    await publisher.start();

    const envelope = target.calls[0];
    expect(envelope.eventId).toBeTruthy();
    expect(typeof envelope.eventId).toBe('string');
    expect(envelope.eventType).toBe('TopologyUpdated');
    expect(envelope.productSource).toBe('moment:topology');
    expect(envelope.sessionId).toBe('sess-abc');
    expect(Array.isArray(envelope.causationEventIds)).toBe(true);
    expect(envelope.correlationId).toBeTruthy();
    expect(typeof envelope.correlationId).toBe('string');
    expect(envelope.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(envelope.version).toBe(1);
    expect(typeof envelope.payload).toBe('object');
    expect(envelope.payload).not.toBeNull();
    await publisher.stop();
  });

  it('pushes topology with productSource moment:topology', async () => {
    const target = makeTarget();
    const topology = { lanes: [], frames: [], connections: [] };
    const options = makeOptions({
      target,
      buildTopology: async () => topology,
    });

    const publisher = new WatchModePublisher(options);
    await publisher.start();

    expect(target.calls[0].productSource).toBe('moment:topology');
    expect(target.calls[0].payload).toMatchObject(topology);
    await publisher.stop();
  });

  it('chains causationEventIds across publishes', async () => {
    const target = makeTarget();
    const options = makeOptions({ target });

    const publisher = new WatchModePublisher(options);
    await publisher.start();

    // Initial publish has no causation
    expect(target.calls[0].causationEventIds).toHaveLength(0);
    const firstEventId = target.calls[0].eventId;

    // Build a second envelope — should chain to first event
    const second = publisher.buildEnvelope('TopologyUpdated', { trigger: 'file-change' });
    expect(second.causationEventIds).toContain(firstEventId);

    await publisher.stop();
  });

  it('graceful shutdown stops watcher and clears queue', async () => {
    const target = makeTarget();
    const options = makeOptions({ target });

    const publisher = new WatchModePublisher(options);
    await publisher.start();

    expect(publisher.isRunning()).toBe(true);

    await publisher.stop();

    expect(publisher.isRunning()).toBe(false);
  });

  it('queues changes that arrive during publish and drains them', async () => {
    const target = makeTarget();
    let buildCount = 0;
    const options = makeOptions({
      target,
      buildTopology: async () => {
        buildCount++;
        if (buildCount === 1) {
          await new Promise((r) => setTimeout(r, 50));
        }
        return { build: buildCount };
      },
    });

    const publisher = new WatchModePublisher(options);
    await publisher.start();
    expect(target.calls).toHaveLength(1);

    // Simulate file change via the internal API
    const p1 = (publisher as any).onFileChange('first.moment');
    const p2 = (publisher as any).onFileChange('second.moment');
    await p1;
    await p2;

    expect(target.calls.length).toBeGreaterThanOrEqual(2);
    await publisher.stop();
  });

  it('reports file-change publish errors via onError without crashing', async () => {
    const target = makeTarget();
    const onError = vi.fn();
    let callCount = 0;
    const options = makeOptions({
      target,
      onError,
      buildTopology: async () => {
        callCount++;
        if (callCount > 1) throw new Error('rebuild failed');
        return { ok: true };
      },
    });

    const publisher = new WatchModePublisher(options);
    await publisher.start();
    expect(target.calls).toHaveLength(1);

    await (publisher as any).onFileChange('bad.moment');

    expect(onError).toHaveBeenCalledWith(expect.any(Error));
    expect(publisher.isRunning()).toBe(true);
    await publisher.stop();
  });

  it('surfaces buildTopology errors via onError', async () => {
    const target = makeTarget();
    const onError = vi.fn();
    const options = makeOptions({
      target,
      onError,
      buildTopology: async () => {
        throw new Error('parse failed');
      },
    });

    const publisher = new WatchModePublisher(options);
    // start() will call publishTopology('initial') which throws
    // but the publisher catches it via onError and re-throws from start()
    await expect(publisher.start()).rejects.toThrow();
  });

  it('cleans up watcher if initial publish fails', async () => {
    const target = makeTarget();
    let publishCount = 0;
    const options = makeOptions({
      target: {
        async publish() {
          publishCount++;
          throw new Error('network down');
        },
      },
      onError: vi.fn(),
    });

    const publisher = new WatchModePublisher(options);

    await expect(publisher.start()).rejects.toThrow();
    expect(publisher.isRunning()).toBe(false);
  });
});
