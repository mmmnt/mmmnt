import type {
  IntermediateRepresentation,
  ContextDefinition,
  AggregateDefinition,
  EventDefinition,
  CommandDefinition,
} from '@mmmnt/core';

export interface EventCatalogEntry {
  readonly eventName: string;
  readonly schema: {
    readonly fields: readonly { name: string; type: string; isArray: boolean }[];
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
  readonly temporalLocation:
    | { readonly moment: string; readonly momentIndex: number }
    | undefined;
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

  return {
    events: entries,
    metadata: {
      generatedAt: new Date().toISOString(),
      totalEvents: entries.length,
    },
  };
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
    schema: {
      fields: event.fields.map((f) => ({
        name: f.name,
        type: f.type,
        isArray: f.isArray,
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
      const key = `${targetCtx.name}|${conn.connectionType}`;
      if (seen.has(key)) continue;
      seen.add(key);
      consumers.push({
        context: targetCtx.name,
        relationshipType: conn.connectionType,
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
      for (const entry of moment.contextEntries) {
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
