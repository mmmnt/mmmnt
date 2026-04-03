# @mmmnt/schema

Schema governance engine with a 4-phase lifecycle for managing domain event schema evolution.

[![License: FSL-1.1-Apache-2.0](https://img.shields.io/badge/License-FSL--1.1--Apache--2.0-blue.svg)](../../LICENSE.md)
[![npm version](https://img.shields.io/npm/v/@mmmnt/schema.svg)](https://www.npmjs.com/package/@mmmnt/schema)

## Overview

`@mmmnt/schema` provides schema governance for event-driven systems built with the Moment toolchain. It tracks every event and command schema through a structured 4-phase lifecycle -- Active, Deprecated, EndOfLife, and Removed -- ensuring that schema changes are communicated, planned, and enforced across teams and services.

The schema registry maintains a versioned catalog of all schemas in your domain. When a field is deprecated, consumers are warned. When a schema reaches end-of-life, downstream code generation and test derivation reflect the change. When a schema is removed, the registry prevents any code from referencing it. This lifecycle model prevents the common problem of schema evolution breaking consumers without notice.

The codex rule evaluator enforces governance policies defined alongside your `.moment` specifications. Rules can require deprecation notices before removal, mandate minimum deprecation periods, or enforce naming conventions on new schema versions. The consumption manifest tracks which services consume which schemas, enabling targeted impact notifications when schemas change phase.

## Installation

```bash
npm install @mmmnt/schema
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
  // e.g., "PatientRegistered: Active"
  // e.g., "LegacyAdmission: Deprecated"
}

// Check for deprecated fields
const deprecated = registry.findByPhase('Deprecated');
for (const schema of deprecated) {
  console.log(`WARNING: ${schema.name} is deprecated — migrate by ${schema.endOfLifeDate}`);
}
```

### Consumption Manifest

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
```

### Codex Rule Evaluation

```typescript
import { CodexRuleEvaluator } from '@mmmnt/schema';

const evaluator = new CodexRuleEvaluator();
const violations = evaluator.evaluate(registry);

for (const violation of violations) {
  console.log(`[${violation.severity}] ${violation.rule}: ${violation.message}`);
}
```

## Schema Lifecycle

| Phase | Description |
|-------|-------------|
| **Active** | Schema is current and fully supported. All code generation targets this version. |
| **Deprecated** | Schema is scheduled for removal. Consumers receive warnings. A migration path should be documented. |
| **EndOfLife** | Schema is no longer supported. New consumers cannot subscribe. Existing consumers must migrate. |
| **Removed** | Schema is purged from the registry. References in code or specs produce errors. |

## API Reference

### Registry

| Export | Description |
|--------|-------------|
| `SchemaRegistry` | Versioned catalog of all event and command schemas with lifecycle tracking. Supports querying by name, phase, context, and version. |

### Governance

| Export | Description |
|--------|-------------|
| `ConsumptionManifest` | Tracks which services consume which schemas, enabling targeted notifications and impact analysis when schemas change lifecycle phase. |
| `CodexRuleEvaluator` | Evaluates governance rules against the registry, producing violations for policies like minimum deprecation periods or naming conventions. |

### Key Types

| Type | Description |
|------|-------------|
| `SchemaEntry` | A registered schema with name, version, phase, payload definition, and lifecycle dates. |
| `SchemaPhase` | Enum of lifecycle phases: `Active`, `Deprecated`, `EndOfLife`, `Removed`. |
| `ConsumptionRecord` | A record of a service consuming a specific schema version. |
| `CodexViolation` | A governance rule violation with severity, rule name, message, and affected schema. |

## Integration

`@mmmnt/schema` depends on `@mmmnt/core` for the IR. It integrates with the broader ecosystem:

- **@mmmnt/sync** consults the schema registry during drift detection to understand whether schema changes are expected lifecycle transitions or unexpected drift.
- **@mmmnt/derive** uses lifecycle metadata to exclude removed schemas and flag deprecated schemas in generated test cases.
- **@mmmnt/mcp** exposes schema status through the `moment_status` tool.
- **@mmmnt/cli** exposes schema governance via the `moment schema` command.

## License

[FSL-1.1-Apache-2.0](../../LICENSE.md)
