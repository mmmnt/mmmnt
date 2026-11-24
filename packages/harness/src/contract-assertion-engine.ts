import type {
  FieldDefinition,
  IntermediateRepresentation,
  SchemaContract,
  SchemaFieldDefinition,
  ValueObjectDefinition,
} from '@mmmnt/core';
import type { ContractValidationResult, ContractViolation } from './types/index.js';

/** A UUID in its canonical text form, as JSON Schema's `format: uuid` reads it (RFC 9562). */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** `format: date` (RFC 3339 full-date). */
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
/** `format: date-time` (RFC 3339 date-time): a full date, `T`, a time and an offset. */
const DATE_TIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})[Tt]([01]\d|2[0-3]):([0-5]\d):([0-5]\d|60)(\.\d+)?([Zz]|[+-]([01]\d|2[0-3]):[0-5]\d)$/;

/** The discriminator of a tagged union value object (ADR-049 D3). */
const UNION_TAG = 'kind';

/**
 * ContractAssertionEngine validates event payloads against IR schema contracts.
 * Covers all required fields (TE-02) and returns ContractValidationResult with violation details.
 *
 * A value is checked against its Moment type as `@mmmnt/schema` maps it to JSON Schema (ADR-049 D8)
 * and as `@mmmnt/derive` samples it: `string`, `number` and `boolean` are those JSON types, `UUID`,
 * `DateTime` and `Date` are strings of that format, `Money` is a number, `T[]` is an array of `T`,
 * and a value object is an object. Given the IR, a value object is checked as declared: its fields,
 * a scalar value object as its scalar, a union by its `kind`, and a code set by its values.
 *
 * Infrastructure-agnostic (Design Principle #6).
 */
export class ContractAssertionEngine {
  constructor(private readonly ir?: IntermediateRepresentation) {}

  validate(
    crossingId: string,
    payload: Readonly<Record<string, unknown>>,
    contract: SchemaContract,
  ): ContractValidationResult {
    const violations: ContractViolation[] = [];

    for (const field of contract.fields) {
      const value = payload[field.name];

      if (isAbsent(value)) {
        if (field.required) violations.push(missing(field.name, field.type));
        continue;
      }

      const { type, isArray } = splitArray(field.type);
      this.checkValue(value, { type, isArray }, field.name, violations);
    }

    return {
      crossingId,
      valid: violations.length === 0,
      violations,
    };
  }

  validateAll(
    crossingId: string,
    payload: Readonly<Record<string, unknown>>,
    contract: SchemaContract,
  ): ContractValidationResult {
    return this.validate(crossingId, payload, contract);
  }

  coversAllRequiredFields(
    payload: Readonly<Record<string, unknown>>,
    fields: readonly SchemaFieldDefinition[],
  ): boolean {
    const requiredFields = fields.filter((f) => f.required);
    return requiredFields.every((f) => payload[f.name] !== undefined && payload[f.name] !== null);
  }

  /** One present value against a type, its array, map, code set, pattern and encryption. */
  private checkValue(
    value: unknown,
    spec: ValueSpec,
    path: string,
    out: ContractViolation[],
  ): void {
    const expected = describeSpec(spec);
    if (spec.encrypted) {
      this.checkEncrypted(value, path, out);
      return;
    }
    if (spec.isArray) {
      if (!Array.isArray(value)) {
        out.push(typeMismatch(path, expected, value));
        return;
      }
      value.forEach((item, i) =>
        this.checkValue(item, { ...spec, isArray: false }, `${path}[${i}]`, out),
      );
      return;
    }
    if (spec.map) {
      if (!isRecord(value)) {
        out.push(typeMismatch(path, expected, value));
        return;
      }
      for (const [key, item] of Object.entries(value)) {
        this.checkValue(item, { ...spec, map: false }, `${path}.${key}`, out);
      }
      return;
    }
    this.checkItem(value, spec, path, out);
  }

