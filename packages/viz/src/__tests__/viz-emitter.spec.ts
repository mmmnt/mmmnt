import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { MomentParser } from '@mmmnt/core';
import { VizEmitter } from '../services/viz-emitter.js';
import type { VizSessionConfig } from '../types/index.js';

const FIXTURES = resolve(import.meta.dirname, '../../../../fixtures');
const VALID_FIXTURE = resolve(FIXTURES, 'valid/minimal/contexts/ordering.moment');

async function parseFixture() {
  const content = readFileSync(VALID_FIXTURE, 'utf-8');
  const parser = new MomentParser();
  const result = await parser.parseContent(content);
  return result.ir!;
}

describe('VizEmitter', () => {
  it('createEnvelope produces envelope with contextMap + timeline + metadata', async () => {
    const ir = await parseFixture();
    const emitter = new VizEmitter();

    const envelope = emitter.createEnvelope(ir, 'sess-001', 1);

    expect(envelope.sessionId).toBe('sess-001');
    expect(envelope.version).toBe(1);
    expect(envelope.contextMap).toBeDefined();
    expect(envelope.contextMap.nodes.length).toBeGreaterThan(0);
    expect(envelope.timeline).toBeDefined();
    expect(envelope.metadata.contextCount).toBeGreaterThan(0);
    expect(envelope.timestamp).toBeTruthy();
    expect(envelope.metadata.generatedAt).toBeTruthy();
  });

  it('createInitialLoad wraps envelope in initial-load event', async () => {
    const ir = await parseFixture();
    const emitter = new VizEmitter();

    const session: VizSessionConfig = {
      sessionId: 'sess-002',
      specificationName: 'ordering',
      startedAt: new Date().toISOString(),
    };

    const event = emitter.createInitialLoad(ir, session);

    expect(event.type).toBe('viz:initial-load');
    expect(event.session).toBe(session);
    expect(event.envelope.sessionId).toBe('sess-002');
    expect(event.envelope.version).toBe(1);
  });

  it('createIncrementalUpdate wraps envelope with changedFiles', async () => {
    const ir = await parseFixture();
    const emitter = new VizEmitter();

    const event = emitter.createIncrementalUpdate(ir, 'sess-003', 2, ['ordering.moment']);

    expect(event.type).toBe('viz:incremental-update');
    expect(event.sessionId).toBe('sess-003');
    expect(event.envelope.version).toBe(2);
    expect(event.changedFiles).toEqual(['ordering.moment']);
  });

  it('envelope metadata reflects IR dimensions', async () => {
    const ir = await parseFixture();
    const emitter = new VizEmitter();

    const envelope = emitter.createEnvelope(ir, 'sess-004', 1);

    expect(envelope.metadata.contextCount).toBe(ir.contexts.length);
    expect(envelope.metadata.flowCount).toBe(ir.flows.length);
    expect(envelope.metadata.relationshipCount).toBe(ir.relationships.length);
  });
});
