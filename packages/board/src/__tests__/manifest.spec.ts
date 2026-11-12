import { describe, it, expect, beforeAll } from 'vitest';
import type { IntermediateRepresentation } from '@mmmnt/core';
import { projectBoard } from '../project-board.js';
import type { BoardManifest } from '../types.js';
import { loadIr, numbered } from './helpers.js';

let pc: BoardManifest;
let tw: BoardManifest;
beforeAll(async () => {
  pc = projectBoard(numbered(await loadIr('fixtures/valid/process-constructs'))).manifest;
  tw = projectBoard(numbered(await loadIr('examples/ticketwave/spec/ticketwave.moment'))).manifest;
});

describe('definitions', () => {
  it('names a command with its kind, context and frame', () => {
    expect(pc.nodes).toContainEqual(
      expect.objectContaining({
        kind: 'command',
        name: 'CancelBooking',
        context: 'Ticketing',
        role: 'definition',
        frame: 'aggregate-Booking',
      }),
    );
  });

  it('gives every node a stable key, unique on the board', () => {
    for (const m of [pc, tw]) {
      const keys = m.nodes.map((n) => n.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it('lists a cause-scoped precondition as a refusal of its command (ADR-040)', () => {
    expect(pc.nodes).toContainEqual(
      expect.objectContaining({
        kind: 'refusal',
        name: 'WithinRefundWindow',
        of: 'CancelBooking',
        cause: 'CustomerRequest',
        role: 'definition',
      }),
    );
  });
});

describe('placements', () => {
  it('places a node with its flow, moment and moment id, and a cause on the command', () => {
    expect(pc.nodes).toContainEqual(
      expect.objectContaining({
        kind: 'command',
        name: 'CancelBooking',
        role: 'placement',
        momentId: 'N1.M1',
        cause: 'CustomerRequest',
        frame: 'thread-N1',
      }),
    );
  });

  it('draws the refusals of a placed command in its moment, scoped to the cause', () => {
    const refusals = pc.nodes.filter(
      (n) => n.kind === 'refusal' && n.role === 'placement' && n.momentId === 'N1.M1',
    );
    expect(refusals.map((r) => r.name).sort()).toEqual(['BookingIsOpen', 'WithinRefundWindow']);
    const other = pc.nodes.filter(
      (n) => n.kind === 'refusal' && n.role === 'placement' && n.momentId === 'N2.M1',
    );
    expect(other.map((r) => r.name)).toEqual(['BookingIsOpen']);
  });

  it('lists a note as a node of the lane it speaks for', () => {
    expect(pc.nodes).toContainEqual(
      expect.objectContaining({ kind: 'note', context: 'CardNetwork', momentId: 'N3.M2' }),
    );
  });

  it('lists a policy with its condition as written (ADR-045)', () => {
    expect(tw.nodes).toContainEqual(
      expect.objectContaining({
        kind: 'policy',
        condition: 'reason = expired',
        role: 'definition',
      }),
    );
  });

  it('numbers the arms and records the outcome exit (ADR-043)', () => {
    const arms = new Set(tw.nodes.filter((n) => n.kind === 'branch').map((n) => n.arm));
    expect([...arms].every((a) => /^N\d+\.M\d+-B\d+$/.test(a ?? ''))).toBe(true);
    const exit = tw.nodes.find((n) => n.exit === 'outcome');
    expect(arms.has(exit?.arm)).toBe(true);
    expect(exit?.armCondition).toBeDefined();
  });

  it('lists a triggered-by hop and a policy chain as edges', () => {
    expect(pc.edges).toContainEqual(
      expect.objectContaining({
        kind: 'triggered-by',
        from: 'OrderPlaced',
        to: 'ReserveSeatsOnOrderPlaced',
      }),
    );
    expect(pc.edges).toContainEqual(
      expect.objectContaining({
        kind: 'chains-to',
        from: 'ReserveSeatsOnOrderPlaced',
        to: 'ReserveSeats',
      }),
    );
  });
});

describe('numbers in the manifest', () => {
  it('numbers the thread and context frames and says where the number came from', () => {
    expect(pc.frames).toContainEqual(
      expect.objectContaining({ id: 'thread-N3', number: 'N3', numberSource: 'name' }),
    );
    expect(pc.frames).toContainEqual(
      expect.objectContaining({ id: 'context-C1', number: 'C1', numberSource: 'load-order' }),
    );
  });

  it('records a moment id that came from the position', () => {
    expect(pc.momentIdSource).toContainEqual(expect.objectContaining({ id: 'N1.M1' }));
  });
});

describe('what a model must carry', () => {
  it('refuses an unnumbered flow', async () => {
    const ir: IntermediateRepresentation = await loadIr('fixtures/valid/process-constructs');
    expect(() => projectBoard(ir)).toThrow(/no id/);
  });
});
