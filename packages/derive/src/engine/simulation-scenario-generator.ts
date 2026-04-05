/**
 * SimulationScenarioGenerator — Produces Facet-compatible scenario JSON from IR
 *
 * Walks a flow's temporal sequence and generates:
 * - Scenario metadata (given/when/then)
 * - Expected path (ordered node IDs)
 * - Synthetic events with causation chains, payloads, and timestamps
 *
 * This is the bridge between Moment's specification and Facet's simulation engine.
 */

import type {
  IntermediateRepresentation,
  FlowDefinition,
  MomentDefinition,
  MomentEntry,
  ConnectionDefinition,
  ContextDefinition,
  EventDefinition,
  CommandDefinition,
  BranchDefinition,
  SagaDefinition,
  PreconditionDefinition,
} from '@mmmnt/core';

export interface SimulationScenario {
  readonly scenarioId: string;
  readonly flowId: string;
  readonly flowName: string;
  readonly scenarioLabel: string;
  readonly description: string;
  readonly given: string;
  readonly when: string;
  readonly then: string;
  readonly expectedPath: readonly string[];
  readonly activeBranches: readonly ActiveBranch[];
  readonly events: readonly SimulationEvent[];
}

export interface ActiveBranch {
  readonly momentName: string;
  readonly condition: string;
  readonly routeChosen: string;
}

export interface SimulationEvent {
  readonly eventId: string;
  readonly eventType: string;
  readonly productSource: string;
  readonly sessionId: string;
  readonly causationEventIds: readonly string[];
  readonly correlationId: string;
  readonly timestamp: string;
  readonly version: number;
  readonly payload: Record<string, unknown>;
}

interface NodeInfo {
  nodeId: string;
  nodeName: string;
  contextId: string;
  contextName: string;
  nodeKind: string;
  momentName: string;
  momentIndex: number;
}

// Lane ID lookup: contextId → lane.id from the flow's lane declarations
type LaneIndex = Map<string, string>;

export interface SimulationOptions {
  readonly scenarioId?: string;
  readonly branchSelections?: Record<string, string>;
  readonly sessionId?: string;
  readonly baseTimestamp?: string;
}

// ---------------------------------------------------------------------------
// 2a. Resolve actual node kind from context map
// ---------------------------------------------------------------------------

