import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MomentParser, type IntermediateRepresentation } from '@mmmnt/core';
import { generateAllScenarios } from '../simulation-scenario-generator.js';
import { UUID_FORM, expectedSampleUuid } from './sample-uuid.js';

// A sample payload value has the format @mmmnt/schema gives its type, so a contract check that
// tests formats passes every derived payload. The same model gives the same samples every run.

const TICKETWAVE = resolve(
  import.meta.dirname,
  '../../../../../examples/ticketwave/spec/ticketwave.moment',
);

const DATE_TIME_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

async function load(): Promise<IntermediateRepresentation> {
  const result = await new MomentParser().parseContent(readFileSync(TICKETWAVE, 'utf8'));
  if (!result.ir) throw new Error(result.diagnostics.map((d) => d.message).join('; '));
  return result.ir;
}

interface Field {
  readonly name: string;
  readonly type: string;
  readonly isArray?: boolean;
}

/** Every declared field of the model's events and commands, by name. */
function modelFields(ir: IntermediateRepresentation): [string, readonly Field[] | undefined][] {
  return ir.contexts.flatMap((ctx) => [
    ...ctx.events.map((e): [string, readonly Field[]] => [e.name, e.fields]),
    ...ctx.aggregates.flatMap((agg) => [
      ...agg.events.map((e): [string, readonly Field[]] => [e.name, e.fields]),
      ...agg.commands.map((c): [string, readonly Field[] | undefined] => [c.name, c.inputs]),
    ]),
  ]);
}

/** Every crossing contract's fields, by the crossing event's name. */
function contractFields(ir: IntermediateRepresentation): [string, readonly Field[]][] {
  return ir.flows.flatMap((flow) =>
    flow.connections.flatMap((conn): [string, readonly Field[]][] =>
      conn.connectionType === 'crosses-to' && 'schemaContract' in conn
        ? [[conn.sourceNodeName ?? '', conn.schemaContract.fields]]
        : [],
    ),
  );
}

function declaredFields(ir: IntermediateRepresentation): Map<string, Field[]> {
  const out = new Map<string, Field[]>();
  for (const [name, fields] of [...modelFields(ir), ...contractFields(ir)]) {
    out.set(name, [...(out.get(name) ?? []), ...(fields ?? [])]);
  }
  return out;
}

const FORMATS: Record<string, (value: unknown) => void> = {
  UUID: (v) => expect(v).toMatch(UUID_FORM),
  DateTime: (v) => expect(v).toMatch(DATE_TIME_WITH_OFFSET),
  Date: (v) => expect(v).toMatch(DATE_ONLY),
  Money: (v) => expect(Number.isFinite(v)).toBe(true),
};

function allScenarios(ir: IntermediateRepresentation) {
  return ir.flows.flatMap((flow) => generateAllScenarios(ir, flow));
}

describe('sample payload formats', () => {
  it('every UUID, DateTime, Date and Money sample has its schema format', async () => {
    const ir = await load();
    const fields = declaredFields(ir);
    const checked = new Set<string>();
    for (const scenario of allScenarios(ir)) {
      for (const event of scenario.events) {
        const payload = event.payload as Record<string, unknown>;
        const name = event.eventType.replace(/^Sim\w+\./, '');
        for (const field of fields.get(name) ?? []) {
          const check = FORMATS[field.type];
          if (field.isArray === true || check === undefined || !(field.name in payload)) continue;
          check(payload[field.name]);
          checked.add(field.type);
        }
      }
    }
    expect([...checked]).toEqual(expect.arrayContaining(['UUID', 'DateTime', 'Money']));
  });

  it('a UUID sample is the version 8 UUID of its field name, the same in every payload', async () => {
    const ir = await load();
    const holdIds = new Set<unknown>();
    for (const scenario of allScenarios(ir)) {
      for (const event of scenario.events) {
        const payload = event.payload as Record<string, unknown>;
        if ('holdId' in payload) holdIds.add(payload.holdId);
      }
    }
    expect([...holdIds]).toEqual([expectedSampleUuid('holdId')]);
    expect(expectedSampleUuid('holdId')[14]).toBe('8');
    expect('89ab').toContain(expectedSampleUuid('holdId')[19]);
  });

  it('the same model gives byte-identical scenarios on every run', async () => {
    const first = JSON.stringify(allScenarios(await load()));
    const second = JSON.stringify(allScenarios(await load()));
    expect(second).toBe(first);
  });
});
