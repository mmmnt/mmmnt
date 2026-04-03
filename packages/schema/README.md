# @mmmnt/schema

Schema registry with four-phase lifecycle governance and consumption manifest tracking.

[![License: FSL-1.1-Apache-2.0](https://img.shields.io/badge/License-FSL--1.1--Apache--2.0-blue.svg)](../../LICENSE.md)
[![npm version](https://img.shields.io/npm/v/@mmmnt/schema.svg)](https://www.npmjs.com/package/@mmmnt/schema)

## Overview

`@mmmnt/schema` provides schema governance for event-driven systems built with the Moment toolchain. It tracks every event and command schema through a structured four-phase lifecycle -- Active, Deprecated, EndOfLife, and Removed -- ensuring that schema changes are communicated, planned, and enforced across teams and services.

The schema registry maintains a versioned catalog of all schemas in your domain. When a field is deprecated, consumers are warned. When a schema reaches end-of-life, downstream code generation and test derivation reflect the change. When a schema is removed, the registry prevents any code from referencing it. This lifecycle model prevents the common problem of schema evolution breaking consumers without notice.

The codex rule evaluator enforces governance policies defined alongside your `.moment` specifications. Rules can require deprecation notices before removal, mandate minimum deprecation periods, or enforce naming conventions on new schema versions. The consumption manifest tracks which services consume which schemas, enabling targeted impact notifications when schemas change phase. Together, these capabilities give teams a structured, auditable process for evolving their event schemas over time.

## Installation

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
import { MomentParser, astToIr } from '@mmmnt/core';
import { SchemaRegistry } from '@mmmnt/schema';

const parser = new MomentParser();
const { ast } = parser.parse('path/to/spec.moment');
const ir = astToIr(ast);

// Build the schema registry from the IR
const registry = new SchemaRegistry();
registry.load(ir);

// Query schema lifecycle status
for (const schema of registry.schemas()) {
  console.log(`${schema.name}: ${schema.phase}`);
}

// Check for deprecated fields
const deprecated = registry.findByPhase('Deprecated');
for (const schema of deprecated) {
  console.log(`WARNING: ${schema.name} is deprecated -- migrate by ${schema.endOfLifeDate}`);
}
```

## Key Features

- **Four-phase schema lifecycle** -- schemas progress through Active, Deprecated, EndOfLife, and Removed phases, with each transition enforced by governance rules.
- **Versioned schema registry** -- maintains a catalog of all event and command schemas with version history, field definitions, and lifecycle dates.
- **Consumption manifest tracking** -- records which services consume which schemas, enabling targeted impact notifications and migration planning.
- **Codex rule evaluation** -- evaluates governance rules against the registry, catching violations like missing deprecation notices or premature removals.
- **Field-level deprecation** -- supports deprecating individual fields within a schema, not just entire schemas, for fine-grained evolution.
- **Event-sourced state** -- the registry and consumption manifest use event-sourced aggregates (`SchemaRegistryEvent`, `ConsumptionManifestEvent`) for full audit trails.
- **Schema evolution validation** -- the `validateOnSchemaEvolution` policy automatically checks governance rules when schemas change.
- **Configurable rule packs** -- load governance rules from built-in packs, external sources, or custom definitions.

## Schema Lifecycle

| Phase | Description |
|-------|-------------|
| **Active** | Schema is current and fully supported. All code generation targets this version. |
| **Deprecated** | Schema is scheduled for removal. Consumers receive warnings. A migration path should be documented. |
| **EndOfLife** | Schema is no longer supported. New consumers cannot subscribe. Existing consumers must migrate. |
| **Removed** | Schema is purged from the registry. References in code or specifications produce errors. |

## API Reference

### Registry

| Export | Description |
|--------|-------------|
| `SchemaRegistry` | Versioned catalog of all event and command schemas with lifecycle tracking. Supports querying by name, phase, context, and version. Accepts `RegisterEventSchemaInput`, `DeprecateFieldInput`, `ConfirmEndOfLifeInput`, and `RemoveFieldInput` commands. |

### Governance

| Export | Description |
|--------|-------------|
| `ConsumptionManifest` | Tracks which services consume which schemas, enabling targeted notifications and impact analysis when schemas change lifecycle phase. Accepts `DeclareConsumptionInput`. |
| `CodexRuleEvaluator` | Evaluates governance rules against the registry, producing violations for policies like minimum deprecation periods, naming conventions, or required documentation. Configurable via `CodexRuleEvaluatorConfig`. |

### Policies

| Export | Description |
|--------|-------------|
| `validateOnSchemaEvolution` | Policy that automatically evaluates governance rules when schemas change phase. Returns `SchemaEvolutionPolicyResult` with diagnostics. |

### Key Types

| Type | Description |
|------|-------------|
| `FieldPhase` | Lifecycle phase for an individual field: Active, Deprecated, EndOfLife, Removed. |
| `FieldDefinition` | A field within a schema with name, type, phase, and deprecation metadata. |
| `EventSchemaRegistered` | Event emitted when a new schema is registered. |
| `EventFieldDeprecated` | Event emitted when a field is deprecated. |
| `EventFieldEndOfLife` | Event emitted when a field reaches end-of-life. |
| `EventFieldRemoved` | Event emitted when a field is removed. |
| `SchemaRegistryEvent` | Union of all schema registry events. |
| `ConsumptionEntry` | A record of a service consuming a specific schema version. |
| `CodexRule` | A governance rule definition with name, severity, and evaluation logic. |
| `CodexRulePack` | A collection of related governance rules loaded as a unit. |
| `CodexViolation` / `SchemaConstraintViolation` | A governance rule violation with severity, rule name, message, and affected schema. |
| `SchemaEvolutionDiagnostic` | A diagnostic produced during schema evolution validation. |
| `RuleEvaluationResult` | Result of evaluating a single rule against the registry. |

## Examples

### Querying the Schema Registry

```typescript
import { MomentParser, astToIr } from '@mmmnt/core';
import { SchemaRegistry } from '@mmmnt/schema';

const parser = new MomentParser();
const { ast } = parser.parse('specs/vet-clinic.moment');
const ir = astToIr(ast);

const registry = new SchemaRegistry();
registry.load(ir);

// List all schemas by phase
for (const phase of ['Active', 'Deprecated', 'EndOfLife', 'Removed'] as const) {
  const schemas = registry.findByPhase(phase);
  console.log(`\n${phase} (${schemas.length}):`);
  for (const schema of schemas) {
    console.log(`  ${schema.name} v${schema.version}`);
  }
}
```

### Tracking Consumption and Impact

```typescript
import { ConsumptionManifest } from '@mmmnt/schema';

const manifest = new ConsumptionManifest();
manifest.load('path/to/consumption-manifest.json');

// Find all consumers of a specific event schema
const consumers = manifest.consumersOf('AppointmentScheduled');
console.log(`AppointmentScheduled is consumed by: ${consumers.join(', ')}`);

// Check impact of deprecating a schema
const impacted = manifest.impactOf('LegacyAdmission');
for (const service of impacted) {
  console.log(`Service ${service.name} uses ${service.usageCount} deprecated fields`);
}

// Declare a new consumption relationship
manifest.declare({
  serviceName: 'billing-service',
  eventName: 'AppointmentCompleted',
  fields: ['patientId', 'date', 'cost'],
});
```

### Evaluating Governance Rules

```typescript
import { MomentParser, astToIr } from '@mmmnt/core';
import { SchemaRegistry, CodexRuleEvaluator } from '@mmmnt/schema';

const parser = new MomentParser();
const { ast } = parser.parse('specs/vet-clinic.moment');
const ir = astToIr(ast);

const registry = new SchemaRegistry();
registry.load(ir);

const evaluator = new CodexRuleEvaluator();
const violations = evaluator.evaluate(registry);

if (violations.length === 0) {
  console.log('All governance rules satisfied.');
} else {
  for (const violation of violations) {
    console.log(`[${violation.severity}] ${violation.rule}: ${violation.message}`);
  }
}
```

## Integration

`@mmmnt/schema` depends on `@mmmnt/core` for the IR. It integrates with the broader ecosystem:

```
@mmmnt/core --> @mmmnt/schema
                     |
                     +-- @mmmnt/sync      (lifecycle context for drift detection)
                     +-- @mmmnt/derive    (excludes removed schemas from test generation)
                     +-- @mmmnt/cli       (exposed via `moment schema` and `moment lint`)
                     +-- @mmmnt/mcp       (exposed via `moment_status` tool)
```

## Contributing

This package is part of the [mmmnt monorepo](https://github.com/mmmnt/mmmnt). See the repository root for contribution guidelines, development setup, and the code of conduct.

```bash
git clone https://github.com/mmmnt/mmmnt.git
cd mmmnt
pnpm install
pnpm turbo build --filter=@mmmnt/schema
pnpm --filter @mmmnt/schema test
```

## License

[FSL-1.1-Apache-2.0](../../LICENSE.md)
