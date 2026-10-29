# @mmmnt/schema

Schema registry with four-phase field lifecycle governance and consumption manifest tracking.

[![License: FSL-1.1-Apache-2.0](https://img.shields.io/badge/License-FSL--1.1--Apache--2.0-blue.svg)](../../LICENSE.md)
[![npm version](https://img.shields.io/npm/v/@mmmnt/schema.svg)](https://www.npmjs.com/package/@mmmnt/schema)

## Overview

`@mmmnt/schema` provides schema governance for event-driven systems built with the Moment toolchain. It tracks every field of every registered event schema through a structured four-phase lifecycle -- active, deprecated, end-of-life, and removed -- so that schema changes are announced, planned, and enforced rather than breaking consumers without notice.

The schema registry is an event-sourced aggregate. Registered schema versions are immutable, pre-GA versions (major version below 1) may only add fields, a deprecation must give a reason and replacement guidance, and a field can only reach end-of-life or be removed once it has no active consumers. Every command returns the domain event it applied, and `apply()` replays recorded events with the same invariants enforced, so a corrupted event stream is refused.

The consumption manifest records which projections consume which event fields and answers the zero-consumer question the registry needs before end-of-life and removal. The Codex rule evaluator is an anti-corruption layer that translates an externally fetched Codex rule pack into schema constraints; its violations are advisory and never block a schema operation, and with no rule pack configured it returns empty results.

## Installation

Requires Node.js 22 or newer.

```bash
npm install @mmmnt/schema
```

Or with other package managers:

```bash
pnpm add @mmmnt/schema
yarn add @mmmnt/schema
```

## Quick Start

```typescript
import { SchemaRegistry } from '@mmmnt/schema';

const registry = new SchemaRegistry();

registry.registerEventSchema({
  eventType: 'AppointmentScheduled',
  version: '1.0.0',
  fieldDefinitions: [
    { fieldName: 'patientId', fieldType: 'UUID', required: true },
    { fieldName: 'vetName', fieldType: 'string', required: false },
  ],
  registeredBy: 'scheduling',
});

registry.deprecateField({
  eventType: 'AppointmentScheduled',
  fieldName: 'vetName',
  deprecatedSince: '1.0.0',
  reason: 'vets are referenced by id',
  replacement: 'vetId',
});

console.log(registry.getFieldPhase('AppointmentScheduled', 'vetName')); // 'deprecated'
```

## Key Features

- **Four-phase field lifecycle** -- each field moves active → deprecated → end-of-life → removed, and only one step at a time (SR-04).
- **Immutable, versioned schemas** -- a schema is registered once per event type and version (SR-01); pre-GA versions are additive-only (SR-05).
- **Guarded deprecation and removal** -- deprecation requires a reason and replacement guidance (SR-03); end-of-life and removal require zero active consumers (SR-02).
- **Consumption manifest tracking** -- records which projections consume which event fields, validated against the registry, with a later declaration for the same projection superseding the earlier one.
- **Event-sourced state** -- the registry and consumption manifest emit and replay `SchemaRegistryEvent` and `ConsumptionManifestEvent`, with record shapes (`SchemaRegistryRecord`, `ConsumptionManifestRecord`) for `.domain/` JSONL logs.
- **Codex rule evaluation** -- evaluates naming-convention and field-sensitivity-classification rules from a fetched rule pack; the pack is fetched lazily once per session and cached.
- **Schema evolution validation** -- the `validateOnSchemaEvolution` policy replays registry events and evaluates every registered schema against the rule pack.

## Schema Lifecycle

| Phase | Description |
|-------|-------------|
| **active** | The field is current. Every field of a newly registered schema starts here. |
| **deprecated** | The field is scheduled for removal. Deprecation records a reason, replacement guidance, and an optional removal target. |
| **end-of-life** | Confirmed only when the field has no active consumers. |
| **removed** | Removed only from end-of-life, with no active consumers and a recorded rationale. |

## API Reference

### Registry

| Export | Description |
|--------|-------------|
| `SchemaRegistry` | Event-sourced catalog of event schemas and per-field lifecycle. Commands: `registerEventSchema(RegisterEventSchemaInput)`, `deprecateField(DeprecateFieldInput)`, `confirmEndOfLife(ConfirmEndOfLifeInput)`, `removeField(RemoveFieldInput)`. Queries: `getFieldPhase`, `hasSchema`, `getRegisteredEventTypes`. Replay with `apply()`. |

### Governance

| Export | Description |
|--------|-------------|
| `ConsumptionManifest` | Tracks which projections consume which event fields. `declareConsumption(DeclareConsumptionInput, registry)` rejects unregistered event types (CM-01). Queries: `hasZeroConsumers`, `getConsumers`, `getDeclaration`. |
| `CodexRuleEvaluator` | Evaluates a schema (`SchemaEvaluationInput`: event type, version, field names) against a Codex rule pack fetched through an optional `RulePackFetcher`. Configured with `CodexRuleEvaluatorConfig` (`strategy`, `fetcher`). `evaluate()` returns a `RuleEvaluationResult`. |

### Policies

| Export | Description |
|--------|-------------|
| `validateOnSchemaEvolution` | Replays `SchemaRegistryEvent`s and evaluates each registered schema with a `CodexRuleEvaluator`. Returns `SchemaEvolutionPolicyResult` with per-schema diagnostics and the total violation count. |

### Key Types

| Type | Description |
|------|-------------|
| `FieldPhase` | `'active' \| 'deprecated' \| 'end-of-life' \| 'removed'`. |
| `FieldDefinition` | A field within a schema: `fieldName`, `fieldType`, `required`. |
| `EventSchemaRegistered` | Event emitted when a schema version is registered. |
| `EventFieldDeprecated` | Event emitted when a field is deprecated. |
| `EventFieldEndOfLife` | Event emitted when a field's end-of-life is confirmed. |
| `EventFieldRemoved` | Event emitted when a field is removed. |
| `SchemaRegistryEvent` | Union of all schema registry events. |
| `ConsumptionEntry` | A projection's declaration: projection id and name, product, and consumed events with their fields. |
| `CodexRule` | A rule in a pack: `ruleId`, `ruleType`, `parameters`, `severity` (`error` or `warning`). |
| `CodexRulePack` | A versioned collection of rules with framework and effective date. |
| `LazyFetchStrategy` | How and where to fetch the rule pack: `mode` (`lazy` or `signal`) and optional `cdnEndpoint`. |
| `SchemaConstraintViolation` | A violation with constraint type, rule id, target, description, and severity. |
| `RuleEvaluationResult` | Pack version, constraints evaluated, violations, and `passedAll`. |
| `SchemaEvolutionDiagnostic` | The evaluation result for one registered schema version. |

## Examples

### Walking a Field Through Its Lifecycle

```typescript
import { SchemaRegistry, ConsumptionManifest } from '@mmmnt/schema';

const registry = new SchemaRegistry();
const manifest = new ConsumptionManifest();

registry.registerEventSchema({
  eventType: 'AppointmentCompleted',
  version: '1.0.0',
  fieldDefinitions: [
    { fieldName: 'patientId', fieldType: 'UUID', required: true },
    { fieldName: 'cost', fieldType: 'Money', required: true },
  ],
  registeredBy: 'clinic',
});

manifest.declareConsumption(
  {
    projectionId: 'billing-ledger',
    projectionName: 'BillingLedger',
    product: 'billing-service',
    consumedEvents: [{ eventType: 'AppointmentCompleted', fields: ['patientId', 'cost'] }],
  },
  registry,
);

registry.deprecateField({
  eventType: 'AppointmentCompleted',
  fieldName: 'cost',
  deprecatedSince: '1.0.0',
  reason: 'split into fee and tax',
  replacement: 'fee',
});

// SR-02: end-of-life is refused while any projection still consumes the field.
const consumers = manifest.getConsumers('AppointmentCompleted', 'cost');
console.log(consumers.map((c) => c.projectionName)); // ['BillingLedger']

registry.confirmEndOfLife({
  eventType: 'AppointmentCompleted',
  fieldName: 'cost',
  confirmedBy: 'clinic',
  hasActiveConsumers: !manifest.hasZeroConsumers('AppointmentCompleted', 'cost'),
}); // throws: SR-02 ... active consumers exist
```

### Evaluating Governance Rules

```typescript
import { CodexRuleEvaluator, SchemaRegistry, validateOnSchemaEvolution } from '@mmmnt/schema';
import type { CodexRulePack, SchemaRegistryEvent } from '@mmmnt/schema';

const evaluator = new CodexRuleEvaluator({
  strategy: { mode: 'lazy', cdnEndpoint: 'https://rules.example.com/pack.json' },
  fetcher: {
    fetch: async (endpoint) => (await (await fetch(endpoint)).json()) as CodexRulePack,
  },
});

// Every registry command returns the event it applied; a stored log replays the same way.
const events: SchemaRegistryEvent[] = [
  new SchemaRegistry().registerEventSchema({
    eventType: 'PatientRegistered',
    version: '1.0.0',
    fieldDefinitions: [{ fieldName: 'patient_id', fieldType: 'UUID', required: true }],
    registeredBy: 'clinic',
  }),
];
const result = await validateOnSchemaEvolution(events, evaluator);

console.log(`${result.evaluatedSchemas} schema(s), ${result.totalViolations} violation(s)`);
for (const { eventType, version, evaluationResult } of result.diagnostics) {
  for (const v of evaluationResult.violations) {
    console.log(`[${v.severity}] ${eventType}@${version} ${v.ruleId}: ${v.description}`);
  }
}
```

Without a `cdnEndpoint` and `fetcher`, or when the fetch fails, evaluation returns empty results rather than failing.

## Integration

`@mmmnt/schema` declares `@mmmnt/core` as its dependency and is used by the CLI:

```
@mmmnt/core --> @mmmnt/schema
                     |
                     +-- @mmmnt/cli  (exposed via `moment schema status`)
```

## Contributing

This package is part of the [mmmnt monorepo](https://github.com/mmmnt/mmmnt). See [CONTRIBUTING.md](../../CONTRIBUTING.md) for development setup and contribution guidelines.

```bash
git clone https://github.com/mmmnt/mmmnt.git
cd mmmnt
pnpm install
pnpm turbo build --filter=@mmmnt/schema
pnpm --filter @mmmnt/schema test
```

## License

[FSL-1.1-Apache-2.0](../../LICENSE.md)
