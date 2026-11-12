import { describe, it, expect, beforeAll } from 'vitest';
import type { IntermediateRepresentation } from '@mmmnt/core';
import { projectBoard } from '../project-board.js';
import { loadIr } from './helpers.js';

let ir: IntermediateRepresentation;
beforeAll(async () => {
  ir = await loadIr('fixtures/valid/process-constructs');
});

describe('the manifest lists the model nodes of a context', () => {
  it('names a command with its kind and context', () => {
    const { manifest } = projectBoard(ir);
    expect(manifest.nodes).toContainEqual(
      expect.objectContaining({ kind: 'command', name: 'CancelBooking', context: 'Ticketing' }),
    );
  });
});

describe('the manifest lists what each flow places', () => {
  it('places a node with its flow and moment, and a cause on the command', () => {
    const { manifest } = projectBoard(ir);
    expect(manifest.nodes).toContainEqual(
      expect.objectContaining({
        kind: 'command',
        name: 'CancelBooking',
        context: 'Ticketing',
        role: 'placement',
        flow: 'Customer cancels',
        moment: 'Customer asks to cancel',
        cause: 'CustomerRequest',
      }),
    );
  });

  it('lists a flow and each of its moments, and a note as a node of no context', () => {
    const { manifest } = projectBoard(ir);
    expect(manifest.nodes).toContainEqual(
      expect.objectContaining({ kind: 'flow', name: 'Checkout' }),
    );
    expect(manifest.nodes).toContainEqual(
      expect.objectContaining({ kind: 'moment', name: 'Card is authorised', flow: 'Checkout' }),
    );
    expect(manifest.nodes).toContainEqual(
      expect.objectContaining({
        kind: 'note',
        name: 'The card network authorises the card and answers within seconds',
        flow: 'Checkout',
        moment: 'Card is authorised',
        context: 'CardNetwork',
      }),
    );
  });

  it('lists a triggered-by hop as an edge between the two placed nodes', () => {
    const { manifest } = projectBoard(ir);
    expect(manifest.edges).toContainEqual(
      expect.objectContaining({
        kind: 'triggered-by',
        from: 'OrderPlaced',
        to: 'ReserveSeatsOnOrderPlaced',
        flow: 'Checkout',
      }),
    );
  });
});

describe('the manifest lists branch arms and outcome exits', () => {
  it('lists an arm as a branch node and marks an outcome exit', async () => {
    const tw = await loadIr('examples/ticketwave/spec/ticketwave.moment');
    const { manifest } = projectBoard(tw);
    expect(manifest.nodes).toContainEqual(
      expect.objectContaining({ kind: 'branch', name: 'approved', moment: 'Payment processing' }),
    );
    expect(manifest.nodes.some((n) => n.exit === 'outcome')).toBe(true);
  });
});

describe('refusals, orchestration commands and edges', () => {
  it('lists a cause-scoped precondition as a refusal of its command (ADR-040)', () => {
    const { manifest } = projectBoard(ir);
    expect(manifest.nodes).toContainEqual(
      expect.objectContaining({
        kind: 'refusal',
        name: 'WithinRefundWindow',
        of: 'CancelBooking',
        cause: 'CustomerRequest',
      }),
    );
  });

  it('lists a policy as the reaction of its trigger and the chain to its command', () => {
    const { manifest } = projectBoard(ir);
    expect(manifest.edges).toContainEqual(
      expect.objectContaining({
        kind: 'triggers',
        to: 'ReserveSeatsOnOrderPlaced',
        from: 'OrderPlaced',
      }),
    );
    expect(manifest.edges).toContainEqual(
      expect.objectContaining({
        kind: 'chains-to',
        from: 'ReserveSeatsOnOrderPlaced',
        to: 'ReserveSeats',
      }),
    );
  });

  it('lists no definition twice', async () => {
    for (const model of [ir, await loadIr('examples/ticketwave/spec/ticketwave.moment')]) {
      const keys = projectBoard(model)
        .manifest.nodes.filter((n) => n.role === 'definition')
        .map((n) => [n.frame, n.kind, n.name, n.context, n.flow, n.moment, n.of].join('|'));
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});
