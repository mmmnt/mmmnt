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

const CLINIC = `
context "Clinic" [Core]
  aggregate "Appointment"
    identity appointmentId: UUID
    command CancelAppointment
      input appointmentId: UUID
      causes OwnerRequest, ClinicClosure
      precondition AppointmentIsOpen: "The appointment has not been completed"
      precondition WithinCancellationWindow cause OwnerRequest: "The owner cancels 24 hours ahead"
      emits AppointmentCancelled
    event AppointmentCancelled
      appointmentId: UUID

flow "Owner cancels"
  lane desk "Clinic" [Core]
  moment "Owner asks to cancel"
    desk: CancelAppointment cause OwnerRequest
    desk: AppointmentCancelled

flow "Clinic cancels"
  lane desk "Clinic" [Core]
  moment "Vet is unavailable"
    desk: CancelAppointment cause ClinicClosure
    desk: AppointmentCancelled
`;

describe('ADR-040 D2 cause-scoped negative scenarios', () => {
  it('derives a scoped precondition only in the flow that places its cause', async () => {
    const ir = await load(CLINIC);
    const owner = deriveNegativeScenarios(ir, ir.flows[0]).map((s) => s.scenarioId);
    const clinic = deriveNegativeScenarios(ir, ir.flows[1]).map((s) => s.scenarioId);

    expect(owner.some((id) => id.endsWith('neg-CancelAppointment-WithinCancellationWindow'))).toBe(
      true,
    );
    expect(clinic.some((id) => id.includes('WithinCancellationWindow'))).toBe(false);
  });

  it('derives an unscoped precondition in both flows', async () => {
    const ir = await load(CLINIC);
    for (const flow of ir.flows) {
      const ids = deriveNegativeScenarios(ir, flow).map((s) => s.scenarioId);
      expect(ids.some((id) => id.endsWith('neg-CancelAppointment-AppointmentIsOpen'))).toBe(true);
    }
  });

  it('names the cause in the failure event and the when text', async () => {
    const ir = await load(CLINIC);
    const scenario = deriveNegativeScenarios(ir, ir.flows[0]).find((s) =>
      s.scenarioId.includes('WithinCancellationWindow'),
    );
    const failure = scenario?.events[scenario.events.length - 1];
    expect(failure?.payload.cause).toBe('OwnerRequest');
    expect(scenario?.when).toBe(
      'CancelAppointment is invoked for OwnerRequest without satisfying WithinCancellationWindow',
    );
  });

  it('leaves the failure payload and when text unchanged for a placement with no cause', async () => {
    const ir = await load(`
context "Clinic" [Core]
  aggregate "Pet"
    identity petId: UUID
    command Register
      precondition NotRegistered: "The pet is new"
      emits Registered
    event Registered
      petId: UUID
flow "F"
  lane l "Clinic" [Core]
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

const ADMISSION = `
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
      input petId: UUID
      precondition PetIsRegistered: "The pet has a clinic record"
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

flow "Admission"
  lane proc "Clinic" [Core]
  moment "Admission starts"
    proc: StartAdmission
    proc: AdmissionStarted
  moment "Admission completes"
    proc: FinishAdmission
    proc: AdmissionCompleted
  moment "Owner is billed"
    proc: BillOnCompletion
      triggered-by AdmissionCompleted
    proc: ReserveBed
`;

describe('ADR-040 D1/D2 orchestration commands in derivation', () => {
  it('derives negative scenarios for a placed orchestration command', async () => {
    const ir = await load(ADMISSION);
    const ids = deriveNegativeScenarios(ir, ir.flows[0]).map((s) => s.scenarioId);
    expect(ids.some((id) => id.endsWith('neg-StartAdmission-PetIsRegistered'))).toBe(true);
  });

  it('puts a process event in the stream after its command, with its declared fields', async () => {
    const ir = await load(ADMISSION);
    const events = generateSimulationScenario(ir, ir.flows[0]).events;
    const types = events.map((e) => e.eventType);
    expect(types.indexOf('AdmissionCompleted')).toBe(
      types.indexOf('SimProcess.FinishAdmission') + 1,
    );
    const completed = events.find((e) => e.eventType === 'AdmissionCompleted');
    expect(completed?.payload.petId).toBe('petId-001');
    expect(completed?.productSource).toBe('clinic');
  });

  it('reaches a policy triggered by a process event, caused by that event', async () => {
    const ir = await load(ADMISSION);
    const events = generateSimulationScenario(ir, ir.flows[0]).events;
    const completed = events.find((e) => e.eventType === 'AdmissionCompleted');
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
