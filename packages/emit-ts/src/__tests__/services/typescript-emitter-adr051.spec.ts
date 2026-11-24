import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { MomentParser } from '@mmmnt/core';
import { TypeScriptEmitter } from '../../services/typescript-emitter.js';

// ADR-051: a field or an input named with a Moment keyword is a property of that name. No Moment keyword is a
// reserved word of TypeScript, so each is written bare; a name with a hyphen is quoted as before.

const FIXTURE = resolve(
  import.meta.dirname,
  '../../../../../fixtures/valid/keyword-field-names/dispatch.moment',
);
let files: Map<string, string>;
let all: string;

beforeAll(async () => {
  const result = await new MomentParser().parseContent(readFileSync(FIXTURE, 'utf8'), FIXTURE);
  if (!result.ir) throw new Error(result.diagnostics.map((d) => d.message).join('; '));
  files = new TypeScriptEmitter().emit(result.ir, { scope: { level: 'system' } }).files;
  all = [...files.values()].join('\n');
});

describe('TypeScript emission with ADR-051 keyword names', () => {
  it('writes event fields and command inputs named with keywords as properties', () => {
    expect(all).toContain(
      [
        'export interface JobStarted {',
        '  readonly jobId: string;',
        '  readonly policy: string;',
        "  readonly scope?: 'local' | 'global';",
        '  readonly trigger: Trigger;',
        '  readonly context: Target;',
        '  readonly type: string;',
        '  readonly on: string;',
        '}',
      ].join('\n'),
    );
    expect(all).toContain('  readonly state: string;\n  readonly when: string;\n}');
  });

  it('writes value object, variant, projection and query fields named with keywords', () => {
    expect(all).toContain("      readonly kind: 'Scheduled';\n      readonly timeout: string;");
    expect(all).toContain("      readonly kind: 'Manual';\n      readonly string: string;");
    expect(all).toContain(
      "export interface Target {\n  readonly context: string;\n  readonly scope: 'local' | 'global';\n}",
    );
    expect(all).toContain(
      'export interface GetJobBoardQuery {\n  readonly scope: string;\n  readonly context?: string;\n}',
    );
  });

  // The context's read-model types file holds its value objects and type-checks alone (as ADR-049's spec).
  it('the read-model types type-check', () => {
    const dir = mkdtempSync(join(tmpdir(), 'emit-ts-adr051-'));
    for (const [path, text] of files) {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      writeFileSync(join(dir, path), text);
    }
    writeFileSync(
      join(dir, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          strict: true,
          noEmit: true,
          module: 'nodenext',
          target: 'es2022',
          skipLibCheck: true,
        },
        include: ['src/dispatch/read-model.types.ts'],
      }),
    );
    const tsc = resolve(import.meta.dirname, '../../../../../node_modules/.bin/tsc');
    expect(() => execFileSync(tsc, ['-p', dir], { encoding: 'utf8' })).not.toThrow();
  }, 60_000);
});
