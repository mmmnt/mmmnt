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
