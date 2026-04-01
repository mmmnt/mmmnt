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
} from '@mmmnt/core';

export interface SimulationScenario {
  readonly scenarioId: string;
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

export interface SimulationOptions {
  readonly scenarioId?: string;
  readonly branchSelections?: Record<string, string>;
  readonly sessionId?: string;
  readonly baseTimestamp?: string;
}

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

export function generateSimulationScenario(
  ir: IntermediateRepresentation,
  flow: FlowDefinition,
  options?: SimulationOptions,
): SimulationScenario {
  const opts = resolveOptions(flow, options);
  const contextMap = buildContextMap(ir);
  const nodes = collectOrderedNodes(flow, opts.branchSelections);
  const activeBranches = collectActiveBranches(flow, opts.branchSelections);

  const events = generateEvents(
    nodes,
    flow,
    contextMap,
    ir,
    opts.sessionId,
    opts.correlationId,
    opts.baseTime,
  );

  const contextNames = [...new Set(nodes.map((n) => n.contextName))];

  return {
    scenarioId: opts.scenarioId,
    scenarioLabel: `Happy Path: ${flow.name}`,
    description: flow.description ?? `Full lifecycle flow: ${flow.name}`,
    given: `A ${(flow.moments[0]?.name ?? '').toLowerCase()} scenario is initiated`,
    when: buildWhenClause(flow, nodes),
    then: buildThenClause(flow, nodes, contextNames),
    expectedPath: nodes.map((n) => n.nodeId),
    activeBranches,
    events,
  };
}

function buildContextMap(ir: IntermediateRepresentation): Map<string, ContextDefinition> {
  return new Map(ir.contexts.map((c) => [c.id, c]));
}

function collectOrderedNodes(
  flow: FlowDefinition,
  branchSelections: Record<string, string>,
): NodeInfo[] {
  const nodes: NodeInfo[] = [];

  for (let i = 0; i < flow.moments.length; i++) {
    const moment = flow.moments[i];

    if (moment.branches && moment.branches.length > 0) {
      const selectedCondition = branchSelections[moment.name];
      const branch = selectedCondition
        ? moment.branches.find((b) => b.condition === selectedCondition)
        : moment.branches[0];

      if (branch) {
        for (const entry of branch.entries) {
          nodes.push(entryToNode(entry, moment, i));
        }
      }

      for (const entry of moment.contextEntries) {
        nodes.push(entryToNode(entry, moment, i));
      }
    } else {
      for (const entry of moment.contextEntries) {
        nodes.push(entryToNode(entry, moment, i));
      }
    }
  }

  return nodes;
}

function entryToNode(entry: MomentEntry, moment: MomentDefinition, momentIndex: number): NodeInfo {
  const contextName = entry.contextId.replace(/^ctx-/, '');
  return {
    nodeId: `n${String(momentIndex).padStart(2, '0')}-${entry.nodeName}`,
    nodeName: entry.nodeName,
    contextId: entry.contextId,
    contextName,
    nodeKind: entry.nodeKind,
    momentName: moment.name,
    momentIndex,
  };
}

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

    const eventType = resolveEventType(node);
    const productSource = resolveProductSource(node, contextMap);
    const payload = buildPayload(node, contextMap, ir);

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
      const triggerNodeName = conn.eventId.replace(/^evt-/, '');
      const currentNodeInMoment = allNodes.some(
        (n, idx) => idx === currentIndex && n.nodeName === triggerNodeName,
      );

      if (!currentNodeInMoment) {
        for (let j = currentIndex - 1; j >= 0; j--) {
          if (allNodes[j].nodeName === triggerNodeName) {
            const evtId = nodeToEventId.get(allNodes[j].nodeId);
            if (evtId) causation.push(evtId);
            break;
          }
        }
      }
    }
  }

  if (causation.length === 0 && currentIndex > 0) {
    const prevNode = allNodes[currentIndex - 1];
    const prevEvtId = nodeToEventId.get(prevNode.nodeId);
    if (prevEvtId) causation.push(prevEvtId);
  }

  return causation;
}

function resolveEventType(node: NodeInfo): string {
  if (node.nodeKind === 'command') {
    return `SimProcess.${node.nodeName}`;
  }
  return node.nodeName;
}

function resolveProductSource(node: NodeInfo, contextMap: Map<string, ContextDefinition>): string {
  const ctx = contextMap.get(node.contextId);
  if (!ctx) return 'moment:simulation';

  if (node.nodeKind === 'event') {
    const isDefinedEvent = ctx.events.some((e) => e.name === node.nodeName);
    if (isDefinedEvent) {
      return ctx.name.toLowerCase().replace(/\s+/g, '-');
    }
  }

  return 'moment:simulation';
}

function buildPayload(
  node: NodeInfo,
  contextMap: Map<string, ContextDefinition>,
  ir: IntermediateRepresentation,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    nodeId: node.nodeId,
  };

  const ctx = contextMap.get(node.contextId);
  if (!ctx) return payload;

  if (node.nodeKind === 'command') {
    payload.processName = node.nodeName;
    const cmd = findCommand(ctx, node.nodeName);
    if (cmd) {
      for (const input of cmd.inputs) {
        payload[input.name] = generatePlaceholder(input.type, input.name);
      }
    }
  }

  if (node.nodeKind === 'event') {
    const evt = findEvent(ctx, node.nodeName);
    if (evt) {
      for (const field of evt.fields) {
        payload[field.name] = generatePlaceholder(field.type, field.name);
      }
    }
  }

  return payload;
}

function findCommand(ctx: ContextDefinition, name: string): CommandDefinition | undefined {
  for (const agg of ctx.aggregates) {
    const cmd = agg.commands.find((c) => c.name === name);
    if (cmd) return cmd;
  }
  return undefined;
}

function findEvent(ctx: ContextDefinition, name: string): EventDefinition | undefined {
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
