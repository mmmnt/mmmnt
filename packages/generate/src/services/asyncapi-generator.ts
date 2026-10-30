import type {
  IntermediateRepresentation,
  EventDefinition,
  ContextDefinition,
  ConnectionDefinition,
} from '@mmmnt/core';

type CrossingConnection = Extract<ConnectionDefinition, { connectionType: 'crosses-to' }>;

interface CrossingInfo {
  readonly eventName: string;
  readonly eventFields: readonly {
    readonly name: string;
    readonly type: string;
    readonly deprecated?: boolean;
  }[];
  /** Fields the crossing contract marks [required] — surfaced as AsyncAPI required arrays. */
  readonly requiredFields: readonly string[];
  readonly producerContext: string;
  readonly consumerContext: string;
}

export function generateAsyncApiSpec(ir: IntermediateRepresentation): string {
  const crossings = collectCrossings(ir);
  const channels = buildChannelYaml(crossings);
  const messages = buildMessageYaml(crossings);

  // Audit fix #8: honest fallbacks — 'Moment Specification' when the spec has
  // no name, '1.0.0' when the version is missing or the '0.0.0' placeholder.
  const title = escapeYaml(ir.metadata.name || 'Moment Specification');
  const rawVersion = ir.metadata.version;
  const version = escapeYaml(!rawVersion || rawVersion === '0.0.0' ? '1.0.0' : rawVersion);
  const description = escapeYaml(ir.metadata.description || '');

  const parts: string[] = [];
  parts.push(`asyncapi: '3.0.0'`);
  parts.push(`info:`);
  parts.push(`  title: '${title}'`);
  parts.push(`  version: '${version}'`);
  parts.push(`  description: '${description}'`);
  parts.push('');

  if (channels.length > 0) {
    parts.push('channels:');
    parts.push(channels);
    parts.push('');
  }

  if (messages.length > 0) {
    parts.push('components:');
    parts.push('  messages:');
    parts.push(messages);
  }

  return parts.join('\n') + '\n';
}

function collectCrossings(ir: IntermediateRepresentation): CrossingInfo[] {
  const crossings: CrossingInfo[] = [];
  const seen = new Set<string>();

  for (const flow of ir.flows) {
    for (const conn of flow.connections) {
      if (conn.connectionType !== 'crosses-to') continue;

      const info = crossingFromConnection(conn, flow, ir);
      if (!info) continue;

      const key = `${info.eventName}|${info.producerContext}|${info.consumerContext}`;
      if (seen.has(key)) continue;
      seen.add(key);

      crossings.push(info);
    }
  }

  return crossings;
}

/** Resolve one crosses-to connection into a CrossingInfo; undefined — no
 *  fabrication — when the event name or producer context cannot be resolved. */
function crossingFromConnection(
  conn: CrossingConnection,
  flow: IntermediateRepresentation['flows'][number],
  ir: IntermediateRepresentation,
): CrossingInfo | undefined {
  // Audit fix #3: flow-only specs declare no context events — the crossing
  // SchemaContract is then the payload schema source.
  const event = findEventById(conn.eventId, ir);
  const eventName = event?.name ?? conn.schemaContract.eventType;
  if (!eventName) return undefined;

  const producerCtx = findProducerContext(conn.eventId, ir);
  const producerName =
    producerCtx?.name ?? findProducingEntryContext(eventName, conn.sourceMomentId, flow, ir);
  if (!producerName) return undefined;

  const consumerCtx = ir.contexts.find((c) => c.id === conn.targetContextId);
  const consumerName = consumerCtx?.name ?? conn.targetContextId.replace(/^ctx-/, '');

  const { eventFields, requiredFields } = crossingSchema(event, conn);

  return {
    eventName,
    eventFields,
    requiredFields,
    producerContext: producerName,
    consumerContext: consumerName,
  };
}

/** Payload fields and required markers for one crossing: context event fields
 *  when declared, else the crossing SchemaContract (flow-only fallback). */
function crossingSchema(
  event: EventDefinition | undefined,
  conn: CrossingConnection,
): { eventFields: CrossingInfo['eventFields']; requiredFields: CrossingInfo['requiredFields'] } {
  const eventFields = event
    ? event.fields.map((f) => ({
        name: f.name,
        type: f.type,
        deprecated: f.deprecated ? true : undefined,
      }))
    : conn.schemaContract.fields.map((f) => ({
        name: f.name,
        type: f.type,
        deprecated: undefined,
      }));

  // Audit fix #8: [required] markers from the crossing contract surface as
  // AsyncAPI required arrays; fall back to event field flags when the
  // contract declares no fields.
  const contractRequired = conn.schemaContract.fields.filter((f) => f.required).map((f) => f.name);
  const requiredFields =
    contractRequired.length > 0
      ? contractRequired
      : (event?.fields.filter((f) => f.required).map((f) => f.name) ?? []);

  return { eventFields, requiredFields };
}