function resolveNodeKind(
  nodeName: string,
  contextId: string,
  contextMap: Map<string, ContextDefinition>,
): string {
  const ctx = contextMap.get(contextId);
  if (!ctx) return 'event';

  const isCommand = findCommand(ctx, nodeName) !== undefined;
  if (isCommand) return 'command';

  const isEvent = findEvent(ctx, nodeName) !== undefined;
  if (isEvent) return 'event';

  return 'event';
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

function resolveOptions(flow: FlowDefinition, options?: SimulationOptions) {
  const scenarioId = options?.scenarioId ?? `scenario-${flow.id}`;
  return {
    scenarioId,
    sessionId: options?.sessionId ?? `sess-${scenarioId}`,
    correlationId: `corr-${scenarioId}`,
    branchSelections: options?.branchSelections ?? {},
    baseTime: new Date(options?.baseTimestamp ?? '2026-01-01T10:00:00.000Z'),
  };
}

// ---------------------------------------------------------------------------
// Main entry — single scenario (backward compatible)
// ---------------------------------------------------------------------------

export function generateSimulationScenario(
  ir: IntermediateRepresentation,
  flow: FlowDefinition,
  options?: SimulationOptions,
): SimulationScenario {
  const opts = resolveOptions(flow, options);
  const contextMap = buildContextMap(ir);
  const nodes = collectOrderedNodes(flow, opts.branchSelections);
  const activeBranches = collectActiveBranches(flow, opts.branchSelections);

  const rawEvents = generateEvents(
    nodes,
    flow,
    contextMap,
    ir,
    opts.sessionId,
    opts.correlationId,
    opts.baseTime,
  );

  const events = injectSagaTransitions(rawEvents, ir, opts.sessionId, opts.correlationId);
  const contextNames = [...new Set(nodes.map((n) => n.contextName))];
  const label = resolveScenarioLabel(flow, opts.branchSelections);

  return {
    scenarioId: opts.scenarioId,
    flowId: flow.id,
    flowName: flow.name,
    scenarioLabel: label,
    description: flow.description ?? `Full lifecycle flow: ${flow.name}`,
    given: `A ${(flow.moments[0]?.name ?? '').toLowerCase()} scenario is initiated`,
    when: buildWhenClause(flow, nodes),
    then: buildThenClause(flow, nodes, contextNames),
    expectedPath: nodes.map((n) => n.nodeId),
    activeBranches,
    events,
  };
}

// ---------------------------------------------------------------------------
// 2b. Multi-scenario generation
// ---------------------------------------------------------------------------

export function generateAllScenarios(
  ir: IntermediateRepresentation,
  flow: FlowDefinition,
  options?: SimulationOptions,
): SimulationScenario[] {
  const combinations = enumerateBranchCombinations(flow);
  if (combinations.length === 0) {
    return [generateSimulationScenario(ir, flow, options)];
  }

  return combinations.map((selections, idx) =>
    generateSimulationScenario(ir, flow, {
      ...options,
      scenarioId: options?.scenarioId
        ? `${options.scenarioId}-${idx}`
        : `scenario-${flow.id}-${idx}`,
      branchSelections: selections,
    }),
  );
}

function enumerateBranchCombinations(flow: FlowDefinition): Record<string, string>[] {
  const branchPoints = flow.moments.filter((m) => m.branches && m.branches.length > 0);
  if (branchPoints.length === 0) return [];

  let combos: Record<string, string>[] = [{}];

  for (const moment of branchPoints) {
    const nextCombos: Record<string, string>[] = [];
    for (const existing of combos) {
      for (const branch of moment.branches!) {
        nextCombos.push({ ...existing, [moment.name]: branch.condition });
      }
    }
    combos = nextCombos;
  }

  return combos;
}

// ---------------------------------------------------------------------------
// Label resolution
// ---------------------------------------------------------------------------

function resolveScenarioLabel(
  flow: FlowDefinition,
  branchSelections: Record<string, string>,
): string {
  const branchMoments = flow.moments.filter((m) => m.branches && m.branches.length > 0);
  if (branchMoments.length === 0) return `Happy Path: ${flow.name}`;

  const terminalConditions = collectTerminalConditions(branchMoments, branchSelections);
  const isAllFirstBranch = checkAllFirstBranch(branchMoments, branchSelections);

  if (isAllFirstBranch) return `Happy Path: ${flow.name}`;
  if (terminalConditions.length > 0) {
    return `Failure Path: ${flow.name} [${terminalConditions.join(', ')}]`;
  }

  const selectedConditions = branchMoments.map((m) => branchSelections[m.name]).filter(Boolean);
  return `Variant: ${flow.name} [${selectedConditions.join(', ')}]`;
}

function collectTerminalConditions(
  branchMoments: MomentDefinition[],
  branchSelections: Record<string, string>,
): string[] {
  const conditions: string[] = [];
  for (const moment of branchMoments) {
    const selected = branchSelections[moment.name];
    if (!selected) continue;
    const branch = moment.branches!.find((b) => b.condition === selected);
    if (branch && branch.entries.some((e) => e.terminal)) {
      conditions.push(selected);
    }
  }
  return conditions;
}

function checkAllFirstBranch(
  branchMoments: MomentDefinition[],
  branchSelections: Record<string, string>,
): boolean {
  for (const moment of branchMoments) {
    const selected = branchSelections[moment.name];
    const firstCondition = moment.branches![0]?.condition;
    if (selected && selected !== firstCondition) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Context map
// ---------------------------------------------------------------------------

function buildContextMap(ir: IntermediateRepresentation): Map<string, ContextDefinition> {
  return new Map(ir.contexts.map((c) => [c.id, c]));
}

// ---------------------------------------------------------------------------
// Node collection (with terminal branch stopping)
// ---------------------------------------------------------------------------

function collectOrderedNodes(
  flow: FlowDefinition,
  branchSelections: Record<string, string>,
): NodeInfo[] {
  const laneIndex: LaneIndex = new Map(flow.lanes.map((l) => [l.contextId, l.id]));
  const nodes: NodeInfo[] = [];

  for (let i = 0; i < flow.moments.length; i++) {
    const moment = flow.moments[i];
    const stopped = collectMomentNodes(nodes, moment, i, branchSelections, laneIndex);
    if (stopped) break;
  }

  return nodes;
}

function collectMomentNodes(
  nodes: NodeInfo[],
  moment: MomentDefinition,
  momentIndex: number,
  branchSelections: Record<string, string>,
  laneIndex: LaneIndex,
): boolean {
  if (moment.branches && moment.branches.length > 0) {
    return collectBranchedMomentNodes(nodes, moment, momentIndex, branchSelections, laneIndex);
  }

  for (const entry of moment.contextEntries) {
    nodes.push(entryToNode(entry, moment, momentIndex, laneIndex, 'main'));
  }
  return false;
}

function collectBranchedMomentNodes(
  nodes: NodeInfo[],
  moment: MomentDefinition,
  momentIndex: number,
  branchSelections: Record<string, string>,
  laneIndex: LaneIndex,
): boolean {
  const selectedCondition = branchSelections[moment.name];
  const branch = selectedCondition
    ? moment.branches!.find((b) => b.condition === selectedCondition)
    : moment.branches![0];

  let hitTerminal = false;

  if (branch) {
    const branchIdx = moment.branches!.indexOf(branch);
    for (const entry of branch.entries) {
      nodes.push(entryToNode(entry, moment, momentIndex, laneIndex, `br${branchIdx}`));
      if (entry.terminal) hitTerminal = true;
    }
  }

  for (const entry of moment.contextEntries) {
    nodes.push(entryToNode(entry, moment, momentIndex, laneIndex, 'main'));
  }

  return hitTerminal;
}

function entryToNode(
  entry: MomentEntry,
  moment: MomentDefinition,
  momentIndex: number,
  laneIndex: LaneIndex,
  scope: string,
): NodeInfo {
  const contextName = entry.contextId.replace(/^ctx-/, '');
  const laneId = laneIndex.get(entry.contextId) ?? entry.contextId;
  return {
    nodeId: `${moment.id}::${laneId}::${entry.nodeName}::${scope}`,
    nodeName: entry.nodeName,
    contextId: entry.contextId,
    contextName,
    nodeKind: entry.nodeKind,
    momentName: moment.name,
    momentIndex,
  };
}

// ---------------------------------------------------------------------------
// Active branches
// ---------------------------------------------------------------------------

function collectActiveBranches(
  flow: FlowDefinition,
  branchSelections: Record<string, string>,
): ActiveBranch[] {
  const branches: ActiveBranch[] = [];

  for (const moment of flow.moments) {
    if (moment.branches && moment.branches.length > 0) {
      const selected = branchSelections[moment.name] ?? moment.branches[0]?.condition;
      if (selected) {
        branches.push({
          momentName: moment.name,
          condition: selected,
          routeChosen: selected,
        });
      }
    }
  }

  return branches;
}

// ---------------------------------------------------------------------------
// Event generation
// ---------------------------------------------------------------------------

function generateEvents(
  nodes: NodeInfo[],
  flow: FlowDefinition,
  contextMap: Map<string, ContextDefinition>,
  ir: IntermediateRepresentation,
  sessionId: string,
  correlationId: string,
  baseTime: Date,
): SimulationEvent[] {
  const events: SimulationEvent[] = [];
  const nodeToEventId = new Map<string, string>();
  let eventCounter = 0;

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    eventCounter++;
    const eventId = `evt-${String(eventCounter).padStart(3, '0')}`;
    nodeToEventId.set(node.nodeId, eventId);

    const timestamp = new Date(baseTime.getTime() + i * 1000).toISOString();
    const causationEventIds = findCausationEvents(node, nodes, flow, nodeToEventId, i);

    // 2a: resolve actual node kind from context map
    const effectiveKind = resolveNodeKind(node.nodeName, node.contextId, contextMap);
    const eventType = resolveEventType(node, effectiveKind);
    const productSource = resolveProductSource(node, effectiveKind, contextMap);
    const payload = buildPayload(node, effectiveKind, contextMap, ir);

    events.push({
      eventId,
      eventType,
      productSource,
      sessionId,
      causationEventIds,
      correlationId,
      timestamp,
      version: 1,
      payload,
    });
  }

  return events;
}

function findCausationEvents(
  node: NodeInfo,
  allNodes: NodeInfo[],
  flow: FlowDefinition,
  nodeToEventId: Map<string, string>,
  currentIndex: number,
): string[] {
  const causation: string[] = [];

  for (const conn of flow.connections) {
    if (conn.connectionType === 'triggered-by') {
      addTriggeredByCausation(conn, allNodes, nodeToEventId, currentIndex, causation);
    }
  }

  if (causation.length === 0 && currentIndex > 0) {
    const prevNode = allNodes[currentIndex - 1];
    const prevEvtId = nodeToEventId.get(prevNode.nodeId);
    if (prevEvtId) causation.push(prevEvtId);
  }

  return causation;
}

function addTriggeredByCausation(
  conn: ConnectionDefinition,
  allNodes: NodeInfo[],
  nodeToEventId: Map<string, string>,
  currentIndex: number,
  causation: string[],
): void {
  const triggerNodeName = conn.eventId.replace(/^evt-/, '');
  const currentNodeInMoment = allNodes.some(
    (n, idx) => idx === currentIndex && n.nodeName === triggerNodeName,
  );

  if (currentNodeInMoment) return;

  for (let j = currentIndex - 1; j >= 0; j--) {
    if (allNodes[j].nodeName === triggerNodeName) {
      const evtId = nodeToEventId.get(allNodes[j].nodeId);
      if (evtId) causation.push(evtId);
      break;
    }
  }
}

function resolveEventType(node: NodeInfo, effectiveKind: string): string {
  if (effectiveKind === 'command') {
    return `SimProcess.${node.nodeName}`;
  }
  return node.nodeName;
}

function resolveProductSource(
  node: NodeInfo,
  effectiveKind: string,
  contextMap: Map<string, ContextDefinition>,
): string {
  const ctx = contextMap.get(node.contextId);
  if (!ctx) return 'moment:simulation';

  if (effectiveKind === 'event') {
    const isDefinedEvent = ctx.events.some((e) => e.name === node.nodeName);
    if (isDefinedEvent) {
      return ctx.name.toLowerCase().replace(/\s+/g, '-');
    }
  }

  return 'moment:simulation';
}

// ---------------------------------------------------------------------------
// 2a. Payload building (uses resolved effective kind)
// ---------------------------------------------------------------------------

function buildPayload(
  node: NodeInfo,
  effectiveKind: string,
  contextMap: Map<string, ContextDefinition>,
  ir: IntermediateRepresentation,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    nodeId: node.nodeId,
  };

  const ctx = contextMap.get(node.contextId);
  if (!ctx) return payload;

  if (effectiveKind === 'command') {
    return buildCommandPayload(payload, ctx, node);
  }

  if (effectiveKind === 'event') {
    return buildEventPayload(payload, ctx, node);
  }

  return payload;
}

function buildCommandPayload(
  payload: Record<string, unknown>,
  ctx: ContextDefinition,
  node: NodeInfo,
): Record<string, unknown> {
  payload.processName = node.nodeName;
  const cmd = findCommand(ctx, node.nodeName);
  if (cmd) {
    for (const input of cmd.inputs) {
      payload[input.name] = generatePlaceholder(input.type, input.name);
    }
  }
  return payload;
}

function buildEventPayload(
  payload: Record<string, unknown>,
  ctx: ContextDefinition,
  node: NodeInfo,
): Record<string, unknown> {
  const evt = findEvent(ctx, node.nodeName);
  if (evt) {
    for (const field of evt.fields) {
      payload[field.name] = generatePlaceholder(field.type, field.name);
    }
  }
  return payload;
}

// ---------------------------------------------------------------------------
// 2c. Saga state transitions
// ---------------------------------------------------------------------------

function injectSagaTransitions(
  events: SimulationEvent[],
  ir: IntermediateRepresentation,
  sessionId: string,
  correlationId: string,
): SimulationEvent[] {
  const sagaIndex = buildSagaIndex(ir);
  if (sagaIndex.size === 0) return events;

  const result: SimulationEvent[] = [];
  const sagaProgress = new Map<string, number>();
  let eventCounter = events.length;

  for (const event of events) {
    result.push(event);
    const matchingSagas = sagaIndex.get(event.eventType);
    if (!matchingSagas) continue;

    for (const saga of matchingSagas) {
      eventCounter++;
      const sagaEvent = buildSagaEvent(
        saga,
        sagaProgress,
        event,
        eventCounter,
        sessionId,
        correlationId,
      );
      if (sagaEvent) result.push(sagaEvent);
    }
  }

  return result;
}

function buildSagaIndex(ir: IntermediateRepresentation): Map<string, SagaDefinition[]> {
  const index = new Map<string, SagaDefinition[]>();
  for (const ctx of ir.contexts) {
    for (const saga of ctx.sagas) {
      const existing = index.get(saga.trigger) ?? [];
      existing.push(saga);
      index.set(saga.trigger, existing);
    }
  }
  return index;
}

function buildSagaEvent(
  saga: SagaDefinition,
  sagaProgress: Map<string, number>,
  triggerEvent: SimulationEvent,
  eventCounter: number,
  sessionId: string,
  correlationId: string,
): SimulationEvent | null {
  const currentIdx = sagaProgress.get(saga.name) ?? 0;
  if (currentIdx >= saga.states.length) return null;

  const nextState = saga.states[currentIdx];
  sagaProgress.set(saga.name, currentIdx + 1);

  return {
    eventId: `evt-${String(eventCounter).padStart(3, '0')}`,
    eventType: `SimSaga.${saga.name}.${nextState}`,
    productSource: 'moment:simulation',
    sessionId,
    causationEventIds: [triggerEvent.eventId],
    correlationId,
    timestamp: triggerEvent.timestamp,
    version: 1,
    payload: {
      sagaName: saga.name,
      state: nextState,
      triggeredBy: triggerEvent.eventType,
    },
  };
}

// ---------------------------------------------------------------------------
// 2d. Negative scenarios from precondition violations
// ---------------------------------------------------------------------------

export function deriveNegativeScenarios(
  ir: IntermediateRepresentation,
  flow: FlowDefinition,
  options?: SimulationOptions,
): SimulationScenario[] {
  const contextMap = buildContextMap(ir);
  const opts = resolveOptions(flow, options);
  const nodes = collectOrderedNodes(flow, opts.branchSelections);
  const scenarios: SimulationScenario[] = [];

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const kind = resolveNodeKind(node.nodeName, node.contextId, contextMap);
    if (kind !== 'command') continue;

    const preconditions = findPreconditions(node, contextMap);
    for (const pre of preconditions) {
      scenarios.push(buildNegativeScenario(ir, flow, nodes, i, pre, contextMap, opts));
    }
  }

  return scenarios;
}

