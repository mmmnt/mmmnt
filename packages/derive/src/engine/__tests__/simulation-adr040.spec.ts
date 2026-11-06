import { describe, it, expect } from 'vitest';
import { MomentParser, type IntermediateRepresentation } from '@mmmnt/core';
import {
  deriveNegativeScenarios,
  generateSimulationScenario,
} from '../simulation-scenario-generator.js';

async function load(source: string): Promise<IntermediateRepresentation> {
  const result = await new MomentParser().parseContent(source);
  if (!result.success || !result.ir) {
    throw new Error(result.diagnostics.map((d) => d.message).join('; '));
  }
  return result.ir;
}

const TICKETING = `
context "Ticketing" [Core]
  aggregate "Booking"
    identity bookingId: UUID
    command CancelBooking
      input bookingId: UUID
      causes CustomerRequest, OrganiserCancellation
      precondition BookingIsOpen: "The booking has not been completed"
      precondition WithinRefundWindow cause CustomerRequest: "The customer cancels 24 hours ahead"
      emits BookingCancelled
    event BookingCancelled
      bookingId: UUID

flow "Customer cancels"
  lane desk "Ticketing" [Core]
  moment "Customer asks to cancel"
    desk: CancelBooking cause CustomerRequest
    desk: BookingCancelled

flow "Ticketing cancels"
  lane desk "Ticketing" [Core]
  moment "Organiser is unavailable"
    desk: CancelBooking cause OrganiserCancellation
    desk: BookingCancelled
`;

describe('ADR-040 D2 cause-scoped negative scenarios', () => {
  it('derives a scoped precondition only in the flow that places its cause', async () => {
    const ir = await load(TICKETING);
    const owner = deriveNegativeScenarios(ir, ir.flows[0]).map((s) => s.scenarioId);
    const ticketing = deriveNegativeScenarios(ir, ir.flows[1]).map((s) => s.scenarioId);

    expect(owner.some((id) => id.endsWith('neg-CancelBooking-WithinRefundWindow'))).toBe(true);
    expect(ticketing.some((id) => id.includes('WithinRefundWindow'))).toBe(false);
  });

  it('derives an unscoped precondition in both flows', async () => {
    const ir = await load(TICKETING);
    for (const flow of ir.flows) {
      const ids = deriveNegativeScenarios(ir, flow).map((s) => s.scenarioId);
      expect(ids.some((id) => id.endsWith('neg-CancelBooking-BookingIsOpen'))).toBe(true);
    }
  });

  it('names the cause in the failure event and the when text', async () => {
    const ir = await load(TICKETING);
    const scenario = deriveNegativeScenarios(ir, ir.flows[0]).find((s) =>
      s.scenarioId.includes('WithinRefundWindow'),
    );
    const failure = scenario?.events[scenario.events.length - 1];
    expect(failure?.payload.cause).toBe('CustomerRequest');
    expect(scenario?.when).toBe(
      'CancelBooking is invoked for CustomerRequest without satisfying WithinRefundWindow',
    );
  });

  it('leaves the failure payload and when text unchanged for a placement with no cause', async () => {
    const ir = await load(`
context "Ticketing" [Core]
  aggregate "Customer"
    identity customerId: UUID
    command Register
      precondition NotRegistered: "The customer is new"
      emits Registered
    event Registered
      customerId: UUID
flow "F"
  lane l "Ticketing" [Core]
  moment "M"
    l: Register
    l: Registered
`);
    const scenario = deriveNegativeScenarios(ir, ir.flows[0])[0];
    const failure = scenario.events[scenario.events.length - 1];
    expect('cause' in failure.payload).toBe(false);
    expect(scenario.when).toBe('Register is invoked without satisfying NotRegistered');
  });
});

const PURCHASE_PROCESS = `
context "Ticketing" [Core]
  aggregate "Customer"
    identity customerId: UUID
    command ReserveSeats
      emits SeatsReserved
    event SeatsReserved
      customerId: UUID
  policy BillOnCompletion
    trigger PurchaseCompleted
    action "Bill the customer"
    chains-to ReserveSeats
  orchestration PurchaseProcess
    command StartPurchase
      input customerId: UUID
      precondition CustomerIsRegistered: "The customer has a ticketing record"
      emits PurchaseStarted
    command FinishPurchase
      emits PurchaseCompleted
    event PurchaseStarted
      customerId: UUID
    event PurchaseCompleted
      customerId: UUID
    invoked-by StartPurchase
    issues ReserveSeats
    states Started
    compensation none
    timeout purchaseWindow

flow "Purchase"
  lane proc "Ticketing" [Core]
  moment "Purchase starts"
    proc: StartPurchase
    proc: PurchaseStarted
  moment "Purchase completes"
    proc: FinishPurchase
    proc: PurchaseCompleted
  moment "Customer is billed"
    proc: BillOnCompletion
      triggered-by PurchaseCompleted
    proc: ReserveSeats
`;

