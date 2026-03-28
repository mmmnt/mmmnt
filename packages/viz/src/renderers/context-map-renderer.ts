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
  const edges: ContextMapEdge[] = [];

  for (const rel of ir.relationships) {
    const sourceNode = nodeIndex.get(rel.sourceContextId);
    const targetNode = nodeIndex.get(rel.targetContextId);

    // Skip edges referencing missing contexts
    if (!sourceNode || !targetNode) continue;

    edges.push({
      sourceContextId: rel.sourceContextId,
      targetContextId: rel.targetContextId,
      relationshipType: rel.relationshipType,
      label: rel.relationshipType,
      points: [
        { x: sourceNode.x + sourceNode.width, y: sourceNode.y + sourceNode.height / 2 },
        { x: targetNode.x, y: targetNode.y + targetNode.height / 2 },
      ],
    });
  }

  return edges;
}

function computeDimensions(nodes: readonly ContextMapNode[]): { width: number; height: number } {
  if (nodes.length === 0) {
    return { width: 0, height: 0 };
  }
  const maxX = Math.max(...nodes.map((n) => n.x + n.width)) + NODE_SPACING;
  const maxY = Math.max(...nodes.map((n) => n.y + n.height)) + NODE_SPACING;
  return { width: maxX, height: maxY };
}