/**
 * Resolve the context of the flow entry that produces `eventName` in the
 * crossing's source moment (flow-only fallback). Returns undefined — no
 * fabrication — when no entry matches.
 */
function findProducingEntryContext(
  eventName: string,
  sourceMomentId: string,
  flow: IntermediateRepresentation['flows'][number],
  ir: IntermediateRepresentation,
): string | undefined {
  const moment = flow.moments.find((m) => m.id === sourceMomentId);
  if (!moment) return undefined;
  const entries = [...moment.contextEntries, ...(moment.branches ?? []).flatMap((b) => b.entries)];
  const producing = entries.find((e) => e.nodeName === eventName);
  if (!producing) return undefined;
  const ctx = ir.contexts.find((c) => c.id === producing.contextId);
  return ctx?.name ?? producing.contextId.replace(/^ctx-/, '');
}

function findEventById(
  eventId: string,
  ir: IntermediateRepresentation,
): EventDefinition | undefined {
  for (const ctx of ir.contexts) {
    for (const evt of ctx.events) {
      if (evt.id === eventId) return evt;
    }
    for (const agg of ctx.aggregates) {
      for (const evt of agg.events) {
        if (evt.id === eventId) return evt;
      }
    }
  }
  return undefined;
}

function findProducerContext(
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

// Audit fix #4: one channel per event — duplicate YAML mapping keys are
// invalid. Multiple consumers (and producers) merge into a single channel
// description.
function buildChannelYaml(crossings: readonly CrossingInfo[]): string {
  const byEvent = new Map<string, { producers: string[]; consumers: string[] }>();
  for (const crossing of crossings) {
    let group = byEvent.get(crossing.eventName);
    if (!group) {
      group = { producers: [], consumers: [] };
      byEvent.set(crossing.eventName, group);
    }
    if (!group.producers.includes(crossing.producerContext)) {
      group.producers.push(crossing.producerContext);
    }
    if (!group.consumers.includes(crossing.consumerContext)) {
      group.consumers.push(crossing.consumerContext);
    }
  }

  const lines: string[] = [];
  for (const [eventName, group] of byEvent) {
    const channelName = toKebabCase(eventName);
    const producers = group.producers.map(escapeYaml).join(', ');
    const consumers = group.consumers.map(escapeYaml).join(', ');
    lines.push(`  ${channelName}:`);
    lines.push(`    address: '${channelName}'`);
    lines.push(`    messages:`);
    lines.push(`      ${eventName}:`);
    lines.push(`        $ref: '#/components/messages/${eventName}'`);
    lines.push(`    description: 'Published by ${producers}, consumed by ${consumers}'`);
  }
  return lines.join('\n');
}

function buildMessageYaml(crossings: readonly CrossingInfo[]): string {
  const lines: string[] = [];
  const seen = new Set<string>();

  for (const crossing of crossings) {
    if (seen.has(crossing.eventName)) continue;
    seen.add(crossing.eventName);

    lines.push(`    ${crossing.eventName}:`);
    lines.push(`      name: '${escapeYaml(crossing.eventName)}'`);
    lines.push(`      payload:`);
    lines.push(`        type: object`);
    lines.push(`        properties:`);

    for (const field of crossing.eventFields) {
      lines.push(`          ${field.name}:`);
      lines.push(`            type: '${mapAsyncApiType(field.type)}'`);
      if (field.deprecated) {
        lines.push(`            deprecated: true`);
      }
    }

    // Audit fix #8: [required] markers surface as an AsyncAPI required array.
    if (crossing.requiredFields.length > 0) {
      lines.push(`        required:`);
      for (const name of crossing.requiredFields) {
        lines.push(`          - ${name}`);
      }
    }
  }

  return lines.join('\n');
}

function mapAsyncApiType(momentType: string): string {
  const typeMap: Record<string, string> = {
    string: 'string',
    number: 'number',
    boolean: 'boolean',
    date: 'string',
    uuid: 'string',
    int: 'integer',
    float: 'number',
    decimal: 'number',
  };
  return typeMap[momentType.toLowerCase()] ?? 'string';
}

function toKebabCase(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/\s+/g, '-')
    .toLowerCase();
}

function escapeYaml(value: string): string {
  return value.replace(/'/g, "''");
}