describe('ADR-040 D1/D2 orchestration commands in derivation', () => {
  it('derives negative scenarios for a placed orchestration command', async () => {
    const ir = await load(PURCHASE_PROCESS);
    const ids = deriveNegativeScenarios(ir, ir.flows[0]).map((s) => s.scenarioId);
    expect(ids.some((id) => id.endsWith('neg-StartPurchase-CustomerIsRegistered'))).toBe(true);
  });

  it('puts a process event in the stream after its command, with its declared fields', async () => {
    const ir = await load(PURCHASE_PROCESS);
    const events = generateSimulationScenario(ir, ir.flows[0]).events;
    const types = events.map((e) => e.eventType);
    expect(types.indexOf('PurchaseCompleted')).toBe(types.indexOf('SimProcess.FinishPurchase') + 1);
    const completed = events.find((e) => e.eventType === 'PurchaseCompleted');
    expect(completed?.payload.customerId).toBe('customerId-001');
    expect(completed?.productSource).toBe('ticketing');
  });

  it('reaches a policy triggered by a process event, caused by that event', async () => {
    const ir = await load(PURCHASE_PROCESS);
    const events = generateSimulationScenario(ir, ir.flows[0]).events;
    const completed = events.find((e) => e.eventType === 'PurchaseCompleted');
    const policy = events.find((e) => e.eventType === 'BillOnCompletion');
    expect(policy?.causationEventIds).toEqual([completed?.eventId]);
  });
});

const CHECKOUT = `
context "Ordering" [Core]
  aggregate "Order"
    identity orderId: UUID
    command PlaceOrder
      emits OrderPlaced
    command RecordPayment
      emits PaymentRecorded
    event OrderPlaced
      orderId: UUID
    event PaymentRecorded
      orderId: UUID

flow "Checkout"
  lane shop "Ordering" [Core]
  lane psp "CardNetwork" [External]
  moment "Order placed"
    shop: PlaceOrder
    shop: OrderPlaced
  moment "Card is authorised"
    note psp: "The card network authorises the card and answers within seconds"
  moment "Payment recorded"
    shop: RecordPayment
      triggered-by OrderPlaced
    shop: PaymentRecorded
`;

describe('ADR-040 D3 notes in simulation', () => {
  it('adds no event and no path node for a note-only moment', async () => {
    const ir = await load(CHECKOUT);
    const scenario = generateSimulationScenario(ir, ir.flows[0]);
    expect(scenario.events.map((e) => e.eventType)).toEqual([
      'SimProcess.PlaceOrder',
      'OrderPlaced',
      'SimProcess.RecordPayment',
      'PaymentRecorded',
    ]);
    expect(scenario.expectedPath).toHaveLength(4);
    expect(JSON.stringify(scenario)).not.toContain('card network');
  });
});

const TICKETWAVE = `
context "Ordering" [Core]
  aggregate "Order"
    identity orderId: UUID
    command PlaceOrder
      emits OrderPlaced
    event OrderPlaced
      orderId: UUID
  policy ReserveSeatsOnOrderPlaced
    trigger OrderPlaced
    action "Reserve the seats"
    chains-to ReserveSeats
  aggregate "Inventory"
    identity inventoryId: UUID
    command ReserveSeats
      emits SeatsReserved
    event SeatsReserved
      inventoryId: UUID

flow "Reactive column"
  lane shop "Ordering" [Core]
  moment "Order placed"
    shop: PlaceOrder
    shop: OrderPlaced
    shop: ReserveSeatsOnOrderPlaced
      triggered-by OrderPlaced
    shop: ReserveSeats
      triggered-by ReserveSeatsOnOrderPlaced
    shop: SeatsReserved
`;

describe('ADR-040 D4 same-moment hops in simulation', () => {
  it('resolves each hop to the node placed just before it in the same moment', async () => {
    const ir = await load(TICKETWAVE);
    const events = generateSimulationScenario(ir, ir.flows[0]).events;
    const byType = (t: string) => events.find((e) => e.eventType === t);

    const placed = byType('OrderPlaced');
    const policy = byType('ReserveSeatsOnOrderPlaced');
    const command = byType('SimProcess.ReserveSeats');
    expect(policy?.causationEventIds).toEqual([placed?.eventId]);
    expect(command?.causationEventIds).toEqual([policy?.eventId]);
  });

  it('keeps the declared order of the three nodes in the stream', async () => {
    const ir = await load(TICKETWAVE);
    const types = generateSimulationScenario(ir, ir.flows[0]).events.map((e) => e.eventType);
    expect(types.indexOf('OrderPlaced')).toBeLessThan(types.indexOf('ReserveSeatsOnOrderPlaced'));
    expect(types.indexOf('ReserveSeatsOnOrderPlaced')).toBeLessThan(
      types.indexOf('SimProcess.ReserveSeats'),
    );
  });

  it('parses without a V43 warning when a policy declares both hops', async () => {
    const result = await new MomentParser().parseContent(TICKETWAVE);
    expect(result.diagnostics.filter((d) => d.severity !== 'info')).toEqual([]);
  });
});
