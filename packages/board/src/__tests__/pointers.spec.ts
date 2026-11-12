import { describe, it, expect, beforeAll } from 'vitest';
import type { IntermediateRepresentation } from '@mmmnt/core';
import { BoardPointerError } from '../pointers.js';
import { projectBoard } from '../project-board.js';
import { loadIr, numbered } from './helpers.js';

let ir: IntermediateRepresentation;
beforeAll(async () => {
  ir = numbered(await loadIr('fixtures/valid/process-constructs'));
});

describe('spec pointers from the sidecar (ADR-048 D8)', () => {
  it('draws a pointer under the sticky and records it on the node', () => {
    const board = projectBoard(ir, {
      pointers: [{ momentId: 'N1.M1', kind: 'command', name: 'CancelBooking', pointer: 'S:931' }],
    });
    const thread = board.frames.find((f) => f.id === 'thread-N1')!;
    expect(thread.items.some((i) => i.widget === 'text' && i.text === 'S:931')).toBe(true);
    expect(board.manifest.nodes).toContainEqual(
      expect.objectContaining({
        kind: 'command',
        name: 'CancelBooking',
        momentId: 'N1.M1',
        pointer: 'S:931',
      }),
    );
  });

  it('joins on kind, name and context when no moment is named', () => {
    const board = projectBoard(ir, {
      pointers: [{ kind: 'aggregate', name: 'Booking', context: 'Ticketing', pointer: 'PRD 7.2' }],
    });
    expect(board.frames.flatMap((f) => f.items).length).toBeGreaterThan(0);
    expect(board.manifest.nodes).toContainEqual(
      expect.objectContaining({ kind: 'aggregate', name: 'Booking', pointer: 'PRD 7.2' }),
    );
  });

  it('draws nothing without a sidecar', () => {
    const board = projectBoard(ir);
    expect(board.manifest.nodes.some((n) => n.pointer !== undefined)).toBe(false);
  });

  it('refuses a pointer that names no node, so a stale one is not dropped', () => {
    const stale = { kind: 'command' as const, name: 'NoSuchCommand', pointer: 'S:1' };
    expect(() => projectBoard(ir, { pointers: [stale] })).toThrow(BoardPointerError);
  });
});
