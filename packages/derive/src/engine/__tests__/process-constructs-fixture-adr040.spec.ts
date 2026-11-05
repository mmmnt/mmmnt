import { describe, it, expect, beforeAll } from 'vitest';
import { resolve } from 'node:path';
import { readdirSync } from 'node:fs';
import { ProjectLoader, type IntermediateRepresentation } from '@mmmnt/core';
import {
  deriveNegativeScenarios,
  generateSimulationScenario,
} from '../simulation-scenario-generator.js';

const VALID = resolve(import.meta.dirname, '../../../../../fixtures/valid/process-constructs');
const filesOf = (dir: string): string[] =>
  readdirSync(resolve(VALID, dir))
    .sort()
    .map((f) => resolve(VALID, dir, f));

let ir: IntermediateRepresentation;
const flow = (name: string) => ir.flows.find((f) => f.name === name)!;

beforeAll(async () => {
  ir = (await new ProjectLoader().loadProject([...filesOf('contexts'), ...filesOf('flows')])).ir;
});

describe('ADR-040 generated assertions over the process-constructs corpus', () => {
  it('derives the refusal of the customer request in the customer flow and not in the organiser flow', () => {
    const customer = deriveNegativeScenarios(ir, flow('Customer cancels')).map((s) => s.scenarioId);
    const organiser = deriveNegativeScenarios(ir, flow('Organiser cancels')).map(
      (s) => s.scenarioId,
    );
    expect(customer.filter((id) => id.includes('WithinRefundWindow'))).toHaveLength(1);
    expect(organiser.filter((id) => id.includes('WithinRefundWindow'))).toHaveLength(0);
    expect(customer.filter((id) => id.includes('BookingIsOpen'))).toHaveLength(1);
    expect(organiser.filter((id) => id.includes('BookingIsOpen'))).toHaveLength(1);
  });

  it('derives the refusal of a process command', () => {
    const ids = deriveNegativeScenarios(ir, flow('Purchase')).map((s) => s.scenarioId);
    expect(ids.some((id) => id.endsWith('neg-StartPurchase-CustomerIsRegistered'))).toBe(true);
  });

  it('streams the process outcome before the policy that reacts to it', () => {
    const types = generateSimulationScenario(ir, flow('Purchase')).events.map((e) => e.eventType);
    expect(types.indexOf('PurchaseCompleted')).toBeLessThan(
      types.indexOf('ReceiptOnPurchaseCompleted'),
    );
  });

  it('ignores the card-network note and orders the reactive column', () => {
    const events = generateSimulationScenario(ir, flow('Checkout')).events;
    const types = events.map((e) => e.eventType);
    expect(JSON.stringify(events)).not.toContain('authorises the card');
    expect(types.indexOf('OrderPlaced')).toBeLessThan(types.indexOf('ReserveSeatsOnOrderPlaced'));
    const policy = events.find((e) => e.eventType === 'ReserveSeatsOnOrderPlaced');
    expect(policy?.causationEventIds).toEqual([
      events.find((e) => e.eventType === 'OrderPlaced')?.eventId,
    ]);
  });
});
