import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MomentParser } from '../../src/parser/moment-parser.js';

// ADR-049 D11: V52 (a union field named `kind`), V53 (a variant or a code twice), V54 (an optional
// member of an exclusive group) and V55 (an invalid pattern, or a pattern on a non-string field).
// Each is decidable in one file, so it is an error in a single file and in a project alike.

const FIXTURE = resolve(
  import.meta.dirname,
  '../../../../fixtures/valid/field-types/field-types.moment',
);

const MODEL = (members: string): string => `
context "Intake" [Core]
  value-object Ref
    stream: string
  value-object Count: number
${members}
`;

type Finding = { ruleId?: string; severity: string; message: string };
const ruleOf = (d: Finding): string => d.ruleId ?? d.message.split(':')[0];

async function findings(source: string): Promise<Finding[]> {
  const result = await new MomentParser().parseContent(source);
  return result.diagnostics.filter((d) => /^V5[2-5]$/.test(ruleOf(d)));
}

async function rulesOf(members: string): Promise<{ rule: string; severity: string }[]> {
  return (await findings(MODEL(members))).map((d) => ({ rule: ruleOf(d), severity: d.severity }));
}

describe('ADR-049 D11 validation', () => {
  it('says nothing about the valid field-types fixture', async () => {
    expect(await findings(readFileSync(FIXTURE, 'utf8'))).toEqual([]);
  });

  it('V52: a common field of a union named `kind`', async () => {
    expect(
      await rulesOf(`
  value-object Arrival
    kind: string
    | Live
    | Replay`),
    ).toEqual([{ rule: 'V52', severity: 'error' }]);
  });

  it('V52: a variant field named `kind`', async () => {
    expect(
      await rulesOf(`
  value-object Arrival
    | Live
    | Replay
        kind: string`),
    ).toEqual([{ rule: 'V52', severity: 'error' }]);
  });

  it('V52: a record (no variants) may have a field named `kind`', async () => {
    expect(
      await rulesOf(`
  value-object Actor
    kind: "user" | "api"`),
    ).toEqual([]);
  });

  it('V53: a variant named twice', async () => {
    expect(
      await rulesOf(`
  value-object Arrival
    | Live
    | Live`),
    ).toEqual([{ rule: 'V53', severity: 'error' }]);
  });

  it('V53: a code written twice, inline and in a scalar value object', async () => {
    expect(
      await rulesOf(`
  value-object Kind: "a" | "b" | "a"
  value-object Holder
    k: "x" | "x"`),
    ).toEqual([
      { rule: 'V53', severity: 'error' },
      { rule: 'V53', severity: 'error' },
    ]);
  });

  it('V54: an optional member of an exclusive group', async () => {
    expect(
      await rulesOf(`
  value-object Holder
    pointer?: string | ref: Ref`),
    ).toEqual([{ rule: 'V54', severity: 'error' }]);
  });

  it('V55: a pattern that is not a regular expression', async () => {
    expect(
      await rulesOf(`
  value-object Holder
    hash: string [pattern "([a-f"]`),
    ).toEqual([{ rule: 'V55', severity: 'error' }]);
  });

  it('V55: a pattern on a number, a boolean, a record value object or a numeric scalar', async () => {
    expect(
      await rulesOf(`
  value-object Holder
    a: number [pattern "^1$"]
    b: boolean [pattern "^t$"]
    c: Ref [pattern "^r$"]
    d: Count [pattern "^1$"]
  value-object Bad: number [pattern "^1$"]`),
    ).toEqual([
      { rule: 'V55', severity: 'error' },
      { rule: 'V55', severity: 'error' },
      { rule: 'V55', severity: 'error' },
      { rule: 'V55', severity: 'error' },
      { rule: 'V55', severity: 'error' },
    ]);
  });

  it('V55: a pattern on string-valued types is fine (string, UUID, a code set, a string scalar, an array)', async () => {
    expect(
      await rulesOf(`
  value-object Id: string
  value-object Holder
    a: string [pattern "^a$"]
    b: UUID [pattern "^[0-9a-f-]+$"]
    c: "x" | "y" [pattern "^[xy]$"]
    d: Id [pattern "^i$"]
    e: string[] [pattern "^e$"]
    f: string{} [pattern "^f$"]`),
    ).toEqual([]);
  });
});
