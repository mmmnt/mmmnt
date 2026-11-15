import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { MomentParser } from '@mmmnt/core';
import { TypeScriptEmitter } from '../../services/typescript-emitter.js';

// ADR-049 D9: optional fields, code sets, maps, scalar value objects and tagged unions in TypeScript.

const FIXTURE = resolve(
  import.meta.dirname,
  '../../../../../fixtures/valid/field-types/field-types.moment',
);
let files: Map<string, string>;
let all: string;

beforeAll(async () => {
  const { ir } = await new MomentParser().parseContent(readFileSync(FIXTURE, 'utf8'), FIXTURE);
  files = new TypeScriptEmitter().emit(ir!, { scope: { level: 'system' } }).files;
  all = [...files.values()].join('\n');
});

describe('TypeScript emission with ADR-049 field types', () => {
  it('a code set is a union of string literals, inline and as a scalar value object', () => {
    expect(all).toContain("export type ActorKind = 'user' | 'api' | 'system';");
    expect(all).toContain("  readonly kind: 'Bootstrap' | 'Resume';");
  });

  it('an optional field is optional, and a scalar value object is a type alias', () => {
    expect(all).toContain('  readonly clientId?: string;');
    expect(all).toContain('export type ContentHash = string;');
  });

  it('a map is a record keyed by string', () => {
    expect(all).toContain('  readonly replayPoint: Readonly<Record<string, number>>;');
    expect(all).toContain('  readonly endPoint?: Readonly<Record<string, number>>;');
  });

  it('a tagged union is a discriminated union on kind, with the common fields in every branch', () => {
    expect(all).toContain(
      [
        'export type Arrival =',
        '  | {',
        "      readonly kind: 'Live';",
        '      readonly actor: Actor;',
        '    }',
        '  | {',
        "      readonly kind: 'Replay';",
        '      readonly actor: Actor;',
        "      readonly replay: 'Bootstrap' | 'Resume';",
        '    }',
      ].join('\n'),
    );
  });

  // The value objects of a context are in its read-model types file, which therefore type-checks alone.
  // (An aggregate's types file does not import a context's value objects; that is older than ADR-049.)
  it('the value object types type-check', () => {
    const dir = mkdtempSync(join(tmpdir(), 'emit-ts-adr049-'));
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
        include: ['src/intake/read-model.types.ts'],
      }),
    );
    const tsc = resolve(import.meta.dirname, '../../../../../node_modules/.bin/tsc');
    expect(() => execFileSync(tsc, ['-p', dir], { encoding: 'utf8' })).not.toThrow();
  }, 60_000);
});
