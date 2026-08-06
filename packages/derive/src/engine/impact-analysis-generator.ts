import type {
  IntermediateRepresentation,
  ContextDefinition,
  FlowDefinition,
  ConnectionDefinition,
} from '@mmmnt/core';

type CrossingConnection = Extract<ConnectionDefinition, { connectionType: 'crosses-to' }>;

export interface ImpactNode {
  readonly type: 'event' | 'command' | 'policy' | 'saga' | 'projection' | 'crossing';
  readonly name: string;
  readonly context: string;
  readonly dependsOn: readonly string[];
  readonly triggers: readonly string[];
}

export interface ImpactAnalysis {
  readonly nodes: readonly ImpactNode[];
  readonly metadata: { readonly generatedAt: string };
}

export function generateImpactAnalysis(ir: IntermediateRepresentation): ImpactAnalysis {
  const nodeMap = new Map<string, MutableImpactNode>();

  for (const context of ir.contexts) {
    addCommandNodes(context, nodeMap);
    addEventNodes(context, nodeMap);
    addPolicyNodes(context, nodeMap, ir);
    addSagaNodes(context, nodeMap, ir);
  }

  // Audit fix #3: flow-only specs (or flows referencing nodes the contexts
  // don't declare) must still produce impact nodes. Every flow node becomes
  // an impact node; triggers/triggered-by connections provide edges.
  addFlowNodes(ir, nodeMap);

  addCrossingNodes(ir, nodeMap);

  const nodes: ImpactNode[] = Array.from(nodeMap.values()).map((n) => ({
    type: n.type,
    name: n.name,
    context: n.context,
    dependsOn: [...n.dependsOn],
    triggers: [...n.triggers],
  }));

  return {
    nodes,
    metadata: { generatedAt: new Date().toISOString() },
  };
}

interface MutableImpactNode {
  readonly type: ImpactNode['type'];
  readonly name: string;
  readonly context: string;
  readonly dependsOn: string[];
  readonly triggers: string[];
}

function nodeKey(type: string, name: string, context: string): string {
  return `${type}:${context}:${name}`;
}

function getOrCreate(
  map: Map<string, MutableImpactNode>,
  type: ImpactNode['type'],
  name: string,
  context: string,
): MutableImpactNode {
  const key = nodeKey(type, name, context);
  let node = map.get(key);
  if (!node) {
    node = { type, name, context, dependsOn: [], triggers: [] };
    map.set(key, node);
  }
  return node;
}

function addCommandNodes(
  context: ContextDefinition,
  nodeMap: Map<string, MutableImpactNode>,
): void {
  for (const agg of context.aggregates) {
    for (const cmd of agg.commands) {
      const cmdNode = getOrCreate(nodeMap, 'command', cmd.name, context.name);
      if (cmd.emitsEvent) {
        const evtNode = getOrCreate(nodeMap, 'event', cmd.emitsEvent, context.name);
        cmdNode.triggers.push(nodeKey('event', cmd.emitsEvent, context.name));
        evtNode.dependsOn.push(nodeKey('command', cmd.name, context.name));
      }
    }
  }
}

function addEventNodes(context: ContextDefinition, nodeMap: Map<string, MutableImpactNode>): void {
  for (const agg of context.aggregates) {
    for (const event of agg.events) {
      getOrCreate(nodeMap, 'event', event.name, context.name);
    }
  }
}

/**
 * Audit fix M-E7: policy/saga triggers and chained commands are NOT
 * context-local — a policy in AntiFraud may trigger on Inventory's SeatsHeld.
 * Resolving them against the policy's own context minted phantom nodes
 * (`event:AntiFraud:SeatsHeld` with empty dependsOn, duplicating the real
 * `event:Inventory:SeatsHeld`), detaching the chain from the impact graph.
 * Edges must attach to the context that DECLARES the event/command; the
 * policy's own context is only a fallback for undeclared names.
 */
function findDeclaringContextForEvent(
  eventName: string,
  ir: IntermediateRepresentation,
): ContextDefinition | undefined {
  for (const ctx of ir.contexts) {
    if (ctx.events.some((e) => e.name === eventName)) return ctx;
    for (const agg of ctx.aggregates) {
      if (agg.events.some((e) => e.name === eventName)) return ctx;
    }
  }
  return undefined;
}

