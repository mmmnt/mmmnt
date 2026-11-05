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
