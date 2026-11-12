import type { NodeKind } from './palette.js';
import type { Pointer } from './types.js';

export class BoardPointerError extends Error {
  constructor(readonly unmatched: Pointer[]) {
    super(
      `A pointer matches no node: ${unmatched
        .map((p) =>
          [p.momentId, p.kind, p.name, p.context].filter((x) => x !== undefined).join(' / '),
        )
        .join('; ')}`,
    );
    this.name = 'BoardPointerError';
  }
}

/** Spec pointers from the sidecar, joined on (momentId, kind, name) or (kind, name, context) (ADR-048 D8). */
export class PointerIndex {
  private readonly used = new Set<Pointer>();

  constructor(private readonly pointers: readonly Pointer[] = []) {}

  find(kind: NodeKind, name: string, context: string, momentId?: string): string | undefined {
    const hit = this.pointers.find((p) => {
      if (p.kind !== kind || p.name !== name) return false;
      if (p.momentId !== undefined) return p.momentId === momentId;
      return p.context === undefined || p.context === context;
    });
    if (!hit) return undefined;
    this.used.add(hit);
    return hit.pointer;
  }

  assertAllUsed(): void {
    const unmatched = this.pointers.filter((p) => !this.used.has(p));
    if (unmatched.length > 0) throw new BoardPointerError(unmatched);
  }
}
