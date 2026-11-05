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

async function toIr(input: string) {
  const doc = await parse(input);
  expect(doc.parseResult.lexerErrors).toHaveLength(0);
  expect(doc.parseResult.parserErrors).toHaveLength(0);
  return astToIr(doc.parseResult.value);
}

const ADMISSION = `
context "Clinic" [Core]
  aggregate "Pet"
    identity petId: UUID
    command RegisterPet
      emits PetRegistered
    event PetRegistered
      petId: UUID
  orchestration AdmissionProcess
    command StartAdmission
      input petId: UUID
      emits AdmissionStarted
    command AbandonAdmission
      emits AdmissionAbandoned
    event AdmissionStarted
      petId: UUID
    event AdmissionCompleted
      petId: UUID
      bedId: UUID
    event AdmissionAbandoned
      petId: UUID
    invoked-by StartAdmission
    issues RegisterPet
    states Started
    compensation on AbandonAdmission issues RegisterPet
    timeout admissionWindow
`;

describe('ADR-040 D1 process events', () => {
  it('parses events declared inside an orchestration into SagaDefinition.events', async () => {
    const ir = await toIr(ADMISSION);
    const saga = ir.contexts[0].sagas[0];
    expect(saga.events?.map((e) => e.name)).toEqual([
      'AdmissionStarted',
      'AdmissionCompleted',
      'AdmissionAbandoned',
    ]);
    expect(saga.events?.[1].fields.map((f) => f.name)).toEqual(['petId', 'bedId']);
    expect(saga.trigger).toBe('StartAdmission');
    expect(saga.timeout).toBe('admissionWindow');
  });

  it('sets owner on every event and adds process events to the flat context list', async () => {
    const ir = await toIr(ADMISSION);
    const ctx = ir.contexts[0];
    const byName = Object.fromEntries(ctx.events.map((e) => [e.name, e]));
    expect(byName.PetRegistered.owner).toEqual({ kind: 'aggregate', name: 'Pet' });
    expect(byName.AdmissionCompleted.owner).toEqual({
      kind: 'orchestration',
      name: 'AdmissionProcess',
    });
    expect(Object.keys(byName)).toContain('AdmissionAbandoned');
    expect(ctx.aggregates[0].events[0].owner).toEqual({ kind: 'aggregate', name: 'Pet' });
  });

  it('keeps an orchestration without events free of an events list entry', async () => {
    const ir = await toIr(`
context "C" [Core]
  aggregate "A"
    identity aId: UUID
    command Do
      emits Done
    event Done
      aId: UUID
  orchestration P
    command Go
    invoked-by Go
    issues Do
    states S
    compensation none
    timeout "none"
`);
    expect(ir.contexts[0].sagas[0].events ?? []).toEqual([]);
  });
});

const APPOINTMENT = `
context "Clinic" [Core]
  aggregate "Appointment"
    identity appointmentId: UUID
    command CancelAppointment
      input appointmentId: UUID, cause: string
      causes OwnerRequest, ClinicClosure
      precondition AppointmentIsOpen: "The appointment has not been completed"
      precondition WithinCancellationWindow cause OwnerRequest: "At least 24 hours ahead"
      emits AppointmentCancelled
    event AppointmentCancelled
      appointmentId: UUID
      cause: string

flow "Owner cancels"
  lane desk "Clinic" [Core]
  moment "Owner asks to cancel"
    desk: CancelAppointment cause OwnerRequest
    desk: AppointmentCancelled
  moment "Clinic cancels"
    desk: CancelAppointment [optional] cause ClinicClosure
    desk: AppointmentCancelled
`;

describe('ADR-040 D2 causes', () => {
  it('reads causes on a command and a cause clause on a precondition', async () => {
    const ir = await toIr(APPOINTMENT);
    const cmd = ir.contexts[0].commands[0];
    expect(cmd.causes).toEqual(['OwnerRequest', 'ClinicClosure']);
    expect(cmd.preconditions[0].causes).toBeUndefined();
    expect(cmd.preconditions[1].causes).toEqual(['OwnerRequest']);
    expect(cmd.inputs.map((i) => i.name)).toEqual(['appointmentId', 'cause']);
  });

  it('reads the cause of a placement into MomentEntry.cause', async () => {
    const ir = await toIr(APPOINTMENT);
    const moments = ir.flows[0].moments;
    expect(moments[0].contextEntries[0].cause).toBe('OwnerRequest');
    expect(moments[0].contextEntries[1].cause).toBeUndefined();
    expect(moments[1].contextEntries[0].cause).toBe('ClinicClosure');
    expect(moments[1].contextEntries[0].optional).toBe(true);
  });

  it('reads causes on an orchestration command', async () => {
    const ir = await toIr(`
context "C" [Core]
  aggregate "A"
    identity aId: UUID
    command Do
      emits Done
    event Done
      aId: UUID
  orchestration P
    command Go
      causes Manual, Scheduled
      precondition Allowed cause Manual: "Only a person starts it by hand"
      emits Started
    event Started
      aId: UUID
    invoked-by Go
    issues Do
    states S
    compensation none
    timeout "none"
`);
    const go = ir.contexts[0].sagas[0].commands?.[0];
    expect(go?.causes).toEqual(['Manual', 'Scheduled']);
    expect(go?.preconditions[0].causes).toEqual(['Manual']);
  });
});
