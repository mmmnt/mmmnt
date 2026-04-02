import type { IntermediateRepresentation, ContextDefinition } from '@mmmnt/core';

export interface ImpactNode {
  readonly type: 'event' | 'command' | 'policy' | 'saga' | 'crossing';
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
    addPolicyNodes(context, nodeMap);
    addSagaNodes(context, nodeMap);
  }

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

function addEventNodes(
  context: ContextDefinition,
  nodeMap: Map<string, MutableImpactNode>,
): void {
  for (const agg of context.aggregates) {
    for (const event of agg.events) {
      getOrCreate(nodeMap, 'event', event.name, context.name);
    }
  }
}

function addPolicyNodes(
  context: ContextDefinition,
  nodeMap: Map<string, MutableImpactNode>,
): void {
  for (const policy of context.policies) {
    const policyNode = getOrCreate(nodeMap, 'policy', policy.name, context.name);

    // Policy triggered by an event
    if (policy.trigger) {
      const evtNode = getOrCreate(nodeMap, 'event', policy.trigger, context.name);
      policyNode.dependsOn.push(nodeKey('event', policy.trigger, context.name));
      evtNode.triggers.push(nodeKey('policy', policy.name, context.name));
    }

    // Policy chains to a command
    if (policy.chainsTo) {
      const cmdNode = getOrCreate(nodeMap, 'command', policy.chainsTo, context.name);
      policyNode.triggers.push(nodeKey('command', policy.chainsTo, context.name));
      cmdNode.dependsOn.push(nodeKey('policy', policy.name, context.name));
    }
  }
}

function addSagaNodes(
  context: ContextDefinition,
  nodeMap: Map<string, MutableImpactNode>,
): void {
  for (const saga of context.sagas) {
    const sagaNode = getOrCreate(nodeMap, 'saga', saga.name, context.name);

    if (saga.trigger) {
      const evtNode = getOrCreate(nodeMap, 'event', saga.trigger, context.name);
      sagaNode.dependsOn.push(nodeKey('event', saga.trigger, context.name));
      evtNode.triggers.push(nodeKey('saga', saga.name, context.name));
    }
  }
}

function addCrossingNodes(
  ir: IntermediateRepresentation,
  nodeMap: Map<string, MutableImpactNode>,
): void {
  for (const flow of ir.flows) {
    for (const conn of flow.connections) {
      if (conn.connectionType !== 'crosses-to') continue;

      const sourceCtx = findSourceContextForEvent(conn.eventId, ir);
      const targetCtx = ir.contexts.find((c) => c.id === conn.targetContextId);
      if (!sourceCtx || !targetCtx) continue;

      const eventName = resolveEventName(conn.eventId, ir);
      if (!eventName) continue;

      const crossingName = `${eventName}->${targetCtx.name}`;
      const crossingNode = getOrCreate(nodeMap, 'crossing', crossingName, sourceCtx.name);
      const evtKey = nodeKey('event', eventName, sourceCtx.name);

      if (!crossingNode.dependsOn.includes(evtKey)) {
        crossingNode.dependsOn.push(evtKey);
      }
      const evtNode = nodeMap.get(evtKey);
      if (evtNode) {
        const crossKey = nodeKey('crossing', crossingName, sourceCtx.name);
        if (!evtNode.triggers.includes(crossKey)) {
          evtNode.triggers.push(crossKey);
        }
      }
    }
  }
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

function resolveEventName(
  eventId: string,
  ir: IntermediateRepresentation,
): string | undefined {
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
