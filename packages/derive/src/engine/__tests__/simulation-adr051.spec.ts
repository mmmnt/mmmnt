import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MomentParser, type IntermediateRepresentation } from '@mmmnt/core';
import { generateSimulationScenario } from '../simulation-scenario-generator.js';
import { generatePolicyDefinitions } from '../policy-definitions-generator.js';

// ADR-051: a field, an input or a lane named with a Moment keyword is an ordinary name to derivation. The
// fixture names fields `policy`, `scope`, `trigger`, `context`, `type`, `on`, `state` and `when`, a lane
// `policy`, and guards its policy on `trigger.kind`.

const FIXTURE = resolve(
  import.meta.dirname,
  '../../../../../fixtures/valid/keyword-field-names/dispatch.moment',
);

async function load(): Promise<IntermediateRepresentation> {
  const result = await new MomentParser().parseContent(readFileSync(FIXTURE, 'utf8'));
  if (!result.success || !result.ir) {
    throw new Error(result.diagnostics.map((d) => d.message).join('; '));
  }
  return result.ir;
}

describe('ADR-051 keyword names in derived scenarios', () => {
  it('samples every field named with a keyword under its own name', async () => {
    const ir = await load();
    const events = generateSimulationScenario(ir, ir.flows[0]).events;
    const started = events.find((e) => e.eventType === 'JobStarted')!;
    expect(started.payload).toMatchObject({
      policy: 'sample-policy',
      scope: 'local',
      context: {},
      type: 'sample-type',
    });
    expect(typeof started.payload.on).toBe('string');
    const finished = events.find((e) => e.eventType === 'JobFinished')!;
    expect(Object.keys(finished.payload)).toEqual(expect.arrayContaining(['state', 'when']));
  });

  it('sets the guarded variant on a union field named `trigger` (ADR-050 on a keyword name)', async () => {
    const ir = await load();
    const started = generateSimulationScenario(ir, ir.flows[0]).events.find(
      (e) => e.eventType === 'JobStarted',
    )!;
    expect(started.payload.trigger).toEqual({ kind: 'Scheduled' });
    expect(generatePolicyDefinitions(ir)[0].condition).toEqual({
      field: 'trigger.kind',
      equals: 'Scheduled',
    });
  });
});