function findDeclaringContextForCommand(
  commandName: string,
  ir: IntermediateRepresentation,
): ContextDefinition | undefined {
  for (const ctx of ir.contexts) {
    if (ctx.commands.some((c) => c.name === commandName)) return ctx;
    for (const agg of ctx.aggregates) {
      if (agg.commands.some((c) => c.name === commandName)) return ctx;
    }
  }
  return undefined;
}

function addPolicyNodes(
  context: ContextDefinition,
  nodeMap: Map<string, MutableImpactNode>,
  ir: IntermediateRepresentation,
): void {
  for (const policy of context.policies) {
    const policyNode = getOrCreate(nodeMap, 'policy', policy.name, context.name);

    // Policy triggered by an event — resolved to the event's declaring context
    if (policy.trigger) {
      const evtCtxName = (findDeclaringContextForEvent(policy.trigger, ir) ?? context).name;
      const evtNode = getOrCreate(nodeMap, 'event', policy.trigger, evtCtxName);
      policyNode.dependsOn.push(nodeKey('event', policy.trigger, evtCtxName));
      evtNode.triggers.push(nodeKey('policy', policy.name, context.name));
    }

    // Policy chains to a command — resolved to the command's declaring context
    if (policy.chainsTo) {
      const cmdCtxName = (findDeclaringContextForCommand(policy.chainsTo, ir) ?? context).name;
      const cmdNode = getOrCreate(nodeMap, 'command', policy.chainsTo, cmdCtxName);
      policyNode.triggers.push(nodeKey('command', policy.chainsTo, cmdCtxName));
      cmdNode.dependsOn.push(nodeKey('policy', policy.name, context.name));
    }
  }
}

function addSagaNodes(
  context: ContextDefinition,
  nodeMap: Map<string, MutableImpactNode>,
  ir: IntermediateRepresentation,
): void {
  for (const saga of context.sagas) {
    const sagaNode = getOrCreate(nodeMap, 'saga', saga.name, context.name);

    if (saga.trigger) {
      const evtCtxName = (findDeclaringContextForEvent(saga.trigger, ir) ?? context).name;
      const evtNode = getOrCreate(nodeMap, 'event', saga.trigger, evtCtxName);
      sagaNode.dependsOn.push(nodeKey('event', saga.trigger, evtCtxName));
      evtNode.triggers.push(nodeKey('saga', saga.name, context.name));
    }
  }
}

/** Resolve a contextId to its human name; strip the ctx- prefix when unknown. */
function contextDisplayName(contextId: string, ir: IntermediateRepresentation): string {
  const ctx = ir.contexts.find((c) => c.id === contextId);
  return ctx?.name ?? contextId.replace(/^ctx-/, '');
}

function addFlowNodes(
  ir: IntermediateRepresentation,
  nodeMap: Map<string, MutableImpactNode>,
): void {
  for (const flow of ir.flows) {
    addFlowMomentNodes(flow, nodeMap, ir);
    addFlowTriggerEdges(flow, nodeMap);
  }
}

/** Nodes: every moment entry, main and branch scopes alike. Context-derived
 *  nodes resolve to the same key (ctx.name) so no duplicates are created. */
function addFlowMomentNodes(
  flow: FlowDefinition,
  nodeMap: Map<string, MutableImpactNode>,
  ir: IntermediateRepresentation,
): void {
  for (const moment of flow.moments) {
    const entries = [
      ...moment.contextEntries,
      ...(moment.branches ?? []).flatMap((b) => b.entries),
    ];
    for (const entry of entries) {
      getOrCreate(nodeMap, entry.nodeKind, entry.nodeName, contextDisplayName(entry.contextId, ir));
    }
  }
}

/** Edges: triggers/triggered-by connections both carry the cause in
 *  sourceNodeName and the effect in targetNodeName. */
