export type {
  RuleSeverity,
  CodexRule,
  CodexRulePack,
  RulePackSource,
  RulePackVersion,
  ConstraintTarget,
  SchemaConstraint,
  SchemaConstraintViolation,
  RuleEvaluationResult,
  FetchMode,
  LazyFetchStrategy,
  FetchDiagnostic,
  FetchResult,
} from './value-objects/index.js';

export { SchemaRegistry } from './aggregates/schema-registry.js';
export type {
  RegisterEventSchemaInput,
  DeprecateFieldInput,
  ConfirmEndOfLifeInput,
  RemoveFieldInput,
} from './aggregates/schema-registry.js';

export type {
  FieldPhase,
  FieldDefinition,
  EventSchemaRegistered,
  EventFieldDeprecated,
  EventFieldEndOfLife,
  EventFieldRemoved,
  SchemaRegistryEvent,
} from './events/schema-registry-events.js';

export type { SchemaRegistryRecord } from './aggregates/schema-registry.jsonl-schema.js';