  /** One value of the item type: a code set, a built-in scalar or a value object. */
  private checkItem(value: unknown, spec: ValueSpec, path: string, out: ContractViolation[]): void {
    if (spec.enum !== undefined) {
      if (typeof value !== 'string') {
        out.push(typeMismatch(path, spec.type, value));
      } else if (!spec.enum.includes(value)) {
        out.push(notInCodeSet(path, spec.enum, value));
      }
      return;
    }
    if (spec.type === 'array') {
      // A contract written with the bare type `array` accepts any array.
      if (!Array.isArray(value)) out.push(typeMismatch(path, spec.type, value));
      return;
    }
    if (Object.hasOwn(SCALARS, spec.type)) {
      const violation = checkScalar(value, spec.type, path);
      if (violation) {
        out.push(violation);
        return;
      }
      if (spec.pattern !== undefined && !new RegExp(spec.pattern, 'u').test(value as string)) {
        out.push({
          fieldName: path,
          expected: `${spec.type} matching ${spec.pattern}`,
          actual: show(value),
          constraintViolated: 'pattern mismatch',
        });
      }
      return;
    }
    this.checkValueObject(value, spec.type, path, out);
  }

  /** A value object: an object, or as declared in the IR when the engine has one. */
  private checkValueObject(
    value: unknown,
    name: string,
    path: string,
    out: ContractViolation[],
  ): void {
    const vo = this.findValueObject(name);
    if (vo?.scalar !== undefined) {
      this.checkValue(value, specOf(vo.scalar), path, out);
      return;
    }
    if (!isRecord(value)) {
      out.push(typeMismatch(path, name, value));
      return;
    }
    if (vo === undefined) return;
    if (vo.variants !== undefined && vo.variants.length > 0) {
      const names = vo.variants.map((v) => v.name);
      const tag = value[UNION_TAG];
      const variant = vo.variants.find((v) => v.name === tag);
      if (variant === undefined) {
        const tagPath = `${path}.${UNION_TAG}`;
        out.push(
          isAbsent(tag) ? missing(tagPath, names.join(' | ')) : notInCodeSet(tagPath, names, tag),
        );
        return;
      }
      this.checkFields(value, [...vo.fields, ...variant.fields], path, out);
      return;
    }
    this.checkFields(value, vo.fields, path, out);
  }

  /** The declared fields of an object: required ones present, each present one of its type. */
  private checkFields(
    value: Readonly<Record<string, unknown>>,
    fields: readonly FieldDefinition[],
    path: string,
    out: ContractViolation[],
  ): void {
    const checkedGroups = new Set<string>();
    for (const field of fields) {
      const fieldPath = `${path}.${field.name}`;
      const item = value[field.name];
      if (field.exclusive !== undefined) {
        this.checkExclusive(value, field.exclusive, path, checkedGroups, out);
      }
      if (isAbsent(item)) {
        if (field.required) out.push(missing(fieldPath, describeSpec(specOf(field))));
        continue;
      }
      this.checkValue(item, specOf(field), fieldPath, out);
    }
  }

  /** Exactly one member of an exclusive group is present (ADR-049 D5). */
  private checkExclusive(
    value: Readonly<Record<string, unknown>>,
    group: readonly string[],
    path: string,
    checkedGroups: Set<string>,
    out: ContractViolation[],
  ): void {
    const key = group.join('|');
    if (checkedGroups.has(key)) return;
    checkedGroups.add(key);
    const present = group.filter((name) => !isAbsent(value[name]));
    if (present.length === 1) return;
    out.push({
      fieldName: `${path}.${group.join(' | ')}`,
      expected: `exactly one of ${group.join(', ')}`,
      actual: present.length === 0 ? 'none' : present.join(', '),
      constraintViolated: 'exclusive fields',
    });
  }

  /** The recorded form of an `[encrypted]` field: `{dataKeyId, ciphertext}`, both strings. */
  private checkEncrypted(value: unknown, path: string, out: ContractViolation[]): void {
    const expected = '{dataKeyId, ciphertext}';
    if (!isRecord(value)) {
      out.push(typeMismatch(path, expected, value));
      return;
    }
    for (const key of ['dataKeyId', 'ciphertext']) {
      if (isAbsent(value[key])) out.push(missing(`${path}.${key}`, 'string'));
      else if (typeof value[key] !== 'string')
        out.push(typeMismatch(`${path}.${key}`, 'string', value[key]));
    }
  }

