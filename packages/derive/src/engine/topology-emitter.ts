/**
 * TopologyEmitter — Produces SimulationTopology per flow from IR
 *
 * ADR-023 §2: The topology is the "what to draw" contract — lanes, frames,
 * connections, eventRouting, branchPredicates, and contextMap.
 *
 * Moment emits structure. Facet applies style. No nodeTypeStyles or
 * connectionStyles in this output.
 */

import type {
  IntermediateRepresentation,
  FlowDefinition,
  LaneDefinition,
  MomentDefinition,
  MomentEntry,
  ConnectionDefinition,
  ContextDefinition,
} from '@mmmnt/core';

// ---------------------------------------------------------------------------
// Output types (ADR-023 §2)
// ---------------------------------------------------------------------------

export interface SimulationTopology {
  readonly name: string;
  readonly flowId: string;
  readonly version: number;
  readonly lanes: TopologyLane[];
  readonly frames: TopologyFrame[];
  readonly connections: TopologyConnection[];
  readonly eventRouting: Record<string, string[]>;
  readonly branchPredicates: Record<string, TopologyBranchPredicate>;
  readonly contextMap: TopologyContextMap;
}

export interface TopologyLane {
  readonly id: string;
  readonly label: string;
  readonly contextId: string;
  readonly classification: string;
  readonly isBranch: boolean;
}

export interface TopologyFrame {
  readonly id: string;
  readonly moment: string;
  readonly isBranch: boolean;
  readonly nodes: TopologyNode[];
}

export interface TopologyNode {
  readonly id: string;
  readonly lane: string;
  readonly label: string;
  readonly type: string;
  readonly aggregate?: string;
  readonly optional?: boolean;
  readonly terminal?: boolean;
  readonly multiplicity?: string;
  readonly eventTypes?: string[];
}

export interface TopologyConnection {
  readonly from: string;
  readonly to: string;
  readonly label?: string;
  readonly style: string;
  readonly crossBoundary?: boolean;
  readonly relationship?: string;
  readonly schemaContract?: TopologySchemaContract;
}

export interface TopologySchemaContract {
  readonly contractId: string;
  readonly requiredFields: string[];
  readonly fieldTypes: Record<string, string>;
}

export interface TopologyBranchPredicate {
  readonly field: string;
  readonly defaultRoute: string;
  readonly routes: Record<string, string>;
}

export interface TopologyContextMap {
  readonly contexts: TopologyBoundedContext[];
  readonly relationships: TopologyContextRelationship[];
}

export interface TopologyBoundedContext {
  readonly contextId: string;
  readonly name: string;
  readonly classification: string;
  readonly laneId: string;
  readonly aggregates: string[];
}

export interface TopologyContextRelationship {
  readonly sourceContextId: string;
  readonly targetContextId: string;
  readonly relationshipType: string;
  readonly contractIds: string[];
}

// ---------------------------------------------------------------------------
// Emitter
// ---------------------------------------------------------------------------

export class TopologyEmitter {
  emit(ir: IntermediateRepresentation, flow: FlowDefinition): SimulationTopology {
    const ctxMap = new Map(ir.contexts.map((c) => [c.id, c]));
    const laneIndex = new Map(flow.lanes.map((l) => [l.contextId, l]));

    return {
      name: flow.name,
      flowId: flow.id,
      version: 1,
      lanes: buildLanes(flow),
      frames: buildFrames(flow, ctxMap, laneIndex),
      connections: buildConnections(flow),
      eventRouting: buildEventRouting(flow, ctxMap),
      branchPredicates: buildBranchPredicates(flow),
      contextMap: buildContextMap(flow, ir, ctxMap),
    };
  }
}

// ---------------------------------------------------------------------------
// Lanes
// ---------------------------------------------------------------------------

function buildLanes(flow: FlowDefinition): TopologyLane[] {
  return flow.lanes.map((lane) => ({
    id: lane.id,
    label: lane.label,
    contextId: lane.contextId,
    classification: lane.classification ?? 'Core',
    isBranch: lane.isBranch,
  }));
}

// ---------------------------------------------------------------------------
// Frames (moments → frames with nodes)
// ---------------------------------------------------------------------------