function findPreconditions(
  node: NodeInfo,
  contextMap: Map<string, ContextDefinition>,
): PreconditionDefinition[] {
  const ctx = contextMap.get(node.contextId);
  if (!ctx) return [];
  const cmd = findCommand(ctx, node.nodeName);
  return cmd?.preconditions ?? [];
}

function buildNegativeScenario(
  ir: IntermediateRepresentation,
  flow: FlowDefinition,
  allNodes: NodeInfo[],
  failIndex: number,
  precondition: PreconditionDefinition,
  contextMap: Map<string, ContextDefinition>,
  opts: ReturnType<typeof resolveOptions>,
): SimulationScenario {
  const precedingNodes = allNodes.slice(0, failIndex + 1);
  const failNode = allNodes[failIndex];

  const events = generateEvents(
    precedingNodes,
    flow,
    contextMap,
    ir,
    opts.sessionId,
    opts.correlationId,
    opts.baseTime,
  );

  const failureEvent = buildFailureEvent(failNode, precondition, events, opts);
  const allEvents = [...events, failureEvent];

  return {
    scenarioId: `${opts.scenarioId}-neg-${failNode.nodeName}-${precondition.name}`,
    flowId: flow.id,
    flowName: flow.name,
    scenarioLabel: `Failure: ${precondition.description} not met`,
    description: `Negative scenario: ${precondition.description} precondition violation at ${failNode.nodeName}`,
    given: `A ${(flow.moments[0]?.name ?? '').toLowerCase()} scenario is initiated`,
    when: `${failNode.nodeName} is invoked without satisfying ${precondition.name}`,
    then: `The command ${failNode.nodeName} is rejected`,
    expectedPath: precedingNodes.map((n) => n.nodeId),
    activeBranches: [],
    events: allEvents,
  };
}

