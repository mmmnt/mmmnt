import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MomentParser } from '../../src/parser/moment-parser.js';
import { ProjectLoader } from '../../src/project/index.js';

// ADR-041 V46, V47 and V48 end to end: source text through the parser and the project loader.

const CONTEXT = (redeem: string): string => `
context "Presale" [Supporting]
  aggregate "AccessCode"
    identity codeId: UUID
    state initial Open
    state Open -> OneUseLeft on Redeem
    command Redeem
      ${redeem}
    command Revoke
      emits Revoked
    event Redeemed
      codeId: UUID
    event Exhausted
      codeId: UUID
    event Revoked
      codeId: UUID
  aggregate "Window"
    identity windowId: UUID
    command Open
      emits Opened
    event Opened
      windowId: UUID
`;

const GUARDED = 'emits Redeemed when Open | Redeemed, Exhausted when OneUseLeft';

const FLOW = (body: string): string => `
flow "Redemption"
  lane presale "Presale" [Supporting]
${body}
`;

type Finding = { ruleId?: string; severity: string; message: string };

const ruleOf = (d: Finding): string => d.ruleId ?? d.message.split(':')[0];

async function parseOne(source: string): Promise<{ success: boolean; findings: Finding[] }> {
  const result = await new MomentParser().parseContent(source);
  return {
    success: result.success,
    findings: result.diagnostics.filter((d) => /^V4[4-8]$/.test(ruleOf(d))),
  };
}