function addFlowTriggerEdges(flow: FlowDefinition, nodeMap: Map<string, MutableImpactNode>): void {
  for (const conn of flow.connections) {
    if (conn.connectionType !== 'triggers' && conn.connectionType !== 'triggered-by') continue;
    if (!conn.sourceNodeName || !conn.targetNodeName) continue;

    const cause = findNodeByName(nodeMap, conn.sourceNodeName);
    const effect = findNodeByName(nodeMap, conn.targetNodeName);
    if (!cause || !effect) continue;

    const causeKey = nodeKey(cause.type, cause.name, cause.context);
    const effectKey = nodeKey(effect.type, effect.name, effect.context);
    if (!cause.triggers.includes(effectKey)) cause.triggers.push(effectKey);
    if (!effect.dependsOn.includes(causeKey)) effect.dependsOn.push(causeKey);
  }
}

function findNodeByName(
  nodeMap: Map<string, MutableImpactNode>,
  name: string,
): MutableImpactNode | undefined {
  for (const node of nodeMap.values()) {
    if (node.name === name) return node;
  }
  return undefined;
}

function addCrossingNodes(
  ir: IntermediateRepresentation,
  nodeMap: Map<string, MutableImpactNode>,
): void {
  for (const flow of ir.flows) {
    for (const conn of flow.connections) {
      if (conn.connectionType !== 'crosses-to') continue;
      addCrossingNode(conn, flow, nodeMap, ir);
    }
  }
}

function addCrossingNode(
  conn: CrossingConnection,
  flow: FlowDefinition,
  nodeMap: Map<string, MutableImpactNode>,
  ir: IntermediateRepresentation,
): void {
  // Audit fix #3: fall back to the crossing's own schema contract and the
  // producing flow entry when the contexts don't declare the event.
  const eventName = resolveEventName(conn.eventId, ir) ?? conn.schemaContract.eventType;
  if (!eventName) return;

  const sourceCtx = findSourceContextForEvent(conn.eventId, ir);
  const sourceCtxName =
    sourceCtx?.name ?? findProducingEntryContext(eventName, conn.sourceMomentId, flow, ir);
  if (!sourceCtxName) return;

  const targetCtxName = contextDisplayName(conn.targetContextId, ir);

  const crossingName = `${eventName}->${targetCtxName}`;
  const crossingNode = getOrCreate(nodeMap, 'crossing', crossingName, sourceCtxName);
  const evtKey = nodeKey('event', eventName, sourceCtxName);

  if (!crossingNode.dependsOn.includes(evtKey)) {
    crossingNode.dependsOn.push(evtKey);
  }
  const evtNode = nodeMap.get(evtKey);
  if (evtNode) {
    const crossKey = nodeKey('crossing', crossingName, sourceCtxName);
    if (!evtNode.triggers.includes(crossKey)) {
      evtNode.triggers.push(crossKey);
    }
  }
}

/**
 * Resolve the context of the flow entry that produces `eventName` in the
 * crossing's source moment. Returns undefined (no fabrication) when no entry
 * matches.
 */
function findProducingEntryContext(
  eventName: string,
  sourceMomentId: string,
  flow: FlowDefinition,
  ir: IntermediateRepresentation,
): string | undefined {
  const moment = flow.moments.find((m) => m.id === sourceMomentId);
  if (!moment) return undefined;
  const entries = [...moment.contextEntries, ...(moment.branches ?? []).flatMap((b) => b.entries)];
  const producing = entries.find((e) => e.nodeName === eventName);
  return producing ? contextDisplayName(producing.contextId, ir) : undefined;
}

function findSourceContextForEvent(
  eventId: string,
  ir: IntermediateRepresentation,
): ContextDefinition | undefined {
  for (const ctx of ir.contexts) {
    if (ctx.events.some((e) => e.id === eventId)) return ctx;
    for (const agg of ctx.aggregates) {
      if (agg.events.some((e) => e.id === eventId)) return ctx;
    }
  }
  return undefined;
}

function resolveEventName(eventId: string, ir: IntermediateRepresentation): string | undefined {
  for (const ctx of ir.contexts) {
    for (const evt of ctx.events) {
      if (evt.id === eventId) return evt.name;
    }
    for (const agg of ctx.aggregates) {
      for (const evt of agg.events) {
        if (evt.id === eventId) return evt.name;
      }
    }
  }
  return undefined;
}
