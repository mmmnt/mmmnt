import type {
  IntermediateRepresentation,
  EventDefinition,
  ContextDefinition,
} from '@mmmnt/core';

interface CrossingInfo {
  readonly eventName: string;
  readonly eventFields: readonly { readonly name: string; readonly type: string }[];
  readonly producerContext: string;
  readonly consumerContext: string;
}

export function generateAsyncApiSpec(ir: IntermediateRepresentation): string {
  const crossings = collectCrossings(ir);
  const channels = buildChannelYaml(crossings);
  const messages = buildMessageYaml(crossings);

  const title = escapeYaml(ir.metadata.name || 'Untitled');
  const version = escapeYaml(ir.metadata.version || '1.0.0');
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

      const event = findEventById(conn.eventId, ir);
      if (!event) continue;

      const producerCtx = findProducerContext(conn.eventId, ir);
      const consumerCtx = ir.contexts.find((c) => c.id === conn.targetContextId);
      if (!producerCtx || !consumerCtx) continue;

      const key = `${event.name}|${producerCtx.name}|${consumerCtx.name}`;
      if (seen.has(key)) continue;
      seen.add(key);

      crossings.push({
        eventName: event.name,
        eventFields: event.fields.map((f) => ({ name: f.name, type: f.type })),
        producerContext: producerCtx.name,
        consumerContext: consumerCtx.name,
      });
    }
  }

  return crossings;
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

function buildChannelYaml(crossings: readonly CrossingInfo[]): string {
  const lines: string[] = [];
  for (const crossing of crossings) {
    const channelName = toKebabCase(crossing.eventName);
    lines.push(`  ${channelName}:`);
    lines.push(`    address: '${channelName}'`);
    lines.push(`    messages:`);
    lines.push(`      ${crossing.eventName}:`);
    lines.push(`        $ref: '#/components/messages/${crossing.eventName}'`);
    lines.push(`    description: 'Published by ${escapeYaml(crossing.producerContext)}, consumed by ${escapeYaml(crossing.consumerContext)}'`);
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