  /** A value object by name, in any context or aggregate of the IR. */
  private findValueObject(name: string): ValueObjectDefinition | undefined {
    for (const ctx of this.ir?.contexts ?? []) {
      const vo =
        ctx.valueObjects.find((v) => v.name === name) ??
        ctx.aggregates.flatMap((a) => a.valueObjects).find((v) => v.name === name);
      if (vo) return vo;
    }
    return undefined;
  }
}

/** What one value must be: the IR's field shape, reduced to what the check reads. */
interface ValueSpec {
  readonly type: string;
  readonly isArray: boolean;
  readonly map?: boolean;
  readonly enum?: readonly string[];
  readonly pattern?: string;
  readonly encrypted?: boolean;
}

function specOf(field: FieldDefinition): ValueSpec {
  return {
    type: field.type,
    isArray: field.isArray,
    map: field.map !== undefined,
    enum: field.enum,
    pattern: field.pattern,
    encrypted: field.encrypted === true,
  };
}

/** A crossing contract writes an array as `T[]` (`ast-to-ir`). */
function splitArray(type: string): { type: string; isArray: boolean } {
  return type.endsWith('[]')
    ? { type: type.slice(0, -2), isArray: true }
    : { type, isArray: false };
}

function describeSpec(spec: ValueSpec): string {
  const item = spec.enum !== undefined ? spec.enum.map((v) => `"${v}"`).join(' | ') : spec.type;
  if (spec.isArray) return `${item}[]`;
  if (spec.map) return `${item}{}`;
  return item;
}

/** A violation for a value of the wrong JSON type, or a scalar string of the wrong format. */
function checkScalar(value: unknown, type: string, path: string): ContractViolation | undefined {
  const runtime = SCALARS[type];
  const ofType =
    typeof value === runtime.json && (typeof value !== 'number' || Number.isFinite(value));
  if (!ofType) return typeMismatch(path, type, value);
  if (runtime.format === undefined || runtime.format(value as string)) return undefined;
  return {
    fieldName: path,
    expected: type,
    actual: show(value),
    constraintViolated: 'format mismatch',
  };
}

function isDate(s: string): boolean {
  const m = DATE_PATTERN.exec(s);
  return m !== null && isCalendarDate(Number(m[1]), Number(m[2]), Number(m[3]));
}

function isDateTime(s: string): boolean {
  const m = DATE_TIME_PATTERN.exec(s);
  return m !== null && isCalendarDate(Number(m[1]), Number(m[2]), Number(m[3]));
}

/** The day exists in that month of that year. */
function isCalendarDate(year: number, month: number, day: number): boolean {
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

/**
 * The runtime form of each Moment scalar: its JSON type and, for a string of a format, the check of
 * it. The same mapping as `@mmmnt/schema` (ADR-049 D8): `Money` is a number, `UUID`, `DateTime` and
 * `Date` are strings of that format.
 */
const SCALARS: Readonly<
  Record<string, { json: 'string' | 'number' | 'boolean'; format?: (s: string) => boolean }>
> = {
  string: { json: 'string' },
  number: { json: 'number' },
  boolean: { json: 'boolean' },
  Money: { json: 'number' },
  UUID: { json: 'string', format: (s) => UUID_PATTERN.test(s) },
  Date: { json: 'string', format: isDate },
  DateTime: { json: 'string', format: isDateTime },
};

function isAbsent(value: unknown): boolean {
  return value === undefined || value === null;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The JSON type of a value: `array` for an array, `typeof` otherwise. */
function jsonType(value: unknown): string {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  return typeof value;
}

/** A value as the violation quotes it: JSON, shortened. */
function show(value: unknown): string {
  const text = JSON.stringify(value) ?? String(value);
  return text.length > 40 ? `${text.slice(0, 37)}...` : text;
}

function missing(fieldName: string, expected: string): ContractViolation {
  return { fieldName, expected, actual: 'missing', constraintViolated: 'required field missing' };
}

function typeMismatch(fieldName: string, expected: string, value: unknown): ContractViolation {
  return { fieldName, expected, actual: jsonType(value), constraintViolated: 'type mismatch' };
}

function notInCodeSet(
  fieldName: string,
  values: readonly string[],
  value: unknown,
): ContractViolation {
  return {
    fieldName,
    expected: values.map((v) => `"${v}"`).join(' | '),
    actual: show(value),
    constraintViolated: 'not in code set',
  };
}
