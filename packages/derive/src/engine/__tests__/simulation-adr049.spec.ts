import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MomentParser } from '@mmmnt/core';
import { generateAllScenarios } from '../simulation-scenario-generator.js';

// ADR-049 D9: a sample payload takes a code set's first value, an empty map, and one member of an
// exclusive group; every other field is sampled as before.

const FIXTURE = resolve(
  import.meta.dirname,
  '../../../../../fixtures/valid/field-types/field-types.moment',
);

async function payloads(): Promise<Map<string, Record<string, unknown>>> {
  const result = await new MomentParser().parseContent(readFileSync(FIXTURE, 'utf8'));
  const ir = result.ir!;
  const [scenario] = generateAllScenarios(ir, ir.flows[0]);
  const out = new Map<string, Record<string, unknown>>();
  for (const e of scenario.events) out.set(e.eventType, e.payload as Record<string, unknown>);
  return out;
}

describe('ADR-049 sample payloads', () => {
  it('a code set samples its first value; a map samples {}', async () => {
    const replay = (await payloads()).get('ReplayCompleted')!;
    expect(replay.kind).toBe('Bootstrap');
    expect(replay.replayPoint).toEqual({});
    expect(replay.endPoint).toEqual({});
  });

  it('an inline code set on a command input samples its first value', async () => {
    expect((await payloads()).get('SimProcess.CompleteReplay')!.kind).toBe('Bootstrap');
  });

  it('only the first member of an exclusive group is written', async () => {
    const processed = (await payloads()).get('ReceiptProcessed')!;
    expect(processed.pointer).toBe('sample-pointer');
    expect('recordRef' in processed).toBe(false);
  });
});
