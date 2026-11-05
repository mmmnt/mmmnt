import { describe, it, expect } from 'vitest';
import { MomentParser } from '../../src/parser/moment-parser.js';

/** Parse a source and return "V<n>" rule ids of every error, in order (a message begins with its rule id). */
async function errors(source: string): Promise<string[]> {
  const result = await new MomentParser().parseContent(source);
  return result.diagnostics
    .filter((d) => d.severity === 'error')
    .map((d) => d.message.split(':')[0]);
}

const CLINIC = `
context "Clinic" [Core]
  aggregate "Pet"
    identity petId: UUID
    command ReserveBed
      emits BedReserved
    event BedReserved
      petId: UUID
  policy BillOnCompletion
    trigger AdmissionCompleted
    action "Bill the owner"
    chains-to ReserveBed
  orchestration AdmissionProcess
    command StartAdmission
      emits AdmissionStarted
    command FinishAdmission
      emits AdmissionCompleted
    event AdmissionStarted
      petId: UUID
    event AdmissionCompleted
      petId: UUID
    invoked-by StartAdmission
    issues ReserveBed
    states Started
    compensation none
    timeout admissionWindow
`;

describe('ADR-040 D1 flows place process commands and process events', () => {
  it('resolves an orchestration command and a process event as declared building blocks (V1)', async () => {
    const source = `${CLINIC}
flow "Admission"
  lane proc "Clinic" [Core]
  moment "Admission starts"
    proc: StartAdmission
    proc: AdmissionStarted
`;
    expect(await errors(source)).toEqual([]);
  });
});

describe('ADR-040 D3 V10 counts a note', () => {
  const flow = (moment: string): string => `
flow "F"
  lane l "L" [Core]
  lane ext "Card network" [External]
  moment "M"
${moment}
`;

  it('accepts a moment that holds only a note', async () => {
    expect(await errors(flow('    note ext: "The network authorises the card"'))).toEqual([]);
  });

  it('accepts a moment that holds only a note with no lane', async () => {
    expect(await errors(flow('    note "A step outside the model"'))).toEqual([]);
  });

  it('still refuses a moment with no node, when block or note', async () => {
    expect(await errors(flow(''))).toEqual(['V10']);
  });

  it('refuses a note that speaks for an undeclared lane (V13)', async () => {
    expect(await errors(flow('    note ghost: "Nobody declared this lane"'))).toEqual(['V13']);
  });
});

describe('ADR-040 D3 a note-only moment is a returns-to target (V6)', () => {
  it('accepts returns-to a moment that holds only a note', async () => {
    expect(
      await errors(`
flow "F"
  lane l "L" [Core]
  moment "Waiting"
    note "A person decides, outside the model"
  moment "Decided"
    l: Decided
      returns-to "Waiting"
`),
    ).toEqual([]);
  });
});

describe('ADR-040 D4 V5 takes an earlier node of the same moment', () => {
  const flow = (moment: string): string => `
flow "F"
  lane l "L" [Core]
  moment "Prior"
    l: Prior
  moment "M"
${moment}
`;

  it('accepts triggered-by of a node placed earlier in the same moment', async () => {
    expect(
      await errors(
        flow(
          '    l: OrderPlaced\n    l: ReserveSeatsOnOrderPlaced\n      triggered-by OrderPlaced',
        ),
      ),
    ).toEqual([]);
  });

  it('accepts a chain of hops inside one moment', async () => {
    expect(
      await errors(
        flow(
          '    l: OrderPlaced\n    l: ReserveSeatsOnOrderPlaced\n      triggered-by OrderPlaced\n    l: ReserveSeats\n      triggered-by ReserveSeatsOnOrderPlaced',
        ),
      ),
    ).toEqual([]);
  });

  it('accepts a hop whose cause is placed earlier in the moment than a when block', async () => {
    expect(await errors(flow('    l: A\n    when ok\n      l: B\n        triggered-by A'))).toEqual(
      [],
    );
  });

  it('still accepts a node from a prior moment', async () => {
    expect(await errors(flow('    l: X\n      triggered-by Prior'))).toEqual([]);
  });

  it('V5: refuses triggered-by of a node placed later in the same moment', async () => {
    expect(await errors(flow('    l: First\n      triggered-by Second\n    l: Second'))).toEqual([
      'V5',
    ]);
  });

  it('V5: refuses a node that names itself', async () => {
    expect(await errors(flow('    l: Loop\n      triggered-by Loop'))).toEqual(['V5']);
  });

  it('V5: refuses a name placed nowhere', async () => {
    expect(await errors(flow('    l: X\n      triggered-by Ghost'))).toEqual(['V5']);
  });
});
