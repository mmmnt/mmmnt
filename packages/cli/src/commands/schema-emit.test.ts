import { describe, it, expect } from 'vitest';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { runSchemaEmit } from './schema-emit.js';

// ADR-049 D8: `moment schema emit <file|dir> [--out-dir <dir>]` writes one closed JSON Schema per event.

const FIXTURES = resolve(import.meta.dirname, '../../../../fixtures');
const FIELD_TYPES = resolve(FIXTURES, 'valid/field-types/field-types.moment');
const SIFT_MODEL = resolve(import.meta.dirname, '../../../board/fixtures/sift-model');

describe('moment schema emit', () => {
  it('writes <Event>.schema.json for every event to --out-dir', async () => {
    const out = mkdtempSync(join(tmpdir(), 'schema-emit-'));
    const result = await runSchemaEmit([FIELD_TYPES, '--out-dir', out]);
    expect(result.success).toBe(true);
    expect(readdirSync(out).sort()).toEqual([
      'ReceiptProcessed.schema.json',
      'ReceiptRecorded.schema.json',
      'ReplayCompleted.schema.json',
    ]);
    const schema = JSON.parse(readFileSync(join(out, 'ReceiptRecorded.schema.json'), 'utf8'));
    expect(schema.title).toBe('ReceiptRecorded');
    expect(schema.additionalProperties).toBe(false);
    expect(result.message).toBe(`Wrote 3 payload schema(s) to ${out}`);
  });

  it('prints every schema as one JSON object without --out-dir', async () => {
    const result = await runSchemaEmit([FIELD_TYPES]);
    expect(result.success).toBe(true);
    expect(Object.keys(JSON.parse(result.message))).toEqual([
      'ReceiptRecorded',
      'ReceiptProcessed',
      'ReplayCompleted',
    ]);
  });

  it('reads a model directory as one project (the Sift model: 63 events, no diagnostic)', async () => {
    const result = await runSchemaEmit([SIFT_MODEL]);
    expect(result.diagnostics).toEqual([]);
    expect(result.success).toBe(true);
    expect(Object.keys(JSON.parse(result.message))).toHaveLength(63);
  });

  // ADR-051: a field named with a Moment keyword is a property of that name, in an event and a value object.
  it('writes the properties of fields named with keywords', async () => {
    const result = await runSchemaEmit([
      resolve(FIXTURES, 'valid/keyword-field-names/dispatch.moment'),
    ]);
    expect(result.diagnostics).toEqual([]);
    const schemas = JSON.parse(result.message);
    const started = schemas.JobStarted;
    expect(Object.keys(started.properties)).toEqual([
      'jobId',
      'policy',
      'scope',
      'trigger',
      'context',
      'type',
      'on',
    ]);
    expect(started.required).toEqual(['jobId', 'policy', 'trigger', 'context', 'type', 'on']);
    expect(started.properties.context).toEqual({ $ref: '#/$defs/Target' });
    expect(Object.keys(started.$defs.Target.properties)).toEqual(['context', 'scope']);
    expect(started.$defs.Trigger.oneOf.map((v: { required: string[] }) => v.required)).toEqual([
      ['kind', 'timeout'],
      ['kind', 'string'],
    ]);
    expect(Object.keys(schemas.JobFinished.properties)).toEqual(['jobId', 'state', 'when']);
  });

  it('fails, writing nothing, on a type that is not declared', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'schema-emit-bad-'));
    const file = join(dir, 'bad.moment');
    writeFileSync(
      file,
      'context "Shop" [Core]\n  aggregate "Order"\n    identity orderId: UUID\n    command Place\n      emits Placed\n    event Placed\n      where: Address\n',
    );
    const out = join(dir, 'out');
    const result = await runSchemaEmit([file, '--out-dir', out]);
    expect(result.success).toBe(false);
    expect(result.message).toContain("field 'where' has type 'Address', which is not declared");
    expect(() => readdirSync(out)).toThrow();
  });

  it('fails on a model that does not parse', async () => {
    const result = await runSchemaEmit([resolve(FIXTURES, 'invalid/no-declaration.moment')]);
    expect(result.success).toBe(false);
  });

  it('prints its usage without a path', async () => {
    const result = await runSchemaEmit([]);
    expect(result.success).toBe(false);
    expect(result.message).toBe('Usage: moment schema emit <file.moment|dir> [--out-dir <dir>]');
  });
});
