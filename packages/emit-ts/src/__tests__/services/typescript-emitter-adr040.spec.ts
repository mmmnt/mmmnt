import { describe, it, expect, beforeAll } from 'vitest';
import { MomentParser } from '@mmmnt/core';
import { TypeScriptEmitter } from '../../services/typescript-emitter.js';

const SOURCE = `
context "Ticketing" [Core]
  aggregate "Customer"
    identity customerId: UUID
    command ReserveSeats
      emits SeatsReserved
    event SeatsReserved
      customerId: UUID
  orchestration PurchaseProcess
    command StartPurchase
      emits PurchaseStarted
    command AbandonPurchase
      emits PurchaseAbandoned
    event PurchaseStarted
      customerId: UUID
    event PurchaseAbandoned
      customerId: UUID
      reason: string
    invoked-by StartPurchase
    issues ReserveSeats
    states Started
    compensation on AbandonPurchase issues ReserveSeats
    timeout purchaseWindow

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
    const types = files.get('src/ticketing/purchase-process.process.types.ts') ?? '';
    expect(types).toContain('export interface PurchaseStarted {');
    expect(types).toContain('export interface PurchaseAbandoned {');
    expect(types).toContain('  readonly reason: string;');
  });

  it('exports the process types from the context and adds the events to its event union', () => {
    const index = files.get('src/ticketing/index.ts') ?? '';
    expect(index).toContain("export * from './purchase-process.process.types.js';");
    expect(index).toContain('PurchaseAbandoned');
    expect(index).toMatch(/export type TicketingEvent = .*PurchaseStarted/);
    expect(index).toMatch(/export type TicketingEvent = .*SeatsReserved/);
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
      scope: { level: 'aggregate', targets: ['Customer'] },
    }).files;
    expect([...scoped.keys()].some((k) => k.includes('.process.'))).toBe(false);
  });
});
