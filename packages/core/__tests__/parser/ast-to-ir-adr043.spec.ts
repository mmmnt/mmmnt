import { describe, it, expect, beforeAll } from 'vitest';
import {
  inject,
  createDefaultCoreModule,
  createDefaultSharedCoreModule,
  EmptyFileSystem,
} from 'langium';
import { parseHelper } from 'langium/test';
import { MomentGeneratedModule, MomentGeneratedSharedModule } from '../../src/generated/module.js';
import type { MomentFile } from '../../src/generated/ast.js';
import { astToIr } from '../../src/parser/ast-to-ir.js';
import type { LangiumDocument } from 'langium';

let parse: (input: string) => Promise<LangiumDocument<MomentFile>>;

beforeAll(() => {
  const shared = inject(
    createDefaultSharedCoreModule(EmptyFileSystem),
    MomentGeneratedSharedModule,
  );
  const services = inject(createDefaultCoreModule({ shared }), MomentGeneratedModule);
  shared.ServiceRegistry.register(services);
  parse = parseHelper<MomentFile>(services);
});

async function entriesOf(modifier: string) {
  const doc = await parse(`
flow "F"
  lane l "L" [Core]
  moment "M" [branch]
    when a
      l: Done${modifier}
    when b
      l: Other
`);
  expect(doc.parseResult.lexerErrors).toHaveLength(0);
  expect(doc.parseResult.parserErrors).toHaveLength(0);
  return astToIr(doc.parseResult.value).flows[0].moments[0].branches![0].entries;
}

describe('ADR-043 D2 IR', () => {
  it('gives [outcome] terminal: true and exit: outcome', async () => {
    const [entry] = await entriesOf(' [outcome]');
    expect(entry.terminal).toBe(true);
    expect(entry.exit).toBe('outcome');
  });

  it('leaves [terminal] without an exit', async () => {
    const [entry] = await entriesOf(' [terminal]');
    expect(entry.terminal).toBe(true);
    expect('exit' in entry).toBe(false);
  });

  it('keeps the [terminal] and unmarked IR byte-identical to the baseline shape', async () => {
    expect(JSON.stringify(await entriesOf(' [terminal]'))).toBe(
      '[{"contextId":"ctx-L","nodeName":"Done","nodeKind":"event","terminal":true}]',
    );
    expect(JSON.stringify(await entriesOf(''))).toBe(
      '[{"contextId":"ctx-L","nodeName":"Done","nodeKind":"event"}]',
    );
  });

  it('does not mark [optional] as an exit', async () => {
    const [entry] = await entriesOf(' [optional]');
    expect(entry.optional).toBe(true);
    expect(entry.terminal).toBeUndefined();
    expect(entry.exit).toBeUndefined();
  });
});
