import type { IntermediateRepresentation, ConnectionDefinition } from '@mmmnt/core';
import type {
  TimelineLayout,
  TimelineLane,
  TimelineEntry,
  TimelineConnection,
} from '../types/index.js';

const LANE_HEIGHT = 80;
const LANE_PADDING = 20;
const ENTRY_WIDTH = 120;
const ENTRY_HEIGHT = 40;
const ENTRY_SPACING = 140;

/**
 * Pure function: IR → TimelineLayout.
 * VZ-01: derived from IR only, no visual-only data.
 * VZ-02: deterministic — same IR → identical output.
 */
export function renderTimeline(ir: IntermediateRepresentation): TimelineLayout {
  const lanes = buildLanes(ir);
  const laneIndex = new Map(lanes.map((l) => [l.contextId, l]));

  const entries: TimelineEntry[] = [];
  const connections: TimelineConnection[] = [];
  let globalXOffset = LANE_PADDING;

  for (const flow of ir.flows) {
    globalXOffset = processFlow(flow, ir, laneIndex, entries, connections, globalXOffset);
  }

  return {
    lanes,
    entries,
    connections,
    dimensions: computeDimensions(entries, lanes),
  };
}

function processFlow(
  flow: {
    moments: readonly {
      id: string;
      name: string;
      contextEntries: readonly { contextId: string; nodeName: string }[];
    }[];
    connections: readonly ConnectionDefinition[];
  },
  ir: IntermediateRepresentation,
  laneIndex: ReadonlyMap<string, TimelineLane>,
  entries: TimelineEntry[],
  connections: TimelineConnection[],
  xOffset: number,
): number {
  for (const moment of flow.moments) {
    for (const entry of moment.contextEntries) {
      const lane = laneIndex.get(entry.contextId);
      if (!lane) continue;

      entries.push({
        momentId: moment.id,
        momentName: moment.name,
        contextId: entry.contextId,
        x: xOffset,
        y: lane.y + LANE_PADDING,
        width: ENTRY_WIDTH,
        height: ENTRY_HEIGHT,
      });
    }
    xOffset += ENTRY_SPACING;
  }

  for (const conn of flow.connections) {
    if (!isCrossing(conn)) continue;
    const sourceLane = laneIndex.get(findSourceContext(conn, flow, ir));
    const targetLane = laneIndex.get(conn.targetContextId);
    if (!sourceLane || !targetLane) continue;

    const sourceEntry = entries.find((e) => e.momentId === conn.sourceMomentId);
    const connectionX = sourceEntry != null ? sourceEntry.x + sourceEntry.width / 2 : LANE_PADDING;

    connections.push({
      connectionId: conn.id,
      sourceMomentId: conn.sourceMomentId,
      targetContextId: conn.targetContextId,
      sourceLaneY: sourceLane.y + LANE_HEIGHT / 2,
      targetLaneY: targetLane.y + LANE_HEIGHT / 2,
      x: connectionX,
    });
  }

  return xOffset;
}

function computeDimensions(
  entries: readonly TimelineEntry[],
  lanes: readonly TimelineLane[],
): { width: number; height: number } {
  const maxX =
    entries.length > 0
      ? Math.max(...entries.map((e) => e.x + e.width)) + LANE_PADDING
      : LANE_PADDING * 2;
  const maxY = lanes.length > 0 ? lanes[lanes.length - 1].y + LANE_HEIGHT : 0;
  return { width: maxX, height: maxY };
}

function buildLanes(ir: IntermediateRepresentation): TimelineLane[] {
  return ir.contexts.map((ctx, index) => ({
    contextId: ctx.id,
    contextName: ctx.name,
    y: index * (LANE_HEIGHT + LANE_PADDING),
    height: LANE_HEIGHT,
  }));
}

function isCrossing(conn: ConnectionDefinition): boolean {
  return conn.connectionType === 'crosses-to';
}

function findSourceContext(
  conn: ConnectionDefinition,
  flow: { moments: readonly { id: string; contextEntries: readonly { contextId: string }[] }[] },
  ir: IntermediateRepresentation,
): string {
  // Resolve source context from eventId by searching IR contexts/aggregates
  for (const ctx of ir.contexts) {
    if (ctx.events.some((e) => e.id === conn.eventId)) {
      return ctx.id;
    }
    for (const agg of ctx.aggregates) {
      if (agg.events.some((e) => e.id === conn.eventId)) {
        return ctx.id;
      }
    }
  }

  // Fallback: infer from source moment's first context entry
  const sourceMoment = flow.moments.find((f) => f.id === conn.sourceMomentId);
  if (sourceMoment && sourceMoment.contextEntries.length > 0) {
    return sourceMoment.contextEntries[0].contextId;
  }

  return conn.targetContextId;
}
