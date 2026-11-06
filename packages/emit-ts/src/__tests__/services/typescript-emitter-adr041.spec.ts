import { describe, it, expect } from 'vitest';
import { MomentParser } from '@mmmnt/core';
import { TypeScriptEmitter } from '../../services/typescript-emitter.js';

const MODEL = (emits: string): string => `
context "Presale" [Supporting]
  aggregate "AccessCode"
    identity codeId: UUID
    state initial Open
    state Open -> OneUseLeft on Redeem
    command Redeem
      input codeId: UUID
      precondition codeValid: "The code is valid"
      ${emits}
    command Revoke
      input codeId: UUID
      emits Revoked
    event Redeemed
      codeId: UUID
    event Exhausted
      codeId: UUID
    event Revoked
      codeId: UUID
`;

async function aggregateFile(emits: string): Promise<string> {
  const result = await new MomentParser().parseContent(MODEL(emits));
  if (!result.ir) throw new Error(result.diagnostics.map((d) => d.message).join('; '));
  const files = new TypeScriptEmitter().emit(result.ir, { scope: { level: 'system' } }).files;
  const path = [...files.keys()].find((p) => p.endsWith('access-code.aggregate.ts'));
  if (path === undefined) throw new Error(`no aggregate file in ${[...files.keys()].join(', ')}`);
  return files.get(path) ?? '';
}

const handler = (file: string): string =>
  file
    .split('\n')
    .find((l) => l.trim().startsWith('redeem('))
    ?.trim() ?? '';
/** The `@tag` lines of the Redeem handler's JSDoc. */
function tags(file: string, tag: string): string[] {
  const lines = file.split('\n').map((l) => l.trim());
  const start = lines.indexOf('* Handle Redeem.');
  const end = lines.indexOf('*/', start);
  return lines.slice(start, end).filter((l) => l.startsWith(`* @${tag} `));
}

describe('ADR-041 D5 emit-ts handler return types', () => {
  it('returns the event for the plain form, as before', async () => {
    const file = await aggregateFile('emits Redeemed');
    expect(handler(file)).toBe('redeem(command: Redeem): Redeemed;');
    expect(tags(file, 'emits')).toEqual(['* @emits Redeemed']);
    expect(tags(file, 'outcome')).toEqual([]);
  });

  it('returns a readonly tuple for events recorded together', async () => {
    const file = await aggregateFile('emits Redeemed, Exhausted');
    expect(handler(file)).toBe('redeem(command: Redeem): readonly [Redeemed, Exhausted];');
    expect(tags(file, 'emits')).toEqual(['* @emits Redeemed', '* @emits Exhausted']);
  });

  it('returns a union for alternative outcomes', async () => {
    const file = await aggregateFile('emits Redeemed | Exhausted');
    expect(handler(file)).toBe('redeem(command: Redeem): Redeemed | Exhausted;');
    expect(tags(file, 'emits')).toEqual(['* @emits Redeemed', '* @emits Exhausted']);
  });

  it('returns a union of a tuple and an event for a tuple inside an alternative', async () => {
    const file = await aggregateFile('emits Redeemed, Exhausted | Revoked');
    expect(handler(file)).toBe(
      'redeem(command: Redeem): readonly [Redeemed, Exhausted] | Revoked;',
    );
  });

  it('lists a repeated event once in the tags and each outcome in the union', async () => {
    const file = await aggregateFile('emits Redeemed | Redeemed, Exhausted');
    expect(handler(file)).toBe(
      'redeem(command: Redeem): Redeemed | readonly [Redeemed, Exhausted];',
    );
    expect(tags(file, 'emits')).toEqual(['* @emits Redeemed', '* @emits Exhausted']);
  });

  it('collapses outcomes of one event that differ only by state into one union member', async () => {
    const file = await aggregateFile('emits Redeemed when Open | Redeemed when OneUseLeft');
    expect(handler(file)).toBe('redeem(command: Redeem): Redeemed;');
  });

  it('names the state of a guarded outcome with an @outcome tag', async () => {
    const file = await aggregateFile(
      'emits Redeemed when Open | Redeemed, Exhausted when OneUseLeft',
    );
    expect(tags(file, 'outcome')).toEqual([
      '* @outcome Open: Redeemed',
      '* @outcome OneUseLeft: Redeemed, Exhausted',
    ]);
  });
});
