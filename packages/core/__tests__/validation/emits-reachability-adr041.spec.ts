import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';

// ADR-041 reachability sweep: no consumer reads `emitsEvent` or `outcomes` directly; they go through
// `emittedEvents` / `emitOutcomes`. The sweep walks every package's source rather than listing the
// consumers, so a new consumer is covered the day it is written.

const PACKAGES = resolve(import.meta.dirname, '../../..');

/** The files that own the field: its type, its helpers, and the one writer. Other shapes named alike are external. */
const OWNERS = [
  /^core\/src\/ir\/context-definition\.ts$/,
  /^core\/src\/ir\/emits\.ts$/,
  /^core\/src\/parser\/ast-to-ir\.ts$/,
  // An external specification's own `emitsEvent` field, mapped to the plain `emits X` form.
  /^core\/src\/import\//,
  /^sync\/src\//,
];

const isTest = (path: string): boolean => /(__tests__|\.spec\.|\.test\.|\/generated\/)/.test(path);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === 'node_modules' || name === 'dist') return [];
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|mts)$/.test(name) && !isTest(path) ? [path] : [];
  });
}

/** Lines that read the field: a member access, or a destructured name, outside comments. */
function directReads(source: string): string[] {
  return source
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .filter((line) =>
      /\.(emitsEvent|outcomes)\b|\{[^}]*\b(emitsEvent|outcomes)\b[^}]*\}\s*=/.test(line),
    );
}

describe('ADR-041 reachability sweep', () => {
  const files = readdirSync(PACKAGES)
    .filter((p) => statSync(join(PACKAGES, p)).isDirectory())
    .flatMap((p) =>
      statSync(join(PACKAGES, p, 'src'), { throwIfNoEntry: false })
        ? sourceFiles(join(PACKAGES, p, 'src'))
        : [],
    );

  it('sweeps the source of every package', () => {
    expect(files.length).toBeGreaterThan(100);
    expect(files.some((f) => f.endsWith('derive/src/engine/event-catalog-generator.ts'))).toBe(
      true,
    );
    expect(files.some((f) => f.endsWith('emit-ts/src/services/typescript-emitter.ts'))).toBe(true);
  });

  it('finds no direct read of emitsEvent or outcomes outside the files that own the field', () => {
    const offenders = files
      .map((f) => relative(PACKAGES, f))
      .filter((rel) => !OWNERS.some((o) => o.test(rel)))
      .filter((rel) => directReads(readFileSync(join(PACKAGES, rel), 'utf-8')).length > 0);
    expect(offenders).toEqual([]);
  });

  it('would find a direct read if a consumer wrote one', () => {
    expect(directReads('const e = cmd.emitsEvent;')).toHaveLength(1);
    expect(directReads('for (const o of cmd.outcomes ?? []) {}')).toHaveLength(1);
    expect(directReads('const { emitsEvent } = cmd;')).toHaveLength(1);
    expect(directReads('// cmd.emitsEvent is read through emittedEvents')).toHaveLength(0);
    expect(directReads('const events = emittedEvents(cmd);')).toHaveLength(0);
  });
});