async function loadProject(files: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), 'adr041-'));
  try {
    const paths = Object.entries(files).map(([name, text]) => {
      const path = join(dir, name);
      mkdirSync(join(path, '..'), { recursive: true });
      writeFileSync(path, text);
      return path;
    });
    const result = await new ProjectLoader().loadProject(paths);
    return {
      success: result.success,
      findings: result.diagnostics.filter((d) => /^V4[4-8]$/.test(d.ruleId ?? '')) as Finding[],
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const summary = (fs: Finding[]): string[] => fs.map((f) => `${ruleOf(f)}:${f.severity}`);
/** V48 is about flows placing outcomes; specs about another rule look past it. */
const without48 = (fs: Finding[]): Finding[] => fs.filter((f) => ruleOf(f) !== 'V48');

describe('V46 the guard of an outcome', () => {
  it('accepts guards that name declared states, one per outcome', async () => {
    const r = await parseOne(CONTEXT(GUARDED));
    expect(r.findings).toEqual([]);
    expect(r.success).toBe(true);
  });

  it('refuses a guard that names a state the aggregate does not declare', async () => {
    const r = await parseOne(CONTEXT('emits Redeemed when Open | Redeemed, Exhausted when Gone'));
    expect(summary(r.findings)).toEqual(['V46:error']);
    expect(r.findings[0].message).toContain("'Gone'");
    expect(r.success).toBe(false);
  });

  it('refuses a guard on an aggregate that declares no states', async () => {
    const source = CONTEXT(GUARDED).replace(
      '    state initial Open\n    state Open -> OneUseLeft on Redeem\n',
      '',
    );
    expect(summary((await parseOne(source)).findings)).toEqual(['V46:error', 'V46:error']);
  });

  it('refuses two outcomes recorded in the same state', async () => {
    const r = await parseOne(CONTEXT('emits Redeemed when Open | Exhausted when Open'));
    expect(summary(r.findings)).toEqual(['V46:error']);
    expect(r.findings[0].message).toContain("two outcomes recorded when 'Open'");
  });

  it('refuses a command that guards some outcomes and not others', async () => {
    const r = await parseOne(CONTEXT('emits Redeemed when Open | Redeemed, Exhausted'));
    expect(summary(r.findings)).toEqual(['V46:error']);
    expect(r.findings[0].message).toContain('guard every outcome or none');
  });

  it('advises, without failing, when alternatives carry no guard', async () => {
    const r = await parseOne(CONTEXT('emits Redeemed | Redeemed, Exhausted'));
    expect(summary(r.findings)).toEqual(['V46:warning']);
    expect(r.findings[0].message).toContain('is not declared');
    expect(r.success).toBe(true);
  });

  it('keeps the advisory a warning over a merged project', async () => {
    const r = await loadProject({ 'a.moment': CONTEXT('emits Redeemed | Redeemed, Exhausted') });
    expect(summary(without48(r.findings))).toEqual(['V46:warning']);
    expect(r.success).toBe(true);
  });

  it('does not advise about a command with one outcome', async () => {
    expect((await parseOne(CONTEXT('emits Redeemed, Exhausted'))).findings).toEqual([]);
  });

  it('accepts a guard that names a state an orchestration declares', async () => {
    const source = `
context "Shop" [Core]
  aggregate "Cart"
    identity cartId: UUID
    command Add
      emits Added
    event Added
      cartId: UUID
  orchestration Run
    command Start
      emits Begun when Running | Resumed when Over
    command Finish
    event Begun
      cartId: UUID
    event Resumed
      cartId: UUID
    invoked-by Start
    issues Add
    states Running -> Over on Finish
    compensation none
    timeout window
`;
    expect((await parseOne(source)).findings).toEqual([]);
    const bad = source.replace('when Over', 'when Missing');
    expect(summary((await parseOne(bad)).findings)).toEqual(['V46:error']);
  });
});

describe('V47 events a flow places after one placement of a multi-event command', () => {
  const place = (...nodes: string[]): string =>
    FLOW(`  moment "Redeem"\n${nodes.map((n) => `    presale: ${n}`).join('\n')}`);

  it('accepts a flow that places one whole outcome', async () => {
    const r = await parseOne(CONTEXT(GUARDED) + place('Redeem', 'Redeemed', 'Exhausted'));
    expect(r.findings).toEqual([]);
  });

  it('accepts a flow that places the other whole outcome, which is also a part of the first', async () => {
    const r = await parseOne(CONTEXT(GUARDED) + place('Redeem', 'Redeemed'));
    expect(r.findings).toEqual([]);
  });

  it('refuses events from two outcomes in one placement: a warning in a file, an error in a project', async () => {
    const alternatives = CONTEXT('emits Redeemed when Open | Exhausted when OneUseLeft');
    const one = await parseOne(alternatives + place('Redeem', 'Redeemed', 'Exhausted'));
    expect(summary(one.findings)).toEqual(['V47:warning']);
    expect(one.findings[0].message).toContain("Flow 'Redemption' moment 'Redeem'");
    const merged = await loadProject({
      'a.moment': alternatives,
      'b.moment': place('Redeem', 'Redeemed', 'Exhausted'),
    });
    expect(summary(without48(merged.findings))).toEqual(['V47:error']);
    expect(merged.success).toBe(false);
  });

  it('advises when the flow places only part of an outcome', async () => {
    const r = await parseOne(CONTEXT('emits Redeemed, Exhausted') + place('Redeem', 'Exhausted'));
    expect(summary(r.findings)).toEqual(['V47:warning']);
    expect(r.findings[0].message).toContain(
      "outcome 'Redeemed, Exhausted' of 'Redeem' records 'Redeemed' together with 'Exhausted'; the flow places 'Exhausted' only.",
    );
  });

  it('keeps the partial-outcome advisory a warning over a merged project', async () => {
    const r = await loadProject({
      'a.moment': CONTEXT('emits Redeemed, Exhausted'),
      'b.moment': place('Redeem', 'Exhausted'),
    });
    expect(summary(without48(r.findings))).toEqual(['V47:warning']);
    expect(r.success).toBe(true);
  });

  it('treats the events of each when block as its own path, so alternatives in branches are legal', async () => {
    const alternatives = CONTEXT('emits Redeemed when Open | Exhausted when OneUseLeft');
    const flow = FLOW(`  moment "Redeem" [branch]
    when open
      presale: Redeem
      presale: Redeemed
    when last
      presale: Redeem
      presale: Exhausted`);
    expect((await parseOne(alternatives + flow)).findings).toEqual([]);
  });

  it('attributes events placed in when blocks to a command placed before them, one block at a time', async () => {
    const alternatives = CONTEXT('emits Redeemed when Open | Exhausted when OneUseLeft');
    const flow = FLOW(`  moment "Redeem" [branch]
    presale: Redeem
    when open
      presale: Redeemed
    when last
      presale: Exhausted`);
    expect((await parseOne(alternatives + flow)).findings).toEqual([]);
    const both = FLOW(`  moment "Redeem" [branch]
    presale: Redeem
    presale: Redeemed
    when last
      presale: Exhausted`);
    expect(summary((await parseOne(alternatives + both)).findings)).toEqual(['V47:warning']);
  });

  it('stops attributing events at the next command of the same lane', async () => {
    const alternatives = CONTEXT('emits Redeemed when Open | Exhausted when OneUseLeft');
    const flow = place('Redeem', 'Redeemed', 'Redeem', 'Exhausted');
    expect((await parseOne(alternatives + flow)).findings).toEqual([]);
  });

  it('does not check a single-event command', async () => {
    const r = await parseOne(CONTEXT(GUARDED) + place('Revoke', 'Revoked', 'Exhausted'));
    expect(r.findings).toEqual([]);
  });
});

describe('V48 outcomes that no flow places, over a merged project only', () => {
  const alternatives = CONTEXT('emits Redeemed when Open | Redeemed, Exhausted when OneUseLeft');
  const place = (...nodes: string[]): string =>
    FLOW(`  moment "Redeem"\n${nodes.map((n) => `    presale: ${n}`).join('\n')}`);

  it('is silent for a single file, which cannot see every flow', async () => {
    expect((await parseOne(alternatives + place('Redeem', 'Redeemed'))).findings).toEqual([]);
  });

  it('advises about the outcome no flow places', async () => {
    const r = await loadProject({
      'a.moment': alternatives,
      'b.moment': place('Redeem', 'Redeemed'),
    });
    expect(summary(r.findings)).toEqual(['V48:warning']);
    expect(r.findings[0].message).toBe(
      "Outcome 'Redeemed, Exhausted' of command 'Redeem' is placed by no flow.",
    );
    expect(r.success).toBe(true);
  });

  it('is quiet once every outcome is placed', async () => {
    const r = await loadProject({
      'a.moment': alternatives,
      'b.moment':
        place('Redeem', 'Redeemed') +
        '\n' +
        place('Redeem', 'Redeemed', 'Exhausted').replace('Redemption', 'Last'),
    });
    expect(r.findings).toEqual([]);
  });

  it('does not ask a single-outcome command to be placed in full', async () => {
    const r = await loadProject({ 'a.moment': CONTEXT('emits Redeemed, Exhausted') });
    expect(r.findings).toEqual([]);
  });
});
