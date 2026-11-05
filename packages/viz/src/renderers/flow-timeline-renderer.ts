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

interface TimelineMoment {
  readonly id: string;
  readonly name: string;
  readonly contextEntries: readonly { contextId: string; nodeName: string; cause?: string }[];
  readonly branches?: readonly { entries: readonly { nodeName: string; cause?: string }[] }[];
  readonly notes?: readonly { text: string; laneId?: string }[];
}

interface TimelineFlow {
  readonly lanes: readonly { id: string; contextId: string }[];
  readonly moments: readonly TimelineMoment[];
  readonly connections: readonly ConnectionDefinition[];
}

/**
 * The lane a moment's column sits in: its first node's, else the lane its first note speaks for (ADR-040
 * D3), else the lane of the moment before it, so a note-only moment keeps its place in the story.
 */
function laneOfMoment(
  moment: TimelineMoment,
  flow: TimelineFlow,
  laneIndex: ReadonlyMap<string, TimelineLane>,
  previous: TimelineLane | undefined,
): TimelineLane | undefined {
  const first = moment.contextEntries[0];
  if (first) return laneIndex.get(first.contextId);
  const noteLaneId = (moment.notes ?? []).find((n) => n.laneId !== undefined)?.laneId;
  const noteLane = flow.lanes.find((l) => l.id === noteLaneId);
  return (noteLane ? laneIndex.get(noteLane.contextId) : undefined) ?? previous;
}

/** The node names a moment places, main nodes and `when` arms alike. */
function namesOfMoment(moment: TimelineMoment): string[] {
  return [
    ...moment.contextEntries.map((e) => e.nodeName),
    ...(moment.branches ?? []).flatMap((b) => b.entries.map((e) => e.nodeName)),
  ];
}

/** The ADR-040 parts of a column: notes, same-moment hops and causes. Absent parts are left out. */
function momentDetails(
  moment: TimelineMoment,
  flow: TimelineFlow,
  earlier: ReadonlySet<string>,
): Pick<TimelineEntry, 'notes' | 'hops' | 'causes'> {
  const here = new Set(namesOfMoment(moment).filter((n) => !earlier.has(n)));
  const hops = flow.connections
    .filter(
      (c) =>
        c.connectionType === 'triggered-by' &&
        c.sourceMomentId === moment.id &&
        c.sourceNodeName !== undefined &&
        c.targetNodeName !== undefined &&
        here.has(c.sourceNodeName),
    )
    .map((c) => ({ from: c.sourceNodeName ?? '', to: c.targetNodeName ?? '' }));
  const causes = [
    ...moment.contextEntries,
    ...(moment.branches ?? []).flatMap((b) => b.entries),
  ].flatMap((e) => (e.cause !== undefined ? [{ nodeName: e.nodeName, cause: e.cause }] : []));
  const notes = (moment.notes ?? []).map((n) => ({
    text: n.text,
    ...(n.laneId !== undefined ? { laneId: n.laneId } : {}),
  }));
  return {
    ...(notes.length > 0 ? { notes } : {}),
    ...(hops.length > 0 ? { hops } : {}),
    ...(causes.length > 0 ? { causes } : {}),
  };
}

function processFlow(
  flow: TimelineFlow,
  ir: IntermediateRepresentation,
  laneIndex: ReadonlyMap<string, TimelineLane>,
  entries: TimelineEntry[],
  connections: TimelineConnection[],
  xOffset: number,
): number {
  const earlier = new Set<string>();
  let previous: TimelineLane | undefined;
  for (const moment of flow.moments) {
    // Deduplicate: one timeline entry per moment (pick first context entry for placement)
    const lane = laneOfMoment(moment, flow, laneIndex, previous);
    if (lane) {
      previous = lane;
      entries.push({
        momentId: moment.id,
        momentName: moment.name,
        contextId: lane.contextId,
        x: xOffset,
        y: lane.y + LANE_PADDING,
        width: ENTRY_WIDTH,
        height: ENTRY_HEIGHT,
        ...momentDetails(moment, flow, earlier),
      });
    }
    namesOfMoment(moment).forEach((n) => earlier.add(n));
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
