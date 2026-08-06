import type {
  AggregateDeclaration,
  CommandDeclaration,
  ContextCrossing,
  ContextDeclaration,
  ContextRelationshipDeclaration,
  DomainEventDeclaration,
  DomainServiceDeclaration,
  FieldDeclaration,
  FlowDeclaration,
  MomentDeclaration,
  InputField,
  InvariantDeclaration,
  MomentFile,
  NodePlacement,
  PolicyDeclaration,
  SagaDeclaration,
  ValueObjectDeclaration,
  WhenBlock,
  AnnotationDeclaration,
} from '../generated/ast.js';
import {
  isAggregateDeclaration,
  isContextRelationshipDeclaration,
  isDomainServiceDeclaration,
  isPolicyDeclaration,
  isSagaDeclaration,
  isCommandDeclaration,
  isDomainEventDeclaration,
  isValueObjectDeclaration,
  isInvariantDeclaration,
  isAnnotationDeclaration,
  isReturnsTo,
  isTriggeredBy,
  isTriggers,
} from '../generated/ast.js';
import type {
  IntermediateRepresentation,
  SpecificationMetadata,
  ContextDefinition,
  AggregateDefinition,
  CommandDefinition,
  PreconditionDefinition,
  EventDefinition,
  ValueObjectDefinition,
  FieldDefinition,
  InvariantDefinition,
  DomainServiceDefinition,
  PolicyDefinition,
  SagaDefinition,
  SagaTransitionDefinition,
  AnnotationDefinition,
  FlowDefinition,
  LaneDefinition,
  MomentDefinition,
  MomentEntry,
  BranchDefinition,
  ConnectionDefinition,
  SchemaContract,
  SchemaFieldDefinition,
  ContextRelationship,
} from '../ir/index.js';
import { buildMomentSequence } from './moment-sequence.js';

/**
 * Strip surrounding double-quotes from a Langium STRING token value.
 */
function unquote(s: string): string {
  if (s.startsWith('"') && s.endsWith('"')) {
    return s.slice(1, -1);
  }
  return s;
}

/**
 * Pure transformation: Langium AST -> IntermediateRepresentation.
 * No I/O, no side effects.
 *
 * `metadata` lets callers that know the spec's identity (parser/CLI: file
 * basename, manifest version) stamp it onto the IR instead of the historical
 * hardcoded placeholder (M-P12). Omitted fields keep the old defaults.
 */
export function astToIr(
  file: MomentFile,
  metadata?: Partial<SpecificationMetadata>,
): IntermediateRepresentation {
  const contexts: ContextDefinition[] = file.contexts.map(transformContext);
  const nodeKindMap = buildNodeKindMap(contexts);
  const flows: FlowDefinition[] = file.flows.map((flow) => transformFlow(flow, nodeKindMap));

  const relationships: ContextRelationship[] = file.contexts.flatMap(extractRelationships);

  return {
    contexts,
    flows,
    glossary: [],
    relationships,
    metadata: {
      name: metadata?.name ?? '',
      version: metadata?.version ?? '0.0.0',
      ...(metadata?.description !== undefined ? { description: metadata.description } : {}),
    },
  };
}

