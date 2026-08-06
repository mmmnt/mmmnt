import type {
  IntermediateRepresentation,
  ContextDefinition,
  AggregateDefinition,
  EventDefinition,
  MomentEntry,
  MomentDefinition,
  FlowDefinition,
  ConnectionDefinition,
} from '@mmmnt/core';
import { orderedMomentChildren } from './moment-children.js';

type CrossingConnection = Extract<ConnectionDefinition, { connectionType: 'crosses-to' }>;

export interface EventCatalogEntry {
  readonly eventName: string;
  /** Node kind: 'event' for context-derived entries; flow-derived entries carry their nodeKind. */
  readonly kind: string;
  readonly schema: {
    readonly fields: readonly {
      name: string;
      type: string;
      isArray: boolean;
      deprecated?: { reason: string; replacement: string };
    }[];
  };
  readonly producer: {
    readonly context: string;
    readonly aggregate: string;
    readonly command: string;
  };
  readonly consumers: readonly {
    readonly context: string;
    readonly relationshipType: string;
  }[];
  readonly temporalLocation: { readonly moment: string; readonly momentIndex: number } | undefined;
}

export interface EventCatalog {
  readonly events: readonly EventCatalogEntry[];
  readonly metadata: { readonly generatedAt: string; readonly totalEvents: number };
}

export function generateEventCatalog(ir: IntermediateRepresentation): EventCatalog {
  const entries: EventCatalogEntry[] = [];

  for (const context of ir.contexts) {
    for (const aggregate of context.aggregates) {
      for (const event of aggregate.events) {
        const entry = buildCatalogEntry(event, aggregate, context, ir);
        entries.push(entry);
      }
    }
  }

  // Audit fix #3: flow-only specs (or flows referencing nodes the contexts
  // don't declare) must still produce a catalog. Every flow node that has no
  // context-derived entry becomes a catalog entry; crossing SchemaContracts
  // provide payload schemas.
  addFlowFallbackEntries(ir, entries);

  return {
    events: entries,
    metadata: {
      generatedAt: new Date().toISOString(),
      totalEvents: entries.length,
    },
  };
}

// ---------------------------------------------------------------------------
// Flow-derived fallback entries (audit fix #3)
// ---------------------------------------------------------------------------

function allMomentEntries(
  flow: FlowDefinition,
): { entry: MomentEntry; momentName: string; momentIndex: number }[] {
  const out: { entry: MomentEntry; momentName: string; momentIndex: number }[] = [];
  for (let i = 0; i < flow.moments.length; i++) {
    const moment = flow.moments[i];
    // Sequence-aware (M-S12): entries in the moment's textual child order.
    for (const entry of entriesInSequenceOrder(moment)) {
      out.push({ entry, momentName: moment.name, momentIndex: i });
    }
  }
  return out;
}

/** A moment's entries (main + branch) flattened in textual child order. */
function entriesInSequenceOrder(moment: MomentDefinition): MomentEntry[] {
  const entries: MomentEntry[] = [];
  for (const child of orderedMomentChildren(moment, 'entries-first')) {
    if (child.kind === 'entry') {
      entries.push(child.entry);
    } else {
      entries.push(...child.branch.entries);
    }
  }
  return entries;
}

/** Resolve a contextId to its human name; strip the ctx- prefix when unknown. */
function contextDisplayName(contextId: string, ir: IntermediateRepresentation): string {
  const ctx = ir.contexts.find((c) => c.id === contextId);
  return ctx?.name ?? contextId.replace(/^ctx-/, '');
}

function addFlowFallbackEntries(
  ir: IntermediateRepresentation,
  entries: EventCatalogEntry[],
): void {
  const known = new Set(entries.map((e) => e.eventName));

  for (const flow of ir.flows) {
    for (const { entry, momentName, momentIndex } of allMomentEntries(flow)) {
      if (known.has(entry.nodeName)) continue;
      known.add(entry.nodeName);
      entries.push(buildFlowEntry(entry, momentName, momentIndex, ir));
    }
  }
}

