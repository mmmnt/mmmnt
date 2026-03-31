import { describe, it, expect } from 'vitest';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { runViz } from './viz.js';

const FIXTURES = resolve(import.meta.dirname, '../../../../fixtures');
const VALID_FIXTURE = resolve(FIXTURES, 'valid/minimal/contexts/ordering.moment');
const INVALID_FIXTURE = resolve(FIXTURES, 'invalid/no-declaration.moment');

describe('moment viz', () => {
  it('valid spec emits VizDataEnvelope with context and flow counts', async () => {
    const result = await runViz([VALID_FIXTURE]);

    expect(result.success).toBe(true);
    expect(result.message).toContain('Viz envelope emitted');
    expect(result.event).toBeDefined();
    expect(result.event!.type).toBe('viz:initial-load');
    expect(result.event!.envelope.contextMap).toBeDefined();
    expect(result.event!.envelope.timeline).toBeDefined();
  });

  it('outputs envelope as JSON', async () => {
    const result = await runViz([VALID_FIXTURE]);

    expect(result.json).toBeDefined();
    const parsed = JSON.parse(result.json!);
    expect(parsed.type).toBe('viz:initial-load');
    expect(parsed.envelope.contextMap).toBeDefined();
  });

  it('invalid spec returns failure with parse diagnostics', async () => {
    const result = await runViz([INVALID_FIXTURE]);

    expect(result.success).toBe(false);
    expect(result.diagnostics.length).toBeGreaterThan(0);
  });

  it('no arguments returns failure with usage message', async () => {
    const result = await runViz([]);

    expect(result.success).toBe(false);
    expect(result.message).toContain('Usage:');
  });

  it('nonexistent path returns failure with file-not-found', async () => {
    const nonexistent = join(tmpdir(), 'nonexistent-viz-12345.moment');
    const result = await runViz([nonexistent]);

    expect(result.success).toBe(false);
    expect(result.message).toContain('File not found');
  });
});