function transformContext(ctx: ContextDeclaration): ContextDefinition {
  const name = unquote(ctx.name);
  const aggregates: AggregateDefinition[] = [];
  const domainServices: DomainServiceDefinition[] = [];
  const policies: PolicyDefinition[] = [];
  const sagas: SagaDefinition[] = [];

  // Collect all top-level commands, events, value objects, invariants from aggregates
  const allCommands: CommandDefinition[] = [];
  const allEvents: EventDefinition[] = [];
  const allValueObjects: ValueObjectDefinition[] = [];
  const allInvariants: InvariantDefinition[] = [];

  // Annotations classify the NEXT declaration in the member list (§5.1.4).
  let pendingAnnotations: AnnotationDefinition[] = [];

  for (const member of ctx.members) {
    if (isAnnotationDeclaration(member)) {
      pendingAnnotations.push(transformAnnotation(member));
      continue;
    }
    const annotations = pendingAnnotations.length > 0 ? pendingAnnotations : undefined;
    pendingAnnotations = [];

    if (isAggregateDeclaration(member)) {
      const aggDef = transformAggregate(member, annotations);
      aggregates.push(aggDef);
      allCommands.push(...aggDef.commands);
      allEvents.push(...aggDef.events);
      allValueObjects.push(...aggDef.valueObjects);
      allInvariants.push(...aggDef.invariants);
    } else if (isDomainServiceDeclaration(member)) {
      domainServices.push(transformService(member, annotations));
    } else if (isPolicyDeclaration(member)) {
      policies.push(transformPolicy(member, annotations));
    } else if (isSagaDeclaration(member)) {
      sagas.push(transformSaga(member, annotations));
    }
    // ContextRelationshipDeclaration handled separately via extractRelationships
  }

  return {
    id: `ctx-${name}`,
    name,
    classification: ctx.classification?.value as
      | 'Core'
      | 'Supporting'
      | 'Generic'
      | 'Terminal'
      | undefined,
    description: ctx.description ? unquote(ctx.description) : undefined,
    aggregates,
    domainServices,
    commands: allCommands,
    events: allEvents,
    policies,
    sagas,
    valueObjects: allValueObjects,
    invariants: allInvariants,
  };
}

function transformAnnotation(ann: AnnotationDeclaration): AnnotationDefinition {
  const raw = ann.value;
  return {
    name: ann.name as AnnotationDefinition['name'],
    value: raw.startsWith('"') ? unquote(raw) : raw,
  };
}

function transformAggregate(
  agg: AggregateDeclaration,
  annotations?: AnnotationDefinition[],
): AggregateDefinition {
  const name = unquote(agg.name);
  const commands: CommandDefinition[] = [];
  const events: EventDefinition[] = [];
  const valueObjects: ValueObjectDefinition[] = [];
  const invariants: InvariantDefinition[] = [];

  // Annotations classify the NEXT declaration in the member list (§5.1.4).
  let pendingAnnotations: AnnotationDefinition[] = [];

  for (const member of agg.members) {
    if (isAnnotationDeclaration(member)) {
      pendingAnnotations.push(transformAnnotation(member));
      continue;
    }
    const memberAnnotations = pendingAnnotations.length > 0 ? pendingAnnotations : undefined;
    pendingAnnotations = [];

    if (isCommandDeclaration(member)) {
      commands.push(transformCommand(member, memberAnnotations));
    } else if (isDomainEventDeclaration(member)) {
      events.push(transformEvent(member, memberAnnotations));
    } else if (isValueObjectDeclaration(member)) {
      valueObjects.push(transformValueObject(member, memberAnnotations));
    } else if (isInvariantDeclaration(member)) {
      invariants.push(transformInvariant(member, memberAnnotations));
    }
  }

  return {
    id: `agg-${name}`,
    name,
    ...(annotations ? { annotations } : {}),
    identityField: transformFieldDeclaration(agg.identityField),
    commands,
    events,
    valueObjects,
    invariants,
  };
}

function transformCommand(
  cmd: CommandDeclaration,
  annotations?: AnnotationDefinition[],
): CommandDefinition {
  return {
    id: `cmd-${cmd.name}`,
    name: cmd.name,
    ...(annotations ? { annotations } : {}),
    inputs: cmd.inputs.map(transformFieldDeclaration),
    preconditions: cmd.preconditions.map(transformPrecondition),
    emitsEvent: cmd.emits,
  };
}

function transformPrecondition(pre: { name: string; description: string }): PreconditionDefinition {
  return {
    name: pre.name,
    description: unquote(pre.description),
  };
}

function transformEvent(
  evt: DomainEventDeclaration,
  annotations?: AnnotationDefinition[],
): EventDefinition {
  return {
    id: `evt-${evt.name}`,
    name: evt.name,
    ...(annotations ? { annotations } : {}),
    fields: evt.fields.map(transformFieldDeclaration),
  };
}

function transformValueObject(
  vo: ValueObjectDeclaration,
  annotations?: AnnotationDefinition[],
): ValueObjectDefinition {
  return {
    id: `vo-${vo.name}`,
    name: vo.name,
    ...(annotations ? { annotations } : {}),
    fields: vo.fields.map(transformFieldDeclaration),
  };
}