function buildFlowEntry(
  entry: MomentEntry,
  momentName: string,
  momentIndex: number,
  ir: IntermediateRepresentation,
): EventCatalogEntry {
  // Crossing schema contracts are the only payload schema source in
  // flow-only specs.
  const contractFields: EventCatalogEntry['schema']['fields'][number][] = [];
  const consumers: { context: string; relationshipType: string }[] = [];
  const seenConsumers = new Set<string>();
  let producerCommand = '';

  for (const flow of ir.flows) {
    for (const conn of flow.connections) {
      const connEventName = conn.eventId.replace(/^evt-/, '');
      if (conn.connectionType === 'crosses-to' && connEventName === entry.nodeName) {
        recordCrossingConsumer(conn, ir, contractFields, consumers, seenConsumers);
      }
      // A `triggers` edge whose target is this node names the producer.
      if (
        conn.connectionType === 'triggers' &&
        conn.targetNodeName === entry.nodeName &&
        conn.sourceNodeName &&
        producerCommand === ''
      ) {
        producerCommand = conn.sourceNodeName;
      }
    }
  }

  return {
    eventName: entry.nodeName,
    kind: entry.nodeKind,
    schema: { fields: contractFields },
    producer: {
      context: contextDisplayName(entry.contextId, ir),
      aggregate: '',
      command: producerCommand,
    },
    consumers,
    temporalLocation: { moment: momentName, momentIndex },
  };
}

/** Record a crossing's schema contract fields (first crossing wins) and its
 *  consuming context, deduped by consumer+relationship. */
function recordCrossingConsumer(
  conn: CrossingConnection,
  ir: IntermediateRepresentation,
  contractFields: EventCatalogEntry['schema']['fields'][number][],
  consumers: { context: string; relationshipType: string }[],
  seenConsumers: Set<string>,
): void {
  if (contractFields.length === 0) {
    for (const f of conn.schemaContract.fields) {
      contractFields.push({ name: f.name, type: f.type, isArray: false });
    }
  }
  const consumerName = contextDisplayName(conn.targetContextId, ir);
  const key = `${consumerName}|${conn.schemaContract.relationshipType}`;
  if (!seenConsumers.has(key)) {
    seenConsumers.add(key);
    consumers.push({
      context: consumerName,
      relationshipType: conn.schemaContract.relationshipType,
    });
  }
}

function buildCatalogEntry(
  event: EventDefinition,
  aggregate: AggregateDefinition,
  context: ContextDefinition,
  ir: IntermediateRepresentation,
): EventCatalogEntry {
  const producer = findProducerCommand(event, aggregate, context);
  const consumers = findConsumers(event, ir);
  const temporalLocation = findTemporalLocation(event, ir);

  return {
    eventName: event.name,
    kind: 'event',
    schema: {
      fields: event.fields.map((f) => ({
        name: f.name,
        type: f.type,
        isArray: f.isArray,
        deprecated: f.deprecated,
      })),
    },
    producer,
    consumers,
    temporalLocation,
  };
}

function findProducerCommand(
  event: EventDefinition,
  aggregate: AggregateDefinition,
  context: ContextDefinition,
): EventCatalogEntry['producer'] {
  const command = aggregate.commands.find((c) => c.emitsEvent === event.name);
  return {
    context: context.name,
    aggregate: aggregate.name,
    command: command?.name ?? '',
  };
}

function findConsumers(
  event: EventDefinition,
  ir: IntermediateRepresentation,
): readonly { readonly context: string; readonly relationshipType: string }[] {
  const consumers: { readonly context: string; readonly relationshipType: string }[] = [];
  const seen = new Set<string>();

  for (const flow of ir.flows) {
    for (const conn of flow.connections) {
      if (conn.eventId !== event.id) continue;
      if (conn.connectionType !== 'crosses-to') continue;
      const targetCtx = ir.contexts.find((c) => c.id === conn.targetContextId);
      if (!targetCtx) continue;
      // Audit fix #6: relationshipType is the contract's relationship type
      // (e.g. 'CustomerSupplier'), matching the topology — not 'crosses-to'.
      const relationshipType = conn.schemaContract.relationshipType;
      const key = `${targetCtx.name}|${relationshipType}`;
      if (seen.has(key)) continue;
      seen.add(key);
      consumers.push({
        context: targetCtx.name,
        relationshipType,
      });
    }
  }

  return consumers;
}

function findTemporalLocation(
  event: EventDefinition,
  ir: IntermediateRepresentation,
): { readonly moment: string; readonly momentIndex: number } | undefined {
  for (const flow of ir.flows) {
    for (let i = 0; i < flow.moments.length; i++) {
      const moment = flow.moments[i];
      // Audit fix #6: scan branch entries too, so branch-produced events get
      // their true moment. Sequence-aware (M-S12): textual child order.
      for (const entry of entriesInSequenceOrder(moment)) {
        if (entry.nodeKind === 'event' && entry.nodeName === event.name) {
          return { moment: moment.name, momentIndex: i };
        }
      }
    }
    // Also check connections referencing this event
    for (const conn of flow.connections) {
      if (conn.eventId !== event.id) continue;
      const momentIdx = flow.moments.findIndex((m) => m.id === conn.sourceMomentId);
      if (momentIdx >= 0) {
        return { moment: flow.moments[momentIdx].name, momentIndex: momentIdx };
      }
    }
  }

  return undefined;
}
