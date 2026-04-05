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
  isReturnsTo,
  isTriggeredBy,
  isTriggers,
} from '../generated/ast.js';
import type {
  IntermediateRepresentation,
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
 */
export function astToIr(file: MomentFile): IntermediateRepresentation {
  const contexts: ContextDefinition[] = file.contexts.map(transformContext);
  const flows: FlowDefinition[] = file.flows.map(transformFlow);

  const relationships: ContextRelationship[] = file.contexts.flatMap(extractRelationships);

  return {
    contexts,
    flows,
    glossary: [],
    relationships,
    metadata: { name: '', version: '0.0.0' },
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

  for (const member of ctx.members) {
    if (isAggregateDeclaration(member)) {
      const aggDef = transformAggregate(member);
      aggregates.push(aggDef);
      allCommands.push(...aggDef.commands);
      allEvents.push(...aggDef.events);
      allValueObjects.push(...aggDef.valueObjects);
      allInvariants.push(...aggDef.invariants);
    } else if (isDomainServiceDeclaration(member)) {
      domainServices.push(transformService(member));
    } else if (isPolicyDeclaration(member)) {
      policies.push(transformPolicy(member));
    } else if (isSagaDeclaration(member)) {
      sagas.push(transformSaga(member));
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

function transformAggregate(agg: AggregateDeclaration): AggregateDefinition {
  const name = unquote(agg.name);
  const commands: CommandDefinition[] = [];
  const events: EventDefinition[] = [];
  const valueObjects: ValueObjectDefinition[] = [];
  const invariants: InvariantDefinition[] = [];

  for (const member of agg.members) {
    if (isCommandDeclaration(member)) {
      commands.push(transformCommand(member));
    } else if (isDomainEventDeclaration(member)) {
      events.push(transformEvent(member));
    } else if (isValueObjectDeclaration(member)) {
      valueObjects.push(transformValueObject(member));
    } else if (isInvariantDeclaration(member)) {
      invariants.push(transformInvariant(member));
    }
  }

  return {
    id: `agg-${name}`,
    name,
    identityField: transformFieldDeclaration(agg.identityField),
    commands,
    events,
    valueObjects,
    invariants,
  };
}

function transformCommand(cmd: CommandDeclaration): CommandDefinition {
  return {
    id: `cmd-${cmd.name}`,
    name: cmd.name,
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

function transformEvent(evt: DomainEventDeclaration): EventDefinition {
  return {
    id: `evt-${evt.name}`,
    name: evt.name,
    fields: evt.fields.map(transformFieldDeclaration),
  };
}

function transformValueObject(vo: ValueObjectDeclaration): ValueObjectDefinition {
  return {
    id: `vo-${vo.name}`,
    name: vo.name,
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

function transformInvariant(inv: InvariantDeclaration): InvariantDefinition {
  return {
    id: inv.id,
    description: unquote(inv.description),
    scope: inv.scope,
  };
}

function transformService(svc: DomainServiceDeclaration): DomainServiceDefinition {
  return {
    id: `svc-${svc.name}`,
    name: svc.name,
    consumes: svc.consumes,
    produces: svc.produces,
    description: unquote(svc.description),
  };
}

function transformPolicy(pol: PolicyDeclaration): PolicyDefinition {
  const trigger = pol.trigger.eventName ?? 'file-watcher';
  return {
    id: `pol-${pol.name}`,
    name: pol.name,
    trigger,
    action: unquote(pol.action),
    chainsTo: pol.chainsTo ?? undefined,
  };
}

function transformSaga(saga: SagaDeclaration): SagaDefinition {
  const timeout = saga.timeout.duration ?? 'none';
  return {
    id: `saga-${saga.name}`,
    name: saga.name,
    trigger: saga.trigger,
    states: saga.states,
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

function transformFlow(flow: FlowDeclaration): FlowDefinition {
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
    moments: flow.moments.map((moment, idx) => transformMoment(moment, idx, laneContextMap)),
    connections: extractConnections(flow, laneContextMap),
  };
}

function transformMoment(
  moment: MomentDeclaration,
  index: number,
  laneContextMap?: Map<string, string>,
): MomentDefinition {
  const name = unquote(moment.label);
  const contextEntries: MomentEntry[] = moment.nodes.map((n) =>
    transformNodeToEntry(n, laneContextMap),
  );

  const branches: BranchDefinition[] | undefined =
    moment.whenBlocks.length > 0
      ? moment.whenBlocks.map((wb) => transformWhenBlock(wb, laneContextMap))
      : undefined;

  const hasTerminal = contextEntries.some((e) => e.terminal === true);

  return {
    id: `moment-${index}-${name.replace(/\s+/g, '-')}`,
    name,
    contextEntries,
    branches,
    terminal: hasTerminal || undefined,
  };
}

function transformWhenBlock(
  when: WhenBlock,
  laneContextMap?: Map<string, string>,
): BranchDefinition {
  return {
    condition: when.condition,
    entries: when.nodes.map((n) => transformNodeToEntry(n, laneContextMap)),
  };
}

function transformNodeToEntry(
  node: NodePlacement,
  laneContextMap?: Map<string, string>,
): MomentEntry {
  const contextId = laneContextMap?.get(node.laneId) ?? node.laneId;
  const entry: MomentEntry = {
    contextId,
    nodeName: node.nodeName,
    nodeKind: 'event', // Default — kind resolution requires cross-file context (MMNT-27)
  };

  if (node.multiplicity) {
    entry.multiplicity = node.multiplicity.count ?? node.multiplicity.countVar;
  }

  if (node.modifier?.type === 'optional') {
    entry.optional = true;
  }

  if (node.modifier?.type === 'terminal') {
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

  for (let momentIdx = 0; momentIdx < flow.moments.length; momentIdx++) {
    const moment = flow.moments[momentIdx];
    const momentId = `moment-${momentIdx}-${unquote(moment.label).replace(/\s+/g, '-')}`;

    const processNode = (node: NodePlacement): void => {
      // Context crossing -> crosses-to connection
      if (node.crossing) {
        const contract = transformCrossingToContract(node);
        connections.push({
          id: `conn-${connectionCounter++}`,
          sourceMomentId: momentId,
          targetContextId: resolveCtx(node.crossing.targetLaneId),
          eventId: `evt-${node.nodeName}`,
          connectionType: 'crosses-to',
          schemaContract: contract,
        });
      }

      // Connection annotations
      for (const conn of node.connections) {
        if (isTriggeredBy(conn)) {
          connections.push({
            id: `conn-${connectionCounter++}`,
            sourceMomentId: momentId,
            targetContextId: resolveCtx(node.laneId),
            eventId: `evt-${conn.nodeName}`,
            connectionType: 'triggered-by',
          });
        } else if (isTriggers(conn)) {
          connections.push({
            id: `conn-${connectionCounter++}`,
            sourceMomentId: momentId,
            targetContextId: resolveCtx(node.laneId),
            eventId: `evt-${conn.nodeName}`,
            connectionType: 'triggers',
          });
        } else if (isReturnsTo(conn)) {
          connections.push({
            id: `conn-${connectionCounter++}`,
            sourceMomentId: momentId,
            targetContextId: resolveCtx(node.laneId),
            eventId: `evt-${node.nodeName}`,
            connectionType: 'returns-to',
            targetMomentLabel: unquote(conn.frameLabel),
          });
        }
      }
    };

    for (const node of moment.nodes) {
      processNode(node);
    }

    for (const when of moment.whenBlocks) {
      for (const node of when.nodes) {
        processNode(node);
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
        sourceContextId: rel.source,
        targetContextId: rel.target,
        relationshipType: rel.type,
        contract: unquote(rel.contract),
      });
    }
  }

  return relationships;
}
