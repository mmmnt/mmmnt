/**
 * ADR-049 D8 — one closed JSON Schema (draft 2020-12) per event payload, from the IR alone.
 *
 * Every object is closed (`additionalProperties: false`). A value object an event reaches is emitted once,
 * under its name in `$defs`, and referenced by `$ref`. A type that is neither built in nor a declared value
 * object is a diagnostic, never an open schema.
 */
import type {
  ContextDefinition,
  EventDefinition,
  FieldDefinition,
  IntermediateRepresentation,
  ValueObjectDefinition,
} from '@mmmnt/core';

/** The subset of JSON Schema this emitter writes. */
export interface JsonSchema {
  $schema?: string;
  title?: string;
  description?: string;
  type?: 'object' | 'array' | 'string' | 'number' | 'boolean';
  format?: string;
  enum?: string[];
  const?: string;
  pattern?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean | JsonSchema;
  items?: JsonSchema;
  oneOf?: JsonSchema[];
  allOf?: JsonSchema[];
  $ref?: string;
  $defs?: Record<string, JsonSchema>;
  deprecated?: true;
  'x-encrypted'?: true;
  'x-key'?: string;
}

export interface PayloadSchemaDiagnostic {
  readonly event: string;
  readonly message: string;
}

export interface PayloadSchemas {
  /** By event name, in declaration order. */
  readonly schemas: Record<string, JsonSchema>;
  readonly diagnostics: readonly PayloadSchemaDiagnostic[];
}

const DIALECT = 'https://json-schema.org/draft/2020-12/schema';

/** The discriminator of a tagged union (ADR-049 D3). */
export const UNION_TAG = 'kind';

const BUILT_IN: Record<string, JsonSchema> = {
  string: { type: 'string' },
  number: { type: 'number' },
  boolean: { type: 'boolean' },
  UUID: { type: 'string', format: 'uuid' },
  DateTime: { type: 'string', format: 'date-time' },
  Date: { type: 'string', format: 'date' },
  Money: { type: 'number' },
};

/** The recorded form of an `[encrypted]` field (ADR-049 D7, Sift founder ruling f93ebffc). */
const ENCRYPTED: JsonSchema = {
  'x-encrypted': true,
  type: 'object',
  additionalProperties: false,
  required: ['dataKeyId', 'ciphertext'],
  properties: { dataKeyId: { type: 'string' }, ciphertext: { type: 'string' } },
};

interface Scope {
  readonly context: ContextDefinition;
  readonly ir: IntermediateRepresentation;
  readonly defs: Map<string, JsonSchema>;
  readonly where: string;
  readonly report: (message: string) => void;
}

/** A value object by name: the event's own context first, then any context of the model. */
function findValueObject(scope: Scope, name: string): ValueObjectDefinition | undefined {
  const own = scope.context.valueObjects.find((v) => v.name === name);
  if (own) return own;
  for (const ctx of scope.ir.contexts) {
    const vo = ctx.valueObjects.find((v) => v.name === name);
    if (vo) return vo;
  }
  return undefined;
}

/** The schema of one value of the field's type, before `[]`, `{}` and `[encrypted]`. */
function itemSchema(field: FieldDefinition, scope: Scope): JsonSchema {
  let base: JsonSchema;
  if (field.enum !== undefined) {
    base = { type: 'string', enum: [...field.enum] };
  } else if (BUILT_IN[field.type] !== undefined) {
    base = { ...BUILT_IN[field.type] };
  } else {
    const vo = findValueObject(scope, field.type);
    if (vo === undefined) {
      scope.report(
        `${scope.where}: field '${field.name}' has type '${field.type}', which is not declared.`,
      );
      return {};
    }
    defineValueObject(vo, scope);
    base = { $ref: `#/$defs/${vo.name}` };
  }
  if (field.pattern !== undefined) {
    // A pattern on a reference applies to the referenced string; JSON Schema allows siblings of $ref.
    base = { ...base, pattern: field.pattern };
  }
  return base;
}

