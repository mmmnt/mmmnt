import { describe, it, expect } from 'vitest';
import type {
  VizSessionConfig,
  VizDataEnvelope,
  VizEnvelopeMetadata,
  VizTransmissionEvent,
  VizInitialLoad,
  VizIncrementalUpdate,
  VizSessionClose,
  ContextMapLayout,
  TimelineLayout,
} from '../index.js';

describe('VizDataEnvelope contracts', () => {
  it('VizSessionConfig has required session identity fields', () => {
    const config: VizSessionConfig = {
      sessionId: 'sess-001',
      specificationName: 'ordering',
      startedAt: '2026-03-31T00:00:00Z',
    };

    expect(config.sessionId).toBe('sess-001');
    expect(config.specificationName).toBe('ordering');
    expect(config.startedAt).toBeTruthy();
  });

  it('VizDataEnvelope contains contextMap + timeline + metadata', () => {
    const envelope: VizDataEnvelope = {
      sessionId: 'sess-001',
      timestamp: '2026-03-31T00:00:00Z',
      version: 1,
      contextMap: { nodes: [], edges: [], dimensions: { width: 0, height: 0 } },
      timeline: { lanes: [], entries: [], connections: [], dimensions: { width: 0, height: 0 } },
      metadata: {
        contextCount: 2,
        flowCount: 3,
        relationshipCount: 1,
        generatedAt: '2026-03-31T00:00:00Z',
      },
    };

    expect(envelope.version).toBe(1);
    expect(envelope.contextMap).toBeDefined();
    expect(envelope.timeline).toBeDefined();
    expect(envelope.metadata.contextCount).toBe(2);
  });

  it('VizTransmissionEvent discriminates on type field', () => {
    const initial: VizInitialLoad = {
      type: 'viz:initial-load',
      session: {
        sessionId: 'sess-001',
        specificationName: 'ordering',
        startedAt: '2026-03-31T00:00:00Z',
      },
      envelope: {
        sessionId: 'sess-001',
        timestamp: '2026-03-31T00:00:00Z',
        version: 1,
        contextMap: { nodes: [], edges: [], dimensions: { width: 0, height: 0 } },
        timeline: { lanes: [], entries: [], connections: [], dimensions: { width: 0, height: 0 } },
        metadata: {
          contextCount: 0,
          flowCount: 0,
          relationshipCount: 0,
          generatedAt: '2026-03-31T00:00:00Z',
        },
      },
    };

    const update: VizIncrementalUpdate = {
      type: 'viz:incremental-update',
      sessionId: 'sess-001',
      envelope: initial.envelope,
      changedFiles: ['ordering.moment'],
    };

    const close: VizSessionClose = {
      type: 'viz:session-close',
      sessionId: 'sess-001',
      closedAt: '2026-03-31T01:00:00Z',
      reason: 'user-initiated',
    };

    // Discriminated union works via type field
    const events: VizTransmissionEvent[] = [initial, update, close];
    expect(events[0].type).toBe('viz:initial-load');
    expect(events[1].type).toBe('viz:incremental-update');
    expect(events[2].type).toBe('viz:session-close');
  });

  it('VizSessionConfig supports optional auth fields', () => {
    const config: VizSessionConfig = {
      sessionId: 'sess-002',
      specificationName: 'shipping',
      startedAt: '2026-03-31T00:00:00Z',
      endpoint: 'ws://localhost:3000/viz',
      authToken: 'tok_abc123',
    };

    expect(config.endpoint).toBe('ws://localhost:3000/viz');
    expect(config.authToken).toBe('tok_abc123');
  });
});