function transformFieldDeclaration(field: FieldDeclaration | InputField): FieldDefinition {
  const result: FieldDefinition = {
    name: field.name,
    type: field.type.typeName,
    isArray: field.type.isArray,
    required: true,
  };
  if ('deprecation' in field && field.deprecation) {
    result.deprecated = {
      reason: unquote(field.deprecation.reason),
      replacement: unquote(field.deprecation.replacement),
    };
  }
  return result;
}

function transformInvariant(
  inv: InvariantDeclaration,
  annotations?: AnnotationDefinition[],
): InvariantDefinition {
  return {
    id: inv.id,
    description: unquote(inv.description),
    scope: inv.scope,
    ...(annotations ? { annotations } : {}),
  };
}

function transformService(
  svc: DomainServiceDeclaration,
  annotations?: AnnotationDefinition[],
): DomainServiceDefinition {
  return {
    id: `svc-${svc.name}`,
    name: svc.name,
    ...(annotations ? { annotations } : {}),
    consumes: svc.consumes,
    produces: svc.produces,
    description: unquote(svc.description),
  };
}

function transformPolicy(
  pol: PolicyDeclaration,
  annotations?: AnnotationDefinition[],
): PolicyDefinition {
  const trigger = pol.trigger.eventName ?? 'file-watcher';
  return {
    id: `pol-${pol.name}`,
    name: pol.name,
    ...(annotations ? { annotations } : {}),
    trigger,
    action: unquote(pol.action),
    chainsTo: pol.chainsTo ?? undefined,
  };
}

function transformSaga(
  saga: SagaDeclaration,
  annotations?: AnnotationDefinition[],
): SagaDefinition {
  const timeout = saga.timeout.duration ?? 'none';
  // The grammar's state chain is `initialState (-> target (on event)?)*`.
  // `states` keeps the historical flat list; `transitions` additionally
  // carries the per-transition event mapping (M-S6).
  const states = [saga.initialState, ...saga.transitions.map((t) => t.target)];
  const transitions: SagaTransitionDefinition[] = saga.transitions.map((t, i) => ({
    from: states[i],
    to: t.target,
    ...(t.event !== undefined ? { onEvent: t.event } : {}),
  }));
  return {
    id: `saga-${saga.name}`,
    name: saga.name,
    ...(annotations ? { annotations } : {}),
    trigger: saga.trigger,
    states,
    transitions,
    compensation: unquote(saga.compensation),
    timeout,
  };
}

function buildLaneContextMap(flow: FlowDeclaration): Map<string, string> {
  const map = new Map<string, string>();
  for (const lane of flow.lanes) {
    map.set(lane.id, `ctx-${unquote(lane.label)}`);
  }
  return map;
}

/**
 * Resolve node kinds from same-file context declarations. Names not declared
 * in any context (flow-only specs) keep the historical 'event' default.
 */
function buildNodeKindMap(contexts: ContextDefinition[]): Map<string, MomentEntry['nodeKind']> {
  const map = new Map<string, MomentEntry['nodeKind']>();
  for (const ctx of contexts) {
    for (const cmd of ctx.commands) map.set(cmd.name, 'command');
    for (const evt of ctx.events) map.set(evt.name, 'event');
    for (const policy of ctx.policies) map.set(policy.name, 'policy');
    for (const saga of ctx.sagas) map.set(saga.name, 'saga');
  }
  return map;
}

/** Map every node name placed in the flow to the lane it is declared in. */
function buildNodeLaneMap(flow: FlowDeclaration): Map<string, string> {
  const map = new Map<string, string>();
  const record = (node: NodePlacement): void => {
    if (!map.has(node.nodeName)) {
      map.set(node.nodeName, node.laneId);
    }
  };
  for (const moment of flow.moments) {
    for (const node of moment.nodes) record(node);
    for (const when of moment.whenBlocks) {
      for (const node of when.nodes) record(node);
    }
  }
  return map;
}

