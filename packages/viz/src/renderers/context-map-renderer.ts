import type { IntermediateRepresentation } from '@mmmnt/core';
import type { ContextMapLayout, ContextMapNode, ContextMapEdge } from '../types/index.js';

const NODE_WIDTH = 160;
const NODE_HEIGHT = 80;
const NODE_SPACING = 40;
const COLUMNS = 3;

/**
 * Pure function: IR → ContextMapLayout.
 * VZ-01: derived from IR only, no visual-only data.
 * VZ-02: deterministic — same IR → identical output.
 */
export function renderContextMap(ir: IntermediateRepresentation): ContextMapLayout {
  const nodes = buildNodes(ir);
  const nodeIndex = new Map(nodes.map((n) => [n.contextName, n]));
  const edges = buildEdges(ir, nodeIndex);
  const dimensions = computeDimensions(nodes);

  return { nodes, edges, dimensions };
}

function buildNodes(ir: IntermediateRepresentation): ContextMapNode[] {
  return ir.contexts.map((ctx, index) => {
    const col = index % COLUMNS;
    const row = Math.floor(index / COLUMNS);
    return {
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
  return ir.relationships.map((rel) => {
    const sourceNode = nodeIndex.get(findContextName(ir, rel.sourceContextId));
    const targetNode = nodeIndex.get(findContextName(ir, rel.targetContextId));

    const sourceX = sourceNode ? sourceNode.x + sourceNode.width : 0;
    const sourceY = sourceNode ? sourceNode.y + sourceNode.height / 2 : 0;
    const targetX = targetNode ? targetNode.x : 0;
    const targetY = targetNode ? targetNode.y + targetNode.height / 2 : 0;

    return {
      sourceContext: rel.sourceContextId,
      targetContext: rel.targetContextId,
      relationshipType: rel.relationshipType,
      label: rel.relationshipType,
      points: [
        { x: sourceX, y: sourceY },
        { x: targetX, y: targetY },
      ],
    };
  });
}

function findContextName(ir: IntermediateRepresentation, contextId: string): string {
  const ctx = ir.contexts.find((c) => c.id === contextId);
  return ctx?.name ?? contextId;
}

function computeDimensions(nodes: readonly ContextMapNode[]): { width: number; height: number } {
  if (nodes.length === 0) {
    return { width: 0, height: 0 };
  }
  const maxX = Math.max(...nodes.map((n) => n.x + n.width)) + NODE_SPACING;
  const maxY = Math.max(...nodes.map((n) => n.y + n.height)) + NODE_SPACING;
  return { width: maxX, height: maxY };
}