function fieldSchema(field: FieldDefinition, scope: Scope): JsonSchema {
  if (field.encrypted) {
    return { ...ENCRYPTED, ...(field.deprecated ? { deprecated: true as const } : {}) };
  }
  const item = itemSchema(field, scope);
  let schema: JsonSchema;
  if (field.isArray) {
    schema = { type: 'array', items: item };
  } else if (field.map !== undefined) {
    schema = {
      type: 'object',
      additionalProperties: item,
      ...(field.map.key !== undefined ? { 'x-key': field.map.key } : {}),
    };
  } else {
    schema = item;
  }
  if (field.deprecated) schema = { ...schema, deprecated: true };
  return schema;
}

/** `oneOf: [{required: [a]}, {required: [b]}]` per exclusive group (ADR-049 D5), in declared order. */
function exclusiveGroups(fields: FieldDefinition[]): JsonSchema[] {
  const groups: JsonSchema[] = [];
  const seen = new Set<string>();
  for (const f of fields) {
    if (f.exclusive === undefined) continue;
    const key = f.exclusive.join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    groups.push({ oneOf: f.exclusive.map((name) => ({ required: [name] })) });
  }
  return groups;
}

/** A closed object of the fields, with `prefix` properties (a union's tag) first. */
function objectSchema(
  fields: FieldDefinition[],
  scope: Scope,
  prefix: Record<string, JsonSchema> = {},
): JsonSchema {
  const properties: Record<string, JsonSchema> = { ...prefix };
  for (const f of fields) properties[f.name] = fieldSchema(f, scope);
  const required = [...Object.keys(prefix), ...fields.filter((f) => f.required).map((f) => f.name)];
  const schema: JsonSchema = {
    type: 'object',
    additionalProperties: false,
    ...(required.length > 0 ? { required } : {}),
    properties,
  };
  const groups = exclusiveGroups(fields);
  if (groups.length === 1) schema.oneOf = groups[0].oneOf;
  if (groups.length > 1) schema.allOf = groups;
  return schema;
}

function defineValueObject(vo: ValueObjectDefinition, scope: Scope): void {
  if (scope.defs.has(vo.name)) return;
  // Reserve the name first, so a value object that reaches itself is emitted once.
  scope.defs.set(vo.name, {});
  const inner: Scope = { ...scope, where: `Value object '${vo.name}'` };
  let schema: JsonSchema;
  if (vo.scalar !== undefined) {
    schema = fieldSchema(vo.scalar, inner);
  } else if (vo.variants !== undefined && vo.variants.length > 0) {
    schema = {
      oneOf: vo.variants.map((variant) =>
        objectSchema([...vo.fields, ...variant.fields], inner, {
          [UNION_TAG]: { const: variant.name },
        }),
      ),
    };
  } else {
    schema = objectSchema(vo.fields, inner);
  }
  scope.defs.set(vo.name, schema);
}

function eventSchema(
  event: EventDefinition,
  context: ContextDefinition,
  ir: IntermediateRepresentation,
  report: (message: string) => void,
): JsonSchema {
  const defs = new Map<string, JsonSchema>();
  const scope: Scope = { context, ir, defs, where: `Event '${event.name}'`, report };
  const body = objectSchema(event.fields, scope);
  const sortedDefs = [...defs.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return {
    $schema: DIALECT,
    title: event.name,
    ...body,
    ...(sortedDefs.length > 0 ? { $defs: Object.fromEntries(sortedDefs) } : {}),
  };
}

/** One closed JSON Schema per declared event (aggregate and process events), in declaration order. */
export function emitPayloadSchemas(ir: IntermediateRepresentation): PayloadSchemas {
  const schemas: Record<string, JsonSchema> = {};
  const diagnostics: PayloadSchemaDiagnostic[] = [];
  for (const context of ir.contexts) {
    for (const event of context.events) {
      const report = (message: string) => diagnostics.push({ event: event.name, message });
      if (Object.hasOwn(schemas, event.name)) {
        report(`Event '${event.name}' is declared more than once; its schema is the first one.`);
        continue;
      }
      schemas[event.name] = eventSchema(event, context, ir, report);
    }
  }
  return { schemas, diagnostics };
}