function buildFrames(
  flow: FlowDefinition,
  ctxMap: Map<string, ContextDefinition>,
  laneIndex: Map<string, LaneDefinition>,
): TopologyFrame[] {
  return flow.moments.map((moment) => ({
    id: moment.id,
    moment: moment.name,
    isBranch: (moment.branches ?? []).length > 0,
    nodes: buildFrameNodes(moment, ctxMap, laneIndex),
  }));
}

function buildFrameNodes(
  moment: MomentDefinition,
  ctxMap: Map<string, ContextDefinition>,
  laneIndex: Map<string, LaneDefinition>,
): TopologyNode[] {
  const nodes: TopologyNode[] = [];

  for (const entry of moment.contextEntries) {
    nodes.push(entryToNode(entry, moment, ctxMap, laneIndex));
  }

  for (const branch of moment.branches ?? []) {
    for (const entry of branch.entries) {
      nodes.push(entryToNode(entry, moment, ctxMap, laneIndex));
    }
  }

  return nodes;
}

function entryToNode(
  entry: MomentEntry,
  moment: MomentDefinition,
  ctxMap: Map<string, ContextDefinition>,
  laneIndex: Map<string, LaneDefinition>,
): TopologyNode {
  const ctx = ctxMap.get(entry.contextId);
  const lane = laneIndex.get(entry.contextId);
  const nodeKind = resolveNodeKind(entry, ctx);
  const aggregate = findAggregate(entry.nodeName, ctx);

  return {
    id: `${moment.id}::${entry.nodeName}`,
    lane: lane?.id ?? entry.contextId,
    label: entry.nodeName,
    type: nodeKind,
    aggregate: aggregate ?? undefined,
    optional: entry.optional ?? undefined,
    terminal: entry.terminal ?? undefined,
    multiplicity: entry.multiplicity != null ? String(entry.multiplicity) : undefined,
    eventTypes: nodeKind === 'event' ? [entry.nodeName] : undefined,
  };
}

function resolveNodeKind(entry: MomentEntry, ctx: ContextDefinition | undefined): string {
  if (!ctx) return entry.nodeKind;

  const isCmd =
    ctx.commands.some((c) => c.name === entry.nodeName) ||
    ctx.aggregates.some((a) => a.commands.some((c) => c.name === entry.nodeName));
  if (isCmd) return 'command';

  const isEvt =
    ctx.events.some((e) => e.name === entry.nodeName) ||
    ctx.aggregates.some((a) => a.events.some((e) => e.name === entry.nodeName));
  if (isEvt) return 'event';

  return entry.nodeKind;
}

