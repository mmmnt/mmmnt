# @mmmnt/schema

Payload JSON Schemas for every event in a Moment model, and a schema registry that governs how event fields are deprecated and removed.

[![License: FSL-1.1-Apache-2.0](https://img.shields.io/badge/License-FSL--1.1--Apache--2.0-blue.svg)](../../LICENSE.md)
[![npm version](https://img.shields.io/npm/v/@mmmnt/schema.svg)](https://www.npmjs.com/package/@mmmnt/schema)

## Overview

The package has three parts:

- **Payload schemas.** `emitPayloadSchemas(ir)` turns a parsed model into one closed JSON Schema (draft 2020-12) per event payload (ADR-049). `moment schema emit` writes them to files.
- **Schema registry and consumption manifest.** `SchemaRegistry` is an event-sourced aggregate that moves each field of a registered event schema through four phases: active, deprecated, end-of-life and removed. `ConsumptionManifest` records which projections read which event fields, so the registry can refuse to retire a field that is still read.
- **Codex rule evaluation.** `CodexRuleEvaluator` checks field names against a rule pack fetched from outside Moment. Its violations are advisory and never block a registry command. With no rule pack configured, it returns empty results.

## Installation

Requires Node.js 22 or newer.

```bash
npm install @mmmnt/schema
```

## Quick start

Emit the payload schemas of a model:

```typescript
import { readFileSync } from 'node:fs';
import { MomentParser } from '@mmmnt/core';
import { emitPayloadSchemas } from '@mmmnt/schema';

const path = 'spec/ticketwave.moment';
const { ir } = await new MomentParser().parseContent(readFileSync(path, 'utf-8'), path);
if (!ir) throw new Error('The specification has errors');

const { schemas, diagnostics } = emitPayloadSchemas(ir);
console.log(Object.keys(schemas).length); // 59 for TicketWave
console.log(diagnostics); // []
console.log(schemas.SeatsHeld.required); // ['holdId', 'eventId', 'tierId', ...]
```

Or from the command line:

```bash
moment schema emit spec/ --out-dir schemas/   # Wrote 59 payload schema(s) to .../schemas
```

## Payload schemas

`emitPayloadSchemas(ir)` returns `{ schemas, diagnostics }`. `schemas` maps each event name to its schema, in declaration order. It covers every event the model declares, aggregate events and process events alike. Each schema has `$schema`, `title` (the event name) and the event's fields. A value object the event reaches is written once under `$defs` and referenced with `$ref`.

| In the `.moment` model            | In the JSON Schema                                                                                                        |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| An event or a record value object | `type: object`, `additionalProperties: false`, `properties`, and `required` listing the required fields in declared order |
| `x?: T`                           | `x` is left out of `required`                                                                                             |
| `string`, `number`, `boolean`     | `type`                                                                                                                    |
| `UUID`, `DateTime`, `Date`        | `type: string` with `format: uuid`, `date-time` or `date`                                                                 |
| `Money`                           | `type: number`                                                                                                            |
| `"a" \| "b"` (a code set)         | `type: string`, `enum: ["a", "b"]`                                                                                        |
| Value object `V`                  | `$ref: "#/$defs/V"`, with `V` in `$defs`                                                                                  |
| Scalar value object               | Its scalar schema, under its name in `$defs`                                                                              |
| Tagged union value object         | `oneOf`, one closed object per variant, with `kind` set to `const` the variant name                                       |
| `a: T \| b: U` (exclusive group)  | Both in `properties`, neither in `required`, and `oneOf: [{required: [a]}, {required: [b]}]`. Several groups use `allOf`  |
| `T[]`                             | `type: array`, `items`                                                                                                    |
| `T{key}` (a map)                  | `type: object`, `additionalProperties` set to the schema of `T`, and `x-key: "key"`                                       |
| `[pattern "r"]`                   | `pattern: "r"`. On an array or a map it applies to each item                                                              |
| `[encrypted]`                     | `x-encrypted: true` and a closed object with required string fields `dataKeyId` and `ciphertext`                          |
| `[deprecated …]`                  | `deprecated: true`                                                                                                        |

A field type that is neither built in nor a declared value object is a diagnostic, never an open schema. A value object name declared in two contexts resolves to the one in the event's own context first. `UNION_TAG` is the discriminator property of every tagged union, `'kind'`.

### `moment schema emit`

```bash
moment schema emit <file.moment|dir> [--out-dir <dir>]
```

- With `--out-dir`, it writes one `<Event>.schema.json` per event, for example `SeatsHeld.schema.json`.
- Without it, it prints all schemas to stdout as one JSON object keyed by event name.
- Any diagnostic fails the command with exit 1, and nothing is written.

## Schema registry

### Field lifecycle

| Phase           | Meaning                                                                                                        |
| --------------- | -------------------------------------------------------------------------------------------------------------- |
| **active**      | The field is current. Every field of a newly registered schema starts here.                                    |
| **deprecated**  | The field is scheduled for removal. Deprecation records a reason, replacement guidance and an optional target. |
| **end-of-life** | Confirmed only when the field has no active consumers.                                                         |
| **removed**     | Reached only from end-of-life, with no active consumers and a recorded rationale.                              |

The registry enforces these rules:

| Rule  | What it refuses                                                                                                               |
| ----- | ----------------------------------------------------------------------------------------------------------------------------- |
| SR-01 | Registering the same event type and version twice                                                                             |
| SR-02 | End-of-life or removal while the field has active consumers                                                                   |
| SR-03 | A deprecation without a reason or without replacement guidance                                                                |
| SR-04 | Skipping a phase: a field moves one step at a time                                                                            |
| SR-05 | A pre-GA version (major version below 1) that leaves out a field an earlier version of the event had: pre-GA is additive-only |

Every command returns the domain event it applied. `apply()` replays recorded events with the same rules, so a corrupted event stream is refused.

### Deprecating a field

```typescript
import { SchemaRegistry } from '@mmmnt/schema';

const registry = new SchemaRegistry();

registry.registerEventSchema({
  eventType: 'BookingScheduled',
  version: '1.0.0',
  fieldDefinitions: [
    { fieldName: 'customerId', fieldType: 'UUID', required: true },
    { fieldName: 'vetName', fieldType: 'string', required: false },
  ],
  registeredBy: 'scheduling',
});

registry.deprecateField({
  eventType: 'BookingScheduled',
  fieldName: 'vetName',
  deprecatedSince: '1.0.0',
  reason: 'vets are referenced by id',
  replacement: 'vetId',
});

console.log(registry.getFieldPhase('BookingScheduled', 'vetName')); // 'deprecated'
```

### Refusing end-of-life while a field is consumed

```typescript
import { SchemaRegistry, ConsumptionManifest } from '@mmmnt/schema';

const registry = new SchemaRegistry();
const manifest = new ConsumptionManifest();

registry.registerEventSchema({
  eventType: 'BookingCompleted',
  version: '1.0.0',
  fieldDefinitions: [
    { fieldName: 'customerId', fieldType: 'UUID', required: true },
    { fieldName: 'cost', fieldType: 'Money', required: true },
  ],
  registeredBy: 'ticketing',
});

manifest.declareConsumption(
  {
    projectionId: 'billing-ledger',
    projectionName: 'BillingLedger',
    product: 'billing-service',
    consumedEvents: [{ eventType: 'BookingCompleted', fields: ['customerId', 'cost'] }],
  },
  registry,
);

registry.deprecateField({
  eventType: 'BookingCompleted',
  fieldName: 'cost',
  deprecatedSince: '1.0.0',
  reason: 'split into fee and tax',
  replacement: 'fee',
});

const consumers = manifest.getConsumers('BookingCompleted', 'cost');
console.log(consumers.map((c) => c.projectionName)); // ['BillingLedger']

registry.confirmEndOfLife({
  eventType: 'BookingCompleted',
  fieldName: 'cost',
  confirmedBy: 'ticketing',
  hasActiveConsumers: !manifest.hasZeroConsumers('BookingCompleted', 'cost'),
}); // throws an SR-02 error: active consumers exist
```

`declareConsumption` rejects an event type the registry does not hold (CM-01). A later declaration for the same projection replaces the earlier one.

### `moment schema status`

```bash
moment schema status <file.moment|dir> [--json]
```

Registers every aggregate event of the model at version `1` and prints a table of each field with its type, phase and consumer count. A field marked `[deprecated …]` in the model shows as `deprecated`. `--json` prints `{ schemas, total }` instead. For TicketWave it lists 282 fields. The CLI declares no consumers, so the consumer count is always 0.

## Codex rule evaluation

```typescript
import { CodexRuleEvaluator, SchemaRegistry, validateOnSchemaEvolution } from '@mmmnt/schema';
import type { CodexRulePack, SchemaRegistryEvent } from '@mmmnt/schema';

const pack: CodexRulePack = {
  packId: 'naming',
  version: '1.0.0',
  framework: 'internal',
  effectiveDate: '2026-01-01',
  rules: [
    {
      ruleId: 'camel-case-fields',
      ruleType: 'naming-convention',
      parameters: { pattern: '^[a-z][a-zA-Z0-9]*$' },
      severity: 'warning',
    },
  ],
};

const evaluator = new CodexRuleEvaluator({
  strategy: { mode: 'lazy', cdnEndpoint: 'https://rules.example.com/pack.json' },
  fetcher: { fetch: async () => pack }, // in practice, fetch the endpoint
});

// Every registry command returns the event it applied; a stored log replays the same way.
const events: SchemaRegistryEvent[] = [
  new SchemaRegistry().registerEventSchema({
    eventType: 'CustomerRegistered',
    version: '1.0.0',
    fieldDefinitions: [{ fieldName: 'customer_id', fieldType: 'UUID', required: true }],
    registeredBy: 'ticketing',
  }),
];
const result = await validateOnSchemaEvolution(events, evaluator);

console.log(`${result.evaluatedSchemas} schema(s), ${result.totalViolations} violation(s)`);
for (const { eventType, version, evaluationResult } of result.diagnostics) {
  for (const v of evaluationResult.violations) {
    console.log(`[${v.severity}] ${eventType}@${version} ${v.ruleId}: ${v.description}`);
  }
}
// 1 schema(s), 1 violation(s)
// [warning] CustomerRegistered@1.0.0 camel-case-fields: Field 'customer_id' does not match naming convention pattern '^[a-z][a-zA-Z0-9]*$'
```

The evaluator fetches the pack once, on the first evaluation, and keeps it for the life of the evaluator. If there is no `cdnEndpoint` or `fetcher`, or the fetch fails, every evaluation returns empty results. A failed fetch is not retried.

| Rule type                                                  | What it checks                                                              |
| ---------------------------------------------------------- | --------------------------------------------------------------------------- |
| `naming-convention`                                        | Each field name matches `parameters.pattern`                                |
| `field-sensitivity-classification`                         | A field name that matches any of `parameters.sensitivePatterns` is reported |
| `retention-period-minimum`, `deprecation-timeline-minimum` | Counted as evaluated but not checked, because they need runtime metadata    |

Any other rule type is ignored.

## API reference

### Payload schemas

| Export                                      | Description                                                                                  |
| ------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `emitPayloadSchemas(ir)`                    | Returns `PayloadSchemas`: `schemas` by event name and `diagnostics` (`{ event, message }[]`) |
| `UNION_TAG`                                 | `'kind'`, the discriminator property of every tagged union                                   |
| `JsonSchema`                                | The subset of JSON Schema the emitter writes                                                 |
| `PayloadSchemas`, `PayloadSchemaDiagnostic` | The result and diagnostic types                                                              |

### Registry and manifest

| Export                | Description                                                                                                                                                                                                                                                        |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `SchemaRegistry`      | Commands: `registerEventSchema(RegisterEventSchemaInput)`, `deprecateField(DeprecateFieldInput)`, `confirmEndOfLife(ConfirmEndOfLifeInput)`, `removeField(RemoveFieldInput)`. Queries: `getFieldPhase`, `hasSchema`, `getRegisteredEventTypes`. Replay: `apply()`. |
| `ConsumptionManifest` | `declareConsumption(DeclareConsumptionInput, registry)`. Queries: `hasZeroConsumers`, `getConsumers`, `getDeclaration`.                                                                                                                                            |

### Codex rules

| Export                      | Description                                                                                                                                                                                                |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CodexRuleEvaluator`        | Constructed with `CodexRuleEvaluatorConfig` (`strategy`, optional `fetcher`). `evaluate(SchemaEvaluationInput)` returns a `RuleEvaluationResult`.                                                          |
| `validateOnSchemaEvolution` | `(events, evaluator)`. Replays `SchemaRegistryEvent`s and evaluates each registered schema. Returns `SchemaEvolutionPolicyResult` with `evaluatedSchemas`, `totalViolations` and per-schema `diagnostics`. |

### Types

| Type                                                                                        | Description                                                                          |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `FieldPhase`                                                                                | `'active' \| 'deprecated' \| 'end-of-life' \| 'removed'`                             |
| `FieldDefinition`                                                                           | `fieldName`, `fieldType`, `required`                                                 |
| `EventSchemaRegistered`, `EventFieldDeprecated`, `EventFieldEndOfLife`, `EventFieldRemoved` | The registry's events. `SchemaRegistryEvent` is their union                          |
| `ConsumedEventDeclaration`, `ProjectionConsumptionDeclared`, `ConsumptionManifestEvent`     | The manifest's declaration and event types                                           |
| `ConsumptionEntry`                                                                          | A projection's declaration: id, name, product, consumed events and their fields      |
| `SchemaRegistryRecord`, `ConsumptionManifestRecord`                                         | Record shapes for `.domain/` JSONL logs                                              |
| `CodexRule`, `CodexRulePack`, `RuleSeverity`                                                | A rule (`ruleId`, `ruleType`, `parameters`, `severity`) and a versioned pack of them |
| `LazyFetchStrategy`, `FetchMode`, `RulePackFetcher`                                         | Where and how the pack is fetched                                                    |
| `SchemaConstraint`, `SchemaConstraintViolation`, `RuleEvaluationResult`                     | A rule translated to a constraint, a violation, and the result of one evaluation     |
| `SchemaEvolutionDiagnostic`                                                                 | The evaluation result for one registered schema version                              |

## Integration

`@mmmnt/schema` depends on `@mmmnt/core` for the IR. The CLI (`@mmmnt/cli`) uses it for `moment schema emit` and `moment schema status`. `@mmmnt/generate` uses `emitPayloadSchemas` for the payloads of its AsyncAPI document.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for what changed in each release.

## Contributing

This package is part of the [mmmnt monorepo](https://github.com/mmmnt/mmmnt). See [CONTRIBUTING.md](../../CONTRIBUTING.md) for development setup.

```bash
pnpm install
pnpm turbo build --filter=@mmmnt/schema
pnpm --filter @mmmnt/schema test
```

## License

[FSL-1.1-Apache-2.0](../../LICENSE.md)