function transformFlow(
  flow: FlowDeclaration,
  nodeKindMap?: Map<string, MomentEntry['nodeKind']>,
): FlowDefinition {
  const name = unquote(flow.name);
  const laneContextMap = buildLaneContextMap(flow);
  const lanes: LaneDefinition[] = flow.lanes.map((lane) => ({
    id: lane.id,
    label: unquote(lane.label),
    contextId: laneContextMap.get(lane.id) ?? lane.id,
    classification: lane.classification?.value,
    isBranch: lane.isBranch ?? false,
  }));
  return {
    id: `flow-${name}`,
    name,
    description: flow.description ? unquote(flow.description) : undefined,
    lanes,
    moments: flow.moments.map((moment, idx) =>
      transformMoment(moment, idx, laneContextMap, nodeKindMap),
    ),
    connections: extractConnections(flow, laneContextMap),
  };
}

function transformMoment(
  moment: MomentDeclaration,
  index: number,
  laneContextMap?: Map<string, string>,
  nodeKindMap?: Map<string, MomentEntry['nodeKind']>,
): MomentDefinition {
  const name = unquote(moment.label);
  const contextEntries: MomentEntry[] = moment.nodes.map((n) =>
    transformNodeToEntry(n, laneContextMap, nodeKindMap),
  );

  const branches: BranchDefinition[] | undefined =
    moment.whenBlocks.length > 0
      ? moment.whenBlocks.map((wb) => transformWhenBlock(wb, laneContextMap, nodeKindMap))
      : undefined;

  // A moment terminates the flow if any entry is terminal — whether it sits in
  // the main node list or inside a `when` branch.
  const hasTerminal =
    contextEntries.some((e) => e.terminal === true) ||
    (branches?.some((b) => b.entries.some((e) => e.terminal === true)) ?? false);

  return {
    id: `moment-${index}-${name.replace(/\s+/g, '-')}`,
    name,
    contextEntries,
    branches,
    terminal: hasTerminal || undefined,
    isBranch: moment.isBranch || undefined,
    // Textual order of entries/branches from CST offsets (M-P13); falls back
    // to entries-then-branches when the AST carries no CST.
    sequence: buildMomentSequence(moment).sequence,
  };
}

function transformWhenBlock(
  when: WhenBlock,
  laneContextMap?: Map<string, string>,
  nodeKindMap?: Map<string, MomentEntry['nodeKind']>,
): BranchDefinition {
  return {
    condition: when.condition,
    ...(when.lane ? { lane: when.lane } : {}),
    entries: when.nodes.map((n) => transformNodeToEntry(n, laneContextMap, nodeKindMap)),
  };
}

function multiplicityOf(node: NodePlacement): number | string | undefined {
  if (!node.multiplicity) return undefined;
  return node.multiplicity.count ?? node.multiplicity.countVar;
}

function transformNodeToEntry(
  node: NodePlacement,
  laneContextMap?: Map<string, string>,
  nodeKindMap?: Map<string, MomentEntry['nodeKind']>,
): MomentEntry {
  const contextId = laneContextMap?.get(node.laneId) ?? node.laneId;
  const entry: MomentEntry = {
    contextId,
    nodeName: node.nodeName,
    // Resolved from same-file context declarations; 'event' when the spec is
    // flow-only and the kind is genuinely unknown (MMNT-27).
    nodeKind: nodeKindMap?.get(node.nodeName) ?? 'event',
  };

  const multiplicity = multiplicityOf(node);
  if (multiplicity !== undefined) {
    entry.multiplicity = multiplicity;
  }

  const modifierType = node.modifier?.type;
  if (modifierType === 'optional') {
    entry.optional = true;
  } else if (modifierType === 'terminal') {
    entry.terminal = true;
  }

  return entry;
}

