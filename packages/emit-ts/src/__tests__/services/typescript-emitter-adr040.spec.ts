import { describe, it, expect, beforeAll } from 'vitest';
import { MomentParser } from '@mmmnt/core';
import { TypeScriptEmitter } from '../../services/typescript-emitter.js';

const SOURCE = `
context "Clinic" [Core]
  aggregate "Pet"
    identity petId: UUID
    command ReserveBed
      emits BedReserved
    event BedReserved
      petId: UUID
  orchestration AdmissionProcess
    command StartAdmission
      emits AdmissionStarted
    command AbandonAdmission
      emits AdmissionAbandoned
    event AdmissionStarted
      petId: UUID
    event AdmissionAbandoned
      petId: UUID
      reason: string
    invoked-by StartAdmission
    issues ReserveBed
    states Started
    compensation on AbandonAdmission issues ReserveBed
    timeout admissionWindow

context "Billing" [Supporting]
  orchestration InvoiceRun
    command StartRun
      emits RunStarted
    event RunStarted
      runId: UUID
    invoked-by StartRun
    issues Missing
    states Open
    compensation none
    timeout "none"
`;

let files: Map<string, string>;

beforeAll(async () => {
  const result = await new MomentParser().parseContent(SOURCE);
  if (!result.ir) throw new Error('fixture did not parse');
  files = new TypeScriptEmitter().emit(result.ir, { scope: { level: 'system' } }).files;
});

describe('TypeScript emission of process events (ADR-040 D1)', () => {
  it('emits the events an orchestration declares as interfaces', () => {
    const types = files.get('src/clinic/admission-process.process.types.ts') ?? '';
    expect(types).toContain('export interface AdmissionStarted {');
    expect(types).toContain('export interface AdmissionAbandoned {');
    expect(types).toContain('  readonly reason: string;');
  });

  it('exports the process types from the context and adds the events to its event union', () => {
    const index = files.get('src/clinic/index.ts') ?? '';
    expect(index).toContain("export * from './admission-process.process.types.js';");
    expect(index).toContain('AdmissionAbandoned');
    expect(index).toMatch(/export type ClinicEvent = .*AdmissionStarted/);
    expect(index).toMatch(/export type ClinicEvent = .*BedReserved/);
  });

  it('exports a context that has process events but no aggregate', () => {
    expect(files.get('src/billing/run-started.process.types.ts')).toBeUndefined();
    expect(files.get('src/billing/invoice-run.process.types.ts')).toContain(
      'export interface RunStarted {',
    );
    expect(files.get('src/index.ts')).toContain("export * from './billing/index.js';");
  });

  it('emits no process file for an aggregate-level scope', async () => {
    const result = await new MomentParser().parseContent(SOURCE);
    const scoped = new TypeScriptEmitter().emit(result.ir!, {
      scope: { level: 'aggregate', targets: ['Pet'] },
    }).files;
    expect([...scoped.keys()].some((k) => k.includes('.process.'))).toBe(false);
  });
});
