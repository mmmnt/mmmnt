import { describe, it, expect, beforeAll } from 'vitest';
import { MomentParser, type IntermediateRepresentation } from '@mmmnt/core';
import { generateEventCatalog } from '../event-catalog-generator.js';
import { generateImpactAnalysis } from '../impact-analysis-generator.js';
import { TopologyEmitter } from '../topology-emitter.js';

const SOURCE = `
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
      bedId: UUID
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
`;

let ir: IntermediateRepresentation;

beforeAll(async () => {
  const result = await new MomentParser().parseContent(SOURCE);
  if (!result.ir) throw new Error('fixture did not parse');
  ir = result.ir;
});

describe('ADR-040 D1 a process event is attributed to its orchestration', () => {
  it('lists a process event in the event catalog, produced by its process command', () => {
    const entry = generateEventCatalog(ir).events.find((e) => e.eventName === 'AdmissionCompleted');
    expect(entry?.schema.fields.map((f) => f.name)).toEqual(['petId', 'bedId']);
    expect(entry?.producer).toEqual({
      context: 'Clinic',
      aggregate: '',
      process: 'AdmissionProcess',
      command: 'FinishAdmission',
    });
    expect(entry?.consumers).toEqual([]);
  });

  it('leaves aggregate events without a process in their producer', () => {
    const entry = generateEventCatalog(ir).events.find((e) => e.eventName === 'BedReserved');
    expect(entry?.producer.aggregate).toBe('Pet');
    expect(entry?.producer).not.toHaveProperty('process');
  });

  it('gives impact analysis the process event, its owner and the command that emits it', () => {
    const nodes = generateImpactAnalysis(ir).nodes;
    const event = nodes.find((n) => n.type === 'event' && n.name === 'AdmissionCompleted');
    const command = nodes.find((n) => n.type === 'command' && n.name === 'FinishAdmission');
    expect(event?.owner).toBe('AdmissionProcess');
    expect(event?.dependsOn).toContain('command:Clinic:FinishAdmission');
    expect(command?.triggers).toContain('event:Clinic:AdmissionCompleted');
    expect(nodes.find((n) => n.name === 'BedReserved')?.owner).toBeUndefined();
  });

  it('attributes a process event and a process command to the process in the topology', () => {
    const nodes = new TopologyEmitter().emit(ir, ir.flows[0]).frames.flatMap((f) => f.nodes);
    const event = nodes.find((n) => n.label === 'AdmissionCompleted');
    const command = nodes.find((n) => n.label === 'FinishAdmission');
    expect(event?.type).toBe('event');
    expect(event?.process).toBe('AdmissionProcess');
    expect(event?.aggregate).toBeUndefined();
    expect(command?.process).toBe('AdmissionProcess');
  });
});

const CHECKOUT = `
context "Ordering" [Core]
  aggregate "Order"
    identity orderId: UUID
    command CancelOrder
      causes OwnerRequest, ShopClosure
      precondition Window cause OwnerRequest: "Ahead of time"
      emits OrderCancelled
    event OrderCancelled
      orderId: UUID

flow "Cancel"
  lane shop "Ordering" [Core]
  lane psp "CardNetwork" [External]
  moment "Owner asks"
    shop: CancelOrder cause OwnerRequest
    shop: OrderCancelled
  moment "Refund is paid"
    note psp: "The card network returns the money"
`;

describe('ADR-040 D2/D3 in the topology', () => {
  it('carries the cause of a placement and the notes of a frame', async () => {
    const { ir: model } = await new MomentParser().parseContent(CHECKOUT);
    const frames = new TopologyEmitter().emit(model!, model!.flows[0]).frames;

    expect(frames[0].nodes.find((n) => n.label === 'CancelOrder')?.cause).toBe('OwnerRequest');
    expect(frames[0].nodes.find((n) => n.label === 'OrderCancelled')?.cause).toBeUndefined();
    expect(frames[0].notes).toBeUndefined();
    expect(frames[1].nodes).toEqual([]);
    expect(frames[1].notes).toEqual([{ text: 'The card network returns the money', lane: 'psp' }]);
  });
});