function extractConnections(
  flow: FlowDeclaration,
  laneContextMap?: Map<string, string>,
): ConnectionDefinition[] {
  const connections: ConnectionDefinition[] = [];
  let connectionCounter = 0;

  const resolveCtx = (laneId: string): string => laneContextMap?.get(laneId) ?? laneId;
  const nodeLaneMap = buildNodeLaneMap(flow);
  // Context of a node referenced by name (e.g. the target of `triggers X`),
  // falling back to the declaring node's own lane when X is not placed anywhere.
  const resolveNodeCtx = (nodeName: string, fallbackLaneId: string): string => {
    const laneId = nodeLaneMap.get(nodeName) ?? fallbackLaneId;
    return resolveCtx(laneId);
  };
  const momentLabelToId = new Map<string, string>();
  for (let momentIdx = 0; momentIdx < flow.moments.length; momentIdx++) {
    const label = unquote(flow.moments[momentIdx].label);
    momentLabelToId.set(label, `moment-${momentIdx}-${label.replace(/\s+/g, '-')}`);
  }

  for (let momentIdx = 0; momentIdx < flow.moments.length; momentIdx++) {
    const moment = flow.moments[momentIdx];
    const momentId = `moment-${momentIdx}-${unquote(moment.label).replace(/\s+/g, '-')}`;

    const processNode = (node: NodePlacement, branchCondition?: string): void => {
      const branchFields = branchCondition ? { branchCondition } : {};
      // Context crossing -> crosses-to connection
      if (node.crossing) {
        const contract = transformCrossingToContract(node);
        connections.push({
          id: `conn-${connectionCounter++}`,
          sourceMomentId: momentId,
          targetContextId: resolveCtx(node.crossing.targetLaneId),
          eventId: `evt-${node.nodeName}`,
          sourceNodeName: node.nodeName,
          connectionType: 'crosses-to',
          schemaContract: contract,
          ...branchFields,
        });
      }

      // Connection annotations
      for (const conn of node.connections) {
        if (isTriggeredBy(conn)) {
          // `N triggered-by X`: X is the cause, the declaring node N is the target.
          connections.push({
            id: `conn-${connectionCounter++}`,
            sourceMomentId: momentId,
            targetContextId: resolveCtx(node.laneId),
            eventId: `evt-${conn.nodeName}`,
            sourceNodeName: conn.nodeName,
            targetNodeName: node.nodeName,
            connectionType: 'triggered-by',
            ...branchFields,
          });
        } else if (isTriggers(conn)) {
          // `N triggers X`: the declaring node N is the cause, X is the target —
          // resolve the target's context from where X is actually placed.
          connections.push({
            id: `conn-${connectionCounter++}`,
            sourceMomentId: momentId,
            targetContextId: resolveNodeCtx(conn.nodeName, node.laneId),
            eventId: `evt-${conn.nodeName}`,
            sourceNodeName: node.nodeName,
            targetNodeName: conn.nodeName,
            connectionType: 'triggers',
            ...branchFields,
          });
        } else if (isReturnsTo(conn)) {
          const targetLabel = unquote(conn.frameLabel);
          connections.push({
            id: `conn-${connectionCounter++}`,
            sourceMomentId: momentId,
            targetContextId: resolveCtx(node.laneId),
            eventId: `evt-${node.nodeName}`,
            sourceNodeName: node.nodeName,
            connectionType: 'returns-to',
            targetMomentLabel: targetLabel,
            ...(momentLabelToId.has(targetLabel)
              ? { targetMomentId: momentLabelToId.get(targetLabel) }
              : {}),
            ...branchFields,
          });
        }
      }
    };

    for (const node of moment.nodes) {
      processNode(node);
    }

    for (const when of moment.whenBlocks) {
      for (const node of when.nodes) {
        processNode(node, when.condition);
      }
    }
  }

  return connections;
}

function transformCrossingToContract(node: NodePlacement): SchemaContract {
  const crossing = node.crossing as ContextCrossing;
  const fields: SchemaFieldDefinition[] = crossing.fields.map((f) => ({
    name: f.name,
    type: f.type.typeName + (f.type.isArray ? '[]' : ''),
    required: f.required,
  }));

  return {
    eventType: node.nodeName,
    fields,
    relationshipType: crossing.relationshipType,
  };
}

function extractRelationships(ctx: ContextDeclaration): ContextRelationship[] {
  const relationships: ContextRelationship[] = [];

  for (const member of ctx.members) {
    if (isContextRelationshipDeclaration(member)) {
      const rel = member as ContextRelationshipDeclaration;
      relationships.push({
        // ctx- prefix matches ContextDefinition.id so consumers can join on id.
        sourceContextId: `ctx-${rel.source}`,
        targetContextId: `ctx-${rel.target}`,
        relationshipType: rel.type,
        contract: unquote(rel.contract),
      });
    }
  }

  return relationships;
}
