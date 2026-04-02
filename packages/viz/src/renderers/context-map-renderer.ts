import type { IntermediateRepresentation } from '@mmmnt/core';
import type { ContextMapLayout, ContextMapNode, ContextMapEdge } from '../types/index.js';

const NODE_WIDTH = 160;
const NODE_HEIGHT = 80;
const NODE_SPACING = 40;
const COLUMNS = 3;

/**
 * Pure function: IR → ContextMapLayout.
 * VZ-01: deterministic — same IR → identical output.
 * VZ-02: pure/no mutation — no side effects; derived from IR only (no visual-only data).
 */
export function renderContextMap(ir: IntermediateRepresentation): ContextMapLayout {
  const nodes = buildNodes(ir);
  const nodeIndex = new Map(nodes.map((n) => [n.contextId, n]));
  const edges = buildEdges(ir, nodeIndex);
  const dimensions = computeDimensions(nodes);

  return { nodes, edges, dimensions };
}

function buildNodes(ir: IntermediateRepresentation): ContextMapNode[] {
  return ir.contexts.map((ctx, index) => {
    const col = index % COLUMNS;
    const row = Math.floor(index / COLUMNS);
    return {
      contextId: ctx.id,
      contextName: ctx.name,
      classification: ctx.classification ?? 'Supporting',
      x: col * (NODE_WIDTH + NODE_SPACING) + NODE_SPACING,
      y: row * (NODE_HEIGHT + NODE_SPACING) + NODE_SPACING,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      isExternal: false,
    };
  });
}

function buildEdges(
  ir: IntermediateRepresentation,
  nodeIndex: ReadonlyMap<string, ContextMapNode>,
): ContextMapEdge[] {
  const seen = new Set<string>();
  const edges: ContextMapEdge[] = [];

  const addEdge = (
    sourceId: string,
    targetId: string,
    relType: string,
    label: string,
  ): void => {
    const key = `${sourceId}|${targetId}|${relType}`;
    if (seen.has(key)) return;
    const sourceNode = nodeIndex.get(sourceId);
    const targetNode = nodeIndex.get(targetId);
    if (!sourceNode || !targetNode) return;
    seen.add(key);
    edges.push({
      sourceContextId: sourceId,
      targetContextId: targetId,
      relationshipType: relType,
      label,
      points: [
        { x: sourceNode.x + sourceNode.width, y: sourceNode.y + sourceNode.height / 2 },
        { x: targetNode.x, y: targetNode.y + targetNode.height / 2 },
      ],
    });
  };

  for (const rel of ir.relationships) {
    addEdge(rel.sourceContextId, rel.targetContextId, rel.relationshipType, rel.relationshipType);
  }

  // Derive edges from flow crossings
  for (const flow of ir.flows) {
    for (const conn of flow.connections) {
      if (conn.connectionType !== 'crosses-to') continue;
      const sourceContextId = resolveSourceContextFromEvent(conn.eventId, conn.sourceMomentId, flow, ir);
      if (sourceContextId) {
        addEdge(sourceContextId, conn.targetContextId, 'crosses-to', 'crosses-to');
      }
    }
  }

  return edges;
}

function resolveSourceContextFromEvent(
  eventId: string,
  sourceMomentId: string,
  flow: { moments: readonly { id: string; contextEntries: readonly { contextId: string }[] }[] },
  ir: IntermediateRepresentation,
): string | undefined {
  for (const ctx of ir.contexts) {
    if (ctx.events.some((e) => e.id === eventId)) {
      return ctx.id;
    }
    for (const agg of ctx.aggregates) {
      if (agg.events.some((e) => e.id === eventId)) {
        return ctx.id;
      }
    }
  }
  // Fallback: resolve from the source moment's context entries
  const sourceMoment = flow.moments.find((m) => m.id === sourceMomentId);
  return sourceMoment?.contextEntries[0]?.contextId;
}

function computeDimensions(nodes: readonly ContextMapNode[]): { width: number; height: number } {
  if (nodes.length === 0) {
    return { width: 0, height: 0 };
  }
  const maxX = Math.max(...nodes.map((n) => n.x + n.width)) + NODE_SPACING;
  const maxY = Math.max(...nodes.map((n) => n.y + n.height)) + NODE_SPACING;
  return { width: maxX, height: maxY };
}
