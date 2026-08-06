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
import { orderedMomentChildren } from './moment-children.js';

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
  /** Raw event/node name carried by this connection (e.g. 'RecordInboundMessage'). */
  readonly eventType: string;
  /** Name of the node that declares this connection, when known. */
  readonly sourceNodeName?: string;
  /** For triggers/triggered-by: the node on the other end of the edge. */
  readonly targetNodeName?: string;
  /** For returns-to: the human label of the loop-target moment. */
  readonly targetMomentLabel?: string;
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
      eventRouting: buildEventRouting(flow, ctxMap, laneIndex),
      branchPredicates: buildBranchPredicates(flow),
      contextMap: buildContextMap(flow, ctxMap),
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

  // Sequence-aware (M-S12): node order follows the moment's textual child
  // order when the IR carries it; the branch scope index is the branch's
  // declaration index, not its iteration position.
  for (const child of orderedMomentChildren(moment, 'entries-first')) {
    if (child.kind === 'entry') {
      nodes.push(entryToNode(child.entry, moment, ctxMap, laneIndex, 'main'));
    } else {
      for (const entry of child.branch.entries) {
        nodes.push(entryToNode(entry, moment, ctxMap, laneIndex, `br${child.branchIndex}`));
      }
    }
  }

  return nodes;
}

// Review fix #1: Include lane + branch scope in node ID to prevent collisions
// when the same event appears in both main entries and branch entries.
function entryToNode(
  entry: MomentEntry,
  moment: MomentDefinition,
  ctxMap: Map<string, ContextDefinition>,
  laneIndex: Map<string, LaneDefinition>,
  scope: string,
): TopologyNode {
  const ctx = ctxMap.get(entry.contextId);
  const lane = laneIndex.get(entry.contextId);
  const laneId = lane?.id ?? entry.contextId;
  const nodeKind = resolveNodeKind(entry, ctx);
  const aggregate = findAggregate(entry.nodeName, ctx);

  return {
    id: `${moment.id}::${laneId}::${entry.nodeName}::${scope}`,
    lane: laneId,
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
    const eventType = conn.eventId.replace(/^evt-/, '');
    const endpoints = {
      eventType,
      sourceNodeName: conn.sourceNodeName,
      targetNodeName: conn.targetNodeName,
    };

    // Audit fix #1: returns-to edges are frame→frame loops. The IR now carries
    // the resolved targetMomentId; use it so the edge lands on a real frame.
    if (conn.connectionType === 'returns-to') {
      if (conn.targetMomentId) {
        return {
          from: conn.sourceMomentId,
          to: conn.targetMomentId,
          style: 'return',
          targetMomentLabel: conn.targetMomentLabel,
          ...endpoints,
        };
      }
      // Unresolvable label: keep the old (context-target) shape but warn
      // rather than fabricating a frame id.
      return {
        from: conn.sourceMomentId,
        to: conn.targetContextId,
        label: `unresolved returns-to target: ${conn.targetMomentLabel ?? '(unknown)'}`,
        style: 'return',
        targetMomentLabel: conn.targetMomentLabel,
        ...endpoints,
      };
    }

    const isCrossing = conn.connectionType === 'crosses-to';
    return {
      from: conn.sourceMomentId,
      // For 'triggers' the core now resolves targetContextId to the context
      // where the TARGET node is placed (not the source's own lane).
      to: conn.targetContextId,
      label: isCrossing ? eventType : undefined,
      style: mapConnectionStyle(conn),
      crossBoundary: isCrossing || undefined,
      relationship: isCrossing ? conn.schemaContract.relationshipType : undefined,
      schemaContract: isCrossing ? mapSchemaContract(conn) : undefined,
      ...endpoints,
    };
  });
}