function buildFailureEvent(
  failNode: NodeInfo,
  precondition: PreconditionDefinition,
  precedingEvents: SimulationEvent[],
  opts: ReturnType<typeof resolveOptions>,
): SimulationEvent {
  const lastEvent = precedingEvents[precedingEvents.length - 1];
  const eventCounter = precedingEvents.length + 1;
  return {
    eventId: `evt-${String(eventCounter).padStart(3, '0')}`,
    eventType: `SimFailure.${failNode.nodeName}.PreconditionViolation`,
    productSource: 'moment:simulation',
    sessionId: opts.sessionId,
    causationEventIds: lastEvent ? [lastEvent.eventId] : [],
    correlationId: opts.correlationId,
    timestamp: new Date(opts.baseTime.getTime() + precedingEvents.length * 1000).toISOString(),
    version: 1,
    payload: {
      nodeId: failNode.nodeId,
      failedPrecondition: precondition.name,
      description: precondition.description,
    },
  };
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function findCommand(ctx: ContextDefinition, name: string): CommandDefinition | undefined {
  const topLevel = ctx.commands.find((c) => c.name === name);
  if (topLevel) return topLevel;

  for (const agg of ctx.aggregates) {
    const cmd = agg.commands.find((c) => c.name === name);
    if (cmd) return cmd;
  }
  return undefined;
}

function findEvent(ctx: ContextDefinition, name: string): EventDefinition | undefined {
  const topLevel = ctx.events.find((e) => e.name === name);
  if (topLevel) return topLevel;

  for (const agg of ctx.aggregates) {
    const evt = agg.events.find((e) => e.name === name);
    if (evt) return evt;
  }
  return undefined;
}

function generatePlaceholder(type: string, name: string): unknown {
  if (type === 'UUID') return `${name}-001`;
  if (type === 'string') return `sample-${name}`;
  if (type === 'number') return 0;
  if (type === 'boolean') return true;
  if (type === 'DateTime') return '2026-01-01T10:00:00.000Z';
  if (type === 'Date') return '2026-01-01';
  if (type === 'Money') return 0;
  if (type.endsWith('[]')) return [];
  return {};
}

function buildWhenClause(flow: FlowDefinition, nodes: NodeInfo[]): string {
  const momentNames = [...new Set(nodes.map((n) => n.momentName))];
  return `The flow progresses through ${momentNames.join(', ')}`;
}

function buildThenClause(flow: FlowDefinition, nodes: NodeInfo[], contextNames: string[]): string {
  const lastNode = nodes[nodes.length - 1];
  return `The flow completes at ${lastNode?.momentName ?? 'end'} across ${contextNames.join(', ')}`;
}
