import type { NodeKind } from './palette.js';
import type { BoardItem, ManifestNode } from './types.js';

/** The part of a key that is shared by repeats: frame, kind, name, context, moment id, arm. */
export function baseKey(
  n: Pick<ManifestNode, 'frame' | 'kind' | 'name' | 'context' | 'momentId' | 'arm'>,
): string {
  return [n.frame, n.kind, n.name, n.context, n.momentId ?? '', n.arm ?? ''].join('|');
}

/**
 * Hands each manifest key to the item that draws the node, in drawing order, so one node is drawn
 * as exactly one item and an item carries the key of the node it draws (ADR-048 D6).
 */
export class NodeKeys {
  private readonly queues = new Map<string, string[]>();

  constructor(nodes: readonly ManifestNode[]) {
    for (const n of nodes) {
      const base = baseKey(n);
      this.queues.set(base, [...(this.queues.get(base) ?? []), n.key]);
    }
  }

  take(
    frame: string,
    kind: NodeKind,
    name: string,
    context: string,
    momentId?: string,
    arm?: string,
  ): string | undefined {
    return this.queues.get(baseKey({ frame, kind, name, context, momentId, arm }))?.shift();
  }

  /** Marks an item as the drawing of a node; returns the item. */
  claim<T extends BoardItem>(
    item: T,
    frame: string,
    kind: NodeKind,
    name: string,
    context: string,
    momentId?: string,
    arm?: string,
  ): T {
    const key = this.take(frame, kind, name, context, momentId, arm);
    if (key !== undefined) item.key = key;
    return item;
  }
}