// Review fix #4: Explicit branch for 'triggers' connection type.
function mapConnectionStyle(conn: ConnectionDefinition): string {
  if (conn.connectionType === 'crosses-to') return 'cross';
  if (conn.connectionType === 'triggered-by') return 'happy';
  if (conn.connectionType === 'triggers') return 'happy';
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

// Route both events and commands so Facet's walker can resolve all path nodes.
// Commands are routed under their SimProcess. prefixed event type.
function buildEventRouting(
  flow: FlowDefinition,
  ctxMap: Map<string, ContextDefinition>,
  laneIndex: Map<string, LaneDefinition>,
): Record<string, string[]> {
  const routing: Record<string, Set<string>> = {};

  for (const moment of flow.moments) {
    const addEntry = (entry: MomentEntry, scope: string): void => {
      const ctx = ctxMap.get(entry.contextId);
      const kind = resolveNodeKind(entry, ctx);
      const lane = laneIndex.get(entry.contextId);
      const laneId = lane?.id ?? entry.contextId;
      const nodeId = `${moment.id}::${laneId}::${entry.nodeName}::${scope}`;

      // Events are routed by their plain name
      if (kind === 'event') {
        const existing = routing[entry.nodeName] ?? new Set<string>();
        existing.add(nodeId);
        routing[entry.nodeName] = existing;
      }

      // Commands are routed by their SimProcess. prefixed event type
      if (kind === 'command') {
        const key = `SimProcess.${entry.nodeName}`;
        const existing = routing[key] ?? new Set<string>();
        existing.add(nodeId);
        routing[key] = existing;
      }
    };

    // Sequence-aware (M-S12): mirror buildFrameNodes' child order.
    for (const child of orderedMomentChildren(moment, 'entries-first')) {
      if (child.kind === 'entry') {
        addEntry(child.entry, 'main');
      } else {
        for (const entry of child.branch.entries) {
          addEntry(entry, `br${child.branchIndex}`);
        }
      }
    }
  }

  const result: Record<string, string[]> = {};
  for (const [key, set] of Object.entries(routing)) {
    result[key] = [...set];
  }
  return result;
}

// ---------------------------------------------------------------------------
// Branch Predicates
// ---------------------------------------------------------------------------

function buildBranchPredicates(flow: FlowDefinition): Record<string, TopologyBranchPredicate> {
  const predicates: Record<string, TopologyBranchPredicate> = {};

  for (const moment of flow.moments) {
    if (!moment.branches || moment.branches.length === 0) continue;

    // Audit fix #5: each branch condition maps to a route label that IS the
    // condition itself, so route labels are distinct per branch point and
    // coverage denominators make sense. The scenario generator emits
    // payload.outcome with the selected condition (agreed contract).
    const routes: Record<string, string> = {};
    for (const branch of moment.branches) {
      routes[branch.condition] = branch.condition;
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

// Review fix #5: Removed unused `ir` parameter.
function buildContextMap(
  flow: FlowDefinition,
  ctxMap: Map<string, ContextDefinition>,
): TopologyContextMap {
  const contexts = buildBoundedContexts(flow, ctxMap);
  // Audit fix #7: never emit relationships that reference contexts absent
  // from boundedContexts — consumers resolve relationship endpoints against
  // that list.
  const known = new Set(contexts.map((c) => c.contextId));
  const relationships = buildContextRelationships(flow).filter(
    (r) => known.has(r.sourceContextId) && known.has(r.targetContextId),
  );
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

// Review fix #3: Resolve source context by matching the crossing event name
// against moment entries, instead of blindly taking contextEntries[0].
function buildRelationship(
  conn: ConnectionDefinition & { connectionType: 'crosses-to' },
  flow: FlowDefinition,
): TopologyContextRelationship | null {
  const sourceMoment = flow.moments.find((m) => m.id === conn.sourceMomentId);
  if (!sourceMoment) return null;

  const eventName = conn.eventId.replace(/^evt-/, '');
  const allEntries = [
    ...sourceMoment.contextEntries,
    ...(sourceMoment.branches ?? []).flatMap((b) => b.entries),
  ];
  const producingEntry = allEntries.find((e) => e.nodeName === eventName);
  const sourceCtxId = producingEntry?.contextId ?? sourceMoment.contextEntries[0]?.contextId;
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
    // Audit fix #7: include contexts reachable only via branch entries —
    // terminal entries still occur in their context.
    for (const branch of moment.branches ?? []) {
      for (const entry of branch.entries) {
        ids.add(entry.contextId);
      }
    }
  }
  return [...ids];
}
