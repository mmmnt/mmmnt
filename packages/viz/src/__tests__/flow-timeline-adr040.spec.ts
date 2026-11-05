import { describe, it, expect, beforeAll } from 'vitest';
import { MomentParser, type IntermediateRepresentation } from '@mmmnt/core';
import { renderTimeline } from '../renderers/flow-timeline-renderer.js';

const SOURCE = `
context "Ordering" [Core]
  aggregate "Order"
    identity orderId: UUID
    command PlaceOrder
      causes Web, Phone
      precondition PhoneOnly cause Phone: "A clerk takes the call"
      emits OrderPlaced
    command ReserveSeats
      emits SeatsReserved
    event OrderPlaced
      orderId: UUID
    event SeatsReserved
      orderId: UUID
  policy ReserveSeatsOnOrderPlaced
    trigger OrderPlaced
    action "Reserve the seats"
    chains-to ReserveSeats

flow "Checkout"
  lane shop "Ordering" [Core]
  lane psp "CardNetwork" [External]
  moment "Order placed"
    shop: PlaceOrder cause Web
    shop: OrderPlaced
    shop: ReserveSeatsOnOrderPlaced
      triggered-by OrderPlaced
    shop: ReserveSeats
      triggered-by ReserveSeatsOnOrderPlaced
    shop: SeatsReserved
  moment "Card is authorised"
    note psp: "The card network authorises the card"
`;

let ir: IntermediateRepresentation;

beforeAll(async () => {
  const result = await new MomentParser().parseContent(SOURCE);
  if (!result.ir) throw new Error('fixture did not parse');
  ir = result.ir;
});

describe('ADR-040 timeline rendering', () => {
  it('draws a note-only moment as a column with its label and note text, and no stickies', () => {
    const layout = renderTimeline(ir);
    const entry = layout.entries.find((e) => e.momentName === 'Card is authorised');
    expect(entry).toBeDefined();
    expect(entry?.notes).toEqual([{ text: 'The card network authorises the card', laneId: 'psp' }]);
    expect(entry?.hops).toBeUndefined();
    expect(entry?.causes).toBeUndefined();
  });

  it('places the note-only column after the moment before it', () => {
    const layout = renderTimeline(ir);
    const [first, second] = layout.entries;
    expect(second.x).toBeGreaterThan(first.x);
    expect(second.contextId).toBe(first.contextId);
  });

  it('draws each same-moment triggered-by as an arrow inside its column', () => {
    const layout = renderTimeline(ir);
    const entry = layout.entries.find((e) => e.momentName === 'Order placed');
    expect(entry?.hops).toEqual([
      { from: 'OrderPlaced', to: 'ReserveSeatsOnOrderPlaced' },
      { from: 'ReserveSeatsOnOrderPlaced', to: 'ReserveSeats' },
    ]);
  });

  it('shows the cause of a placement as a chip on its command', () => {
    const layout = renderTimeline(ir);
    const entry = layout.entries.find((e) => e.momentName === 'Order placed');
    expect(entry?.causes).toEqual([{ nodeName: 'PlaceOrder', cause: 'Web' }]);
  });

  it('is deterministic', () => {
    expect(renderTimeline(ir)).toEqual(renderTimeline(ir));
  });
});
