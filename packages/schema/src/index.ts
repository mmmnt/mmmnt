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

export { ConsumptionManifest } from './aggregates/consumption-manifest.js';
export type {
  DeclareConsumptionInput,
  ConsumptionEntry,
} from './aggregates/consumption-manifest.js';

export type {
  ConsumedEventDeclaration,
  ProjectionConsumptionDeclared,
  ConsumptionManifestEvent,
} from './events/consumption-manifest-events.js';

export type { ConsumptionManifestRecord } from './aggregates/consumption-manifest.jsonl-schema.js';

export { CodexRuleEvaluator } from './services/codex-rule-evaluator.js';
export type {
  CodexRuleEvaluatorConfig,
  RulePackFetcher,
  SchemaEvaluationInput,
} from './services/codex-rule-evaluator.js';
