import { describe, it, expect, beforeAll } from 'vitest';
import { MomentParser, type IntermediateRepresentation } from '@mmmnt/core';
import { generateEventCatalog } from '../event-catalog-generator.js';
import { generateImpactAnalysis } from '../impact-analysis-generator.js';
import { TopologyEmitter } from '../topology-emitter.js';

const SOURCE = `
context "Ticketing" [Core]
  aggregate "Customer"
    identity customerId: UUID
    command ReserveSeats
      emits SeatsReserved
    event SeatsReserved
      customerId: UUID
  policy BillOnCompletion
    trigger PurchaseCompleted
    action "Bill the owner"
    chains-to ReserveSeats
  orchestration PurchaseProcess
    command StartPurchase
      emits PurchaseStarted
    command FinishPurchase
      emits PurchaseCompleted
    event PurchaseStarted
      customerId: UUID
    event PurchaseCompleted
      customerId: UUID
      bedId: UUID
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
`;

let ir: IntermediateRepresentation;

beforeAll(async () => {
  const result = await new MomentParser().parseContent(SOURCE);
  if (!result.ir) throw new Error('fixture did not parse');
  ir = result.ir;
});

describe('ADR-040 D1 a process event is attributed to its orchestration', () => {
  it('lists a process event in the event catalog, produced by its process command', () => {
    const entry = generateEventCatalog(ir).events.find((e) => e.eventName === 'PurchaseCompleted');
    expect(entry?.schema.fields.map((f) => f.name)).toEqual(['customerId', 'bedId']);
    expect(entry?.producer).toEqual({
      context: 'Ticketing',
      aggregate: '',
      process: 'PurchaseProcess',
      command: 'FinishPurchase',
    });
    expect(entry?.consumers).toEqual([]);
  });

  it('leaves aggregate events without a process in their producer', () => {
    const entry = generateEventCatalog(ir).events.find((e) => e.eventName === 'SeatsReserved');
    expect(entry?.producer.aggregate).toBe('Customer');
    expect(entry?.producer).not.toHaveProperty('process');
  });

  it('gives impact analysis the process event, its owner and the command that emits it', () => {
    const nodes = generateImpactAnalysis(ir).nodes;
    const event = nodes.find((n) => n.type === 'event' && n.name === 'PurchaseCompleted');
    const command = nodes.find((n) => n.type === 'command' && n.name === 'FinishPurchase');
    expect(event?.owner).toBe('PurchaseProcess');
    expect(event?.dependsOn).toContain('command:Ticketing:FinishPurchase');
    expect(command?.triggers).toContain('event:Ticketing:PurchaseCompleted');
    expect(nodes.find((n) => n.name === 'SeatsReserved')?.owner).toBeUndefined();
  });

  it('attributes a process event and a process command to the process in the topology', () => {
    const nodes = new TopologyEmitter().emit(ir, ir.flows[0]).frames.flatMap((f) => f.nodes);
    const event = nodes.find((n) => n.label === 'PurchaseCompleted');
    const command = nodes.find((n) => n.label === 'FinishPurchase');
    expect(event?.type).toBe('event');
    expect(event?.process).toBe('PurchaseProcess');
    expect(event?.aggregate).toBeUndefined();
    expect(command?.process).toBe('PurchaseProcess');
  });
});

const CHECKOUT = `
context "Ordering" [Core]
  aggregate "Order"
    identity orderId: UUID
    command CancelOrder
      causes CustomerRequest, ShopClosure
      precondition Window cause CustomerRequest: "Ahead of time"
      emits OrderCancelled
    event OrderCancelled
      orderId: UUID

flow "Cancel"
  lane shop "Ordering" [Core]
  lane psp "CardNetwork" [External]
  moment "Customer asks"
    shop: CancelOrder cause CustomerRequest
    shop: OrderCancelled
  moment "Refund is paid"
    note psp: "The card network returns the money"
`;

describe('ADR-040 D2/D3 in the topology', () => {
  it('carries the cause of a placement and the notes of a frame', async () => {
    const { ir: model } = await new MomentParser().parseContent(CHECKOUT);
    const frames = new TopologyEmitter().emit(model!, model!.flows[0]).frames;

    expect(frames[0].nodes.find((n) => n.label === 'CancelOrder')?.cause).toBe('CustomerRequest');
    expect(frames[0].nodes.find((n) => n.label === 'OrderCancelled')?.cause).toBeUndefined();
    expect(frames[0].notes).toBeUndefined();
    expect(frames[1].nodes).toEqual([]);
    expect(frames[1].notes).toEqual([{ text: 'The card network returns the money', lane: 'psp' }]);
  });
});
