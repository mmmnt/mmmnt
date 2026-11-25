import type {
  IntermediateRepresentation,
  EventDefinition,
  ContextDefinition,
  ConnectionDefinition,
} from '@mmmnt/core';
import { emitPayloadSchemas, type JsonSchema } from '@mmmnt/schema';

type CrossingConnection = Extract<ConnectionDefinition, { connectionType: 'crosses-to' }>;

interface CrossingInfo {
  readonly eventName: string;
  /** The event's payload schema from `@mmmnt/schema` (ADR-049 D8), value objects under `$defs`. */
  readonly payload: JsonSchema;
  /** Fields the crossing contract marks [required] — surfaced as AsyncAPI required arrays. */
  readonly requiredFields: readonly string[];
  readonly producerContext: string;
  readonly consumerContext: string;
}

export function generateAsyncApiSpec(ir: IntermediateRepresentation): string {
  const crossings = collectCrossings(ir);
  const channels = buildChannelYaml(crossings);
  const components = buildComponentsYaml(crossings);

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

  if (components.length > 0) {
    parts.push(components);
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

  const subject = event ?? contractEvent(conn, eventName);
  const home = producerCtx ?? ir.contexts.find((c) => c.name === producerName);

  return {
    eventName,
    payload: payloadSchema(subject, home, producerName, ir),
    requiredFields: requiredFields(event, conn),
    producerContext: producerName,
    consumerContext: consumerName(conn, ir),
  };
}

function consumerName(conn: CrossingConnection, ir: IntermediateRepresentation): string {
  const consumerCtx = ir.contexts.find((c) => c.id === conn.targetContextId);
  return consumerCtx?.name ?? conn.targetContextId.replace(/^ctx-/, '');
}

/**
 * The event of a flow-only crossing, read from its SchemaContract: a contract type is written `T` or
 * `T[]`.
 */
function contractEvent(conn: CrossingConnection, eventName: string): EventDefinition {
  return {
    id: conn.eventId,
    name: eventName,
    fields: conn.schemaContract.fields.map((f) => {
      const isArray = f.type.endsWith('[]');
      return {
        name: f.name,
        type: isArray ? f.type.slice(0, -2) : f.type,
        isArray,
        required: f.required,
      };
    }),
  };
}

/**
 * The payload schema of one event, from `@mmmnt/schema` (ADR-049 D8), so AsyncAPI and `moment schema
 * emit` type a field the same way. The emitter is given the model with this event as the only event of
 * its context: a value object then resolves in that context first, then in any other, as it does there.
 */
function payloadSchema(
  event: EventDefinition,
  home: ContextDefinition | undefined,
  producerName: string,
  ir: IntermediateRepresentation,
): JsonSchema {
  const contexts: ContextDefinition[] = ir.contexts.map((c) => ({
    ...c,
    events: c === home ? [event] : [],
  }));
  if (home === undefined) contexts.unshift(contextOf(producerName, event));
  return emitPayloadSchemas({ ...ir, contexts }).schemas[event.name];
}

/** A context that declares nothing but the event: the producer of a flow-only crossing. */
function contextOf(name: string, event: EventDefinition): ContextDefinition {
  return {
    id: `ctx-${name}`,
    name,
    aggregates: [],
    domainServices: [],
    commands: [],
    events: [event],
    policies: [],
    sagas: [],
    valueObjects: [],
    invariants: [],
  };
}

/** Audit fix #8: [required] markers from the crossing contract surface as AsyncAPI required arrays;
 *  fall back to event field flags when the contract declares no required field. */
function requiredFields(
  event: EventDefinition | undefined,
  conn: CrossingConnection,
): readonly string[] {
  const contractRequired = conn.schemaContract.fields.filter((f) => f.required).map((f) => f.name);
  if (contractRequired.length > 0) return contractRequired;
  return event?.fields.filter((f) => f.required).map((f) => f.name) ?? [];
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

/**
 * `components.messages`, one per crossing event, and `components.schemas`, one per value object a
 * payload reaches. A value object name that two payloads resolve to different schemas (a name declared
 * in two contexts) is kept apart: that payload's value objects are named `<Event>.<Name>`.
 */
function buildComponentsYaml(crossings: readonly CrossingInfo[]): string {
  const messages: Record<string, YamlValue> = {};
  const schemas = new Map<string, JsonSchema>();
  const declared = new Map<string, string>();

  for (const crossing of crossings) {
    if (Object.hasOwn(messages, crossing.eventName)) continue;

    const defs = Object.entries(crossing.payload.$defs ?? {});
    const shared = defs.every(([name, def]) => {
      const seen = declared.get(name);
      return seen === undefined || seen === JSON.stringify(def);
    });
    const names = new Map(
      defs.map(([name]) => [name, shared ? name : `${crossing.eventName}.${name}`]),
    );
    for (const [name, def] of defs) {
      const component = names.get(name) as string;
      if (schemas.has(component)) continue;
      declared.set(component, JSON.stringify(def));
      schemas.set(component, toComponent(def, names));
    }

    messages[crossing.eventName] = {
      name: crossing.eventName,
      payload: messagePayload(crossing, names) as YamlValue,
    };
  }

  if (Object.keys(messages).length === 0) return '';
  const components: Record<string, YamlValue> = { messages };
  if (schemas.size > 0) {
    const sorted = [...schemas.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    components.schemas = Object.fromEntries(sorted) as YamlValue;
  }
  const lines: string[] = [];
  writeYaml({ components }, 0, lines);
  return lines.join('\n');
}

/**
 * The message payload: the event's closed object, with the crossing's required list. The object is
 * closed, so a required name the event does not declare could never be met: it is left out.
 */
function messagePayload(crossing: CrossingInfo, names: ReadonlyMap<string, string>): JsonSchema {
  const body = toComponent(crossing.payload, names);
  // An event schema is always an object with properties (`objectSchema` of @mmmnt/schema).
  const properties = body.properties as Record<string, JsonSchema>;
  const required = crossing.requiredFields.filter((name) => Object.hasOwn(properties, name));
  return {
    type: body.type,
    additionalProperties: body.additionalProperties,
    properties,
    ...(required.length > 0 ? { required } : {}),
    ...(body.oneOf !== undefined ? { oneOf: body.oneOf } : {}),
    ...(body.allOf !== undefined ? { allOf: body.allOf } : {}),
  };
}

/**
 * A JSON Schema of `@mmmnt/schema` as an AsyncAPI Schema Object (a superset of draft 07): `#/$defs/V`
 * points at `#/components/schemas/V`, `$schema`, `title` and `$defs` are dropped, and a `$ref` with
 * siblings (a pattern or a deprecation on a value object field) is written `allOf: [{$ref}]` beside
 * them, because draft 07 ignores the siblings of a `$ref`.
 */
function toComponent(schema: JsonSchema, names: ReadonlyMap<string, string>): JsonSchema {
  const sub = (s: JsonSchema): JsonSchema => toComponent(s, names);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema)) {
    if (DROPPED.has(key)) continue;
    out[key] = convertKeyword(key, value, sub, names);
  }
  const converted = out as JsonSchema;
  if (converted.$ref !== undefined && Object.keys(converted).length > 1) {
    const { $ref, ...siblings } = converted;
    return { allOf: [{ $ref }], ...siblings };
  }
  return converted;
}

/** Keywords of `@mmmnt/schema` an AsyncAPI payload does not carry. */
const DROPPED = new Set(['$schema', 'title', '$defs']);

/** One keyword's value: a subschema is converted, a `$ref` repointed, any other value kept. */
function convertKeyword(
  key: string,
  value: unknown,
  sub: (s: JsonSchema) => JsonSchema,
  names: ReadonlyMap<string, string>,
): unknown {
  switch (key) {
    case '$ref': {
      const name = (value as string).replace(/^#\/\$defs\//, '');
      return `#/components/schemas/${names.get(name) ?? name}`;
    }
    case 'properties':
      return Object.fromEntries(
        Object.entries(value as Record<string, JsonSchema>).map(([k, v]) => [k, sub(v)]),
      );
    case 'items':
      return sub(value as JsonSchema);
    case 'additionalProperties':
      return typeof value === 'object' ? sub(value as JsonSchema) : value;
    case 'oneOf':
    case 'allOf':
      return (value as JsonSchema[]).map(sub);
    default:
      return value;
  }
}

type YamlValue = string | number | boolean | undefined | YamlValue[] | { [key: string]: YamlValue };

function isMapping(value: YamlValue): value is { [key: string]: YamlValue } {
  return typeof value === 'object' && !Array.isArray(value);
}

/** Block-style YAML of a mapping, in insertion order. A string is single-quoted; an undefined value is skipped. */
function writeYaml(mapping: { [key: string]: YamlValue }, indent: number, out: string[]): void {
  const pad = ' '.repeat(indent);
  for (const [key, value] of Object.entries(mapping)) {
    if (value === undefined) continue;
    const head = `${pad}${yamlKey(key)}:`;
    if (Array.isArray(value)) {
      // A schema never holds an empty list: `required` and `enum` are written only when non-empty.
      out.push(head);
      for (const item of value) writeYamlItem(item, indent + 2, out);
    } else if (isMapping(value)) {
      if (Object.keys(value).length === 0) {
        out.push(`${head} {}`);
        continue;
      }
      out.push(head);
      writeYaml(value, indent + 2, out);
    } else {
      out.push(`${head} ${yamlScalar(value)}`);
    }
  }
}

/**
 * One block sequence item: a scalar (`required`, `enum`) or a non-empty schema (`oneOf`, `allOf`). A
 * mapping starts on the `- ` line, its keys aligned after it. A schema never nests a list in a list.
 */
function writeYamlItem(item: YamlValue, indent: number, out: string[]): void {
  const pad = ' '.repeat(indent);
  if (item !== undefined && isMapping(item)) {
    const inner: string[] = [];
    writeYaml(item, indent + 2, inner);
    inner[0] = `${pad}- ${inner[0].slice(indent + 2)}`;
    out.push(...inner);
  } else {
    out.push(`${pad}- ${yamlScalar(item as string | number | boolean)}`);
  }
}

function yamlScalar(value: string | number | boolean): string {
  return typeof value === 'string' ? `'${escapeYaml(value)}'` : String(value);
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

/**
 * A field name as a YAML key or list item. A Moment name is identifier-shaped, so it is a plain scalar
 * unless YAML would resolve it as a boolean or a null: YAML 1.1 reads `on`, `off`, `yes`, `no`, `y` and `n`
 * as booleans, and both versions read `true`, `false` and `null`. `on` is a Moment keyword, and a field
 * may be named with one (ADR-051). Such a name is single-quoted; every other name is written as before.
 */
const YAML_NON_STRING = /^(?:y|n|yes|no|on|off|true|false|null)$/i;

function yamlKey(name: string): string {
  return YAML_NON_STRING.test(name) ? `'${escapeYaml(name)}'` : name;
}