function findAggregate(nodeName: string, ctx: ContextDefinition | undefined): string | null {
  if (!ctx) return null;
  for (const agg of ctx.aggregates) {
    if (agg.commands.some((c) => c.name === nodeName)) return agg.name;
    if (agg.events.some((e) => e.name === nodeName)) return agg.name;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Connections
// ---------------------------------------------------------------------------

function buildConnections(flow: FlowDefinition): TopologyConnection[] {
  return flow.connections.map((conn) => {
    const isCrossing = conn.connectionType === 'crosses-to';
    const base: TopologyConnection = {
      from: conn.sourceMomentId,
      to: conn.targetContextId,
      label: isCrossing ? conn.eventId.replace(/^evt-/, '') : undefined,
      style: mapConnectionStyle(conn),
      crossBoundary: isCrossing || undefined,
      relationship: isCrossing ? conn.schemaContract.relationshipType : undefined,
      schemaContract: isCrossing ? mapSchemaContract(conn) : undefined,
    };
    return base;
  });
}

function mapConnectionStyle(conn: ConnectionDefinition): string {
  if (conn.connectionType === 'crosses-to') return 'cross';
  if (conn.connectionType === 'triggered-by') return 'happy';
  if (conn.connectionType === 'returns-to') return 'return';
  return 'happy';
}

function mapSchemaContract(
  conn: ConnectionDefinition & { connectionType: 'crosses-to' },
): TopologySchemaContract {
  const required = conn.schemaContract.fields.filter((f) => f.required);
  const fieldTypes: Record<string, string> = {};
  for (const f of conn.schemaContract.fields) {
    fieldTypes[f.name] = f.type;
  }
  return {
    contractId: conn.id,
    requiredFields: required.map((f) => f.name),
    fieldTypes,
  };
}

// ---------------------------------------------------------------------------
// Event Routing
// ---------------------------------------------------------------------------

function buildEventRouting(
  flow: FlowDefinition,
  ctxMap: Map<string, ContextDefinition>,
): Record<string, string[]> {
  const routing: Record<string, string[]> = {};

  for (const moment of flow.moments) {
    const allEntries = [
      ...moment.contextEntries,
      ...(moment.branches ?? []).flatMap((b) => b.entries),
    ];

    for (const entry of allEntries) {
      const ctx = ctxMap.get(entry.contextId);
      const kind = resolveNodeKind(entry, ctx);
      if (kind === 'event') {
        const nodeId = `${moment.id}::${entry.nodeName}`;
        const existing = routing[entry.nodeName] ?? [];
        existing.push(nodeId);
        routing[entry.nodeName] = existing;
      }
    }
  }

  return routing;
}

// ---------------------------------------------------------------------------
// Branch Predicates
// ---------------------------------------------------------------------------

function buildBranchPredicates(flow: FlowDefinition): Record<string, TopologyBranchPredicate> {
  const predicates: Record<string, TopologyBranchPredicate> = {};

  for (const moment of flow.moments) {
    if (!moment.branches || moment.branches.length === 0) continue;

    const routes: Record<string, string> = {};
    for (const branch of moment.branches) {
      const hasTerminal = branch.entries.some((e) => e.terminal);
      routes[branch.condition] = hasTerminal ? 'terminal' : 'happy';
    }

    predicates[moment.id] = {
      field: 'outcome',
      defaultRoute: moment.branches[0].condition,
      routes,
    };
  }

  return predicates;
}

// ---------------------------------------------------------------------------
// Context Map
// ---------------------------------------------------------------------------

function buildContextMap(
  flow: FlowDefinition,
  ir: IntermediateRepresentation,
  ctxMap: Map<string, ContextDefinition>,
): TopologyContextMap {
  const contexts = buildBoundedContexts(flow, ctxMap);
  const relationships = buildContextRelationships(flow);
  return { contexts, relationships };
}

function buildBoundedContexts(
  flow: FlowDefinition,
  ctxMap: Map<string, ContextDefinition>,
): TopologyBoundedContext[] {
  const contextIds = collectContextIds(flow);
  const contexts: TopologyBoundedContext[] = [];

  for (const ctxId of contextIds) {
    const ctx = ctxMap.get(ctxId);
    if (!ctx) continue;

    const lane = flow.lanes.find((l) => l.contextId === ctxId);
    contexts.push({
      contextId: ctx.id,
      name: ctx.name,
      classification: ctx.classification ?? 'Core',
      laneId: lane?.id ?? ctx.id,
      aggregates: ctx.aggregates.map((a) => a.name),
    });
  }

  return contexts;
}

function buildContextRelationships(flow: FlowDefinition): TopologyContextRelationship[] {
  const crossings = flow.connections.filter(
    (c): c is typeof c & { connectionType: 'crosses-to' } => c.connectionType === 'crosses-to',
  );

  return crossings
    .map((conn) => buildRelationship(conn, flow))
    .filter((r): r is TopologyContextRelationship => r !== null);
}

function buildRelationship(
  conn: ConnectionDefinition & { connectionType: 'crosses-to' },
  flow: FlowDefinition,
): TopologyContextRelationship | null {
  const sourceMoment = flow.moments.find((m) => m.id === conn.sourceMomentId);
  if (!sourceMoment) return null;

  const sourceCtxId =
    sourceMoment.contextEntries[0]?.contextId ??
    sourceMoment.branches?.[0]?.entries?.[0]?.contextId;
  if (!sourceCtxId) return null;

  return {
    sourceContextId: sourceCtxId,
    targetContextId: conn.targetContextId,
    relationshipType: conn.schemaContract.relationshipType,
    contractIds: [conn.id],
  };
}

function collectContextIds(flow: FlowDefinition): string[] {
  const ids = new Set<string>();
  for (const moment of flow.moments) {
    for (const entry of moment.contextEntries) ids.add(entry.contextId);
    for (const branch of moment.branches ?? []) {
      for (const entry of branch.entries) {
        if (!entry.terminal) ids.add(entry.contextId);
      }
    }
  }
  return [...ids];
}
