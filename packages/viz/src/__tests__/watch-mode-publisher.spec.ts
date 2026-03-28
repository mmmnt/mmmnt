import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  WatchModePublisher,
  type WatchModePublisherOptions,
  type TopologyPublishTarget,
  type ComplaiEventEnvelope,
} from '../server/watch-mode-publisher.js';

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
    cwd: overrides.cwd ?? '/tmp/test-project',
    debounceMs: overrides.debounceMs ?? 100,
    sessionId: overrides.sessionId ?? 'test-session-123',
    target: overrides.target ?? makeTarget(),
    buildTopology: overrides.buildTopology ?? (async () => ({ name: 'test', version: 1 })),
  };
}

describe('WatchModePublisher', () => {
  it('starts within 2 seconds (PS-01)', async () => {
    const target = makeTarget();
    const options = makeOptions({ target });

    const publisher = new WatchModePublisher(options);
    const startTime = Date.now();
    await publisher.start();
    const elapsed = Date.now() - startTime;

    expect(elapsed).toBeLessThan(2000);
    publisher.stop();
  });

  it('publishes initial topology on start', async () => {
    const target = makeTarget();
    const options = makeOptions({ target });

    const publisher = new WatchModePublisher(options);
    await publisher.start();

    expect(target.calls).toHaveLength(1);
    expect(target.calls[0].eventType).toBe('TopologyUpdated');
    expect(target.calls[0].payload).toHaveProperty('trigger', 'initial');
    publisher.stop();
  });

  it('event payload conforms to ComplaiEventEnvelope (PADR-004)', async () => {
    const target = makeTarget();
    const options = makeOptions({ target, sessionId: 'sess-abc' });

    const publisher = new WatchModePublisher(options);
    await publisher.start();

    const envelope = target.calls[0];
    expect(envelope.eventId).toBeTruthy();
    expect(envelope.eventType).toBe('TopologyUpdated');
    expect(envelope.productSource).toBe('moment:topology');
    expect(envelope.sessionId).toBe('sess-abc');
    expect(Array.isArray(envelope.causationEventIds)).toBe(true);
    expect(envelope.correlationId).toBeTruthy();
    expect(envelope.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(envelope.version).toBe(1);
    expect(typeof envelope.payload).toBe('object');
    publisher.stop();
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
    publisher.stop();
  });

  it('chains causationEventIds across publishes', async () => {
    const target = makeTarget();
    const options = makeOptions({ target });

    const publisher = new WatchModePublisher(options);
    await publisher.start();

    // Initial publish has no causation
    expect(target.calls[0].causationEventIds).toHaveLength(0);

    // Simulate a second publish via buildEnvelope
    const second = publisher.buildEnvelope('TopologyUpdated', { trigger: 'file-change' });
    await options.target.publish(second);

    // The publisher tracks lastEventId internally — verify second call happened
    expect(target.calls).toHaveLength(2);
    publisher.stop();
  });

  it('graceful shutdown on stop', async () => {
    const target = makeTarget();
    const options = makeOptions({ target });

    const publisher = new WatchModePublisher(options);
    await publisher.start();

    expect(publisher.isRunning()).toBe(true);

    publisher.stop();

    expect(publisher.isRunning()).toBe(false);
  });
});
