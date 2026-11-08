import { describe, it, expect } from 'vitest';
import { MomentParser } from '../../src/parser/moment-parser.js';

// ADR-045 D2: V49 (a `when` field the trigger event does not carry), V50 (an `after` event that is not
// declared) and V51 (an `after` that no flow can satisfy, advisory). A guard on `outcome` is allowed (ADR-046).

const MODEL = (policy: string, flow = ''): string => `
context "Inventory" [Core]
  aggregate "SeatHold"
    identity holdId: UUID
    command ReleaseHold
      input holdId: UUID, reason: string
      emits HoldReleased
    command NotifyWaitlistPromotion
      input holdId: UUID
      emits WaitlistNotified
    command RequestHold
      input holdId: UUID
      emits SeatsHeld
    event SeatsHeld
      holdId: UUID
    event HoldReleased
      holdId: UUID
      reason: string
      outcome: string
    event WaitlistNotified
      holdId: UUID
${policy}
${flow}
`;

const POLICY = (trigger: string): string => `
  policy PromoteWaitlist
    trigger ${trigger}
    action "Promote"
    chains-to NotifyWaitlistPromotion
`;

type Finding = { ruleId?: string; severity: string; message: string };
const ruleOf = (d: Finding): string => d.ruleId ?? d.message.split(':')[0];

async function findings(source: string): Promise<Finding[]> {
  const result = await new MomentParser().parseContent(source);
  return result.diagnostics.filter((d) => /^V(49|50|51)$/.test(ruleOf(d)));
}

describe('ADR-045 D2 validation', () => {
  it('says nothing about a policy with no condition', async () => {
    expect(await findings(MODEL(POLICY('HoldReleased')))).toEqual([]);
  });

  it('says nothing about a satisfiable condition on a field the trigger carries', async () => {
    expect(await findings(MODEL(POLICY('HoldReleased when reason = expired')))).toEqual([]);
  });

  it('V49: a `when` field the trigger event does not declare', async () => {
    const out = await findings(MODEL(POLICY('HoldReleased when cause = expired')));
    expect(out.map(ruleOf)).toEqual(['V49']);
    expect(out[0].message).toContain("'cause'");
    expect(out[0].message).toContain("'HoldReleased'");
  });

  it('allows a guard on a field named `outcome` (ADR-046 moved the stamp off it)', async () => {
    expect(await findings(MODEL(POLICY('HoldReleased when outcome = Succeeded')))).toEqual([]);
  });

  it('V50: an `after` event that is no declared event', async () => {
    const out = await findings(MODEL(POLICY('HoldReleased after Nothing')));
    expect(out.map(ruleOf)).toEqual(['V50']);
    expect(out[0].message).toContain("'Nothing'");
  });

  const FLOW = (order: string[]): string => `
flow "Release"
  lane inventory "Inventory" [Core]
  moment "Holds"
${order.map((n) => `    inventory: ${n}`).join('\n')}
`;

  it('V51 (warning): `after X` where no flow places X before the trigger', async () => {
    const out = await findings(
      MODEL(POLICY('HoldReleased after SeatsHeld'), FLOW(['HoldReleased', 'SeatsHeld'])),
    );
    expect(out.map(ruleOf)).toEqual(['V51']);
    expect(out[0].severity).toBe('warning');
  });

  it('V51 stays quiet when a flow places X before the trigger', async () => {
    expect(
      await findings(
        MODEL(POLICY('HoldReleased after SeatsHeld'), FLOW(['SeatsHeld', 'HoldReleased'])),
      ),
    ).toEqual([]);
  });

  it('V51 stays quiet when no flow places the trigger at all (nothing to contradict)', async () => {
    expect(
      await findings(MODEL(POLICY('HoldReleased after SeatsHeld'), FLOW(['SeatsHeld']))),
    ).toEqual([]);
  });
});
