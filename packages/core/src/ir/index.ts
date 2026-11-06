export type {
  IntermediateRepresentation,
  SpecificationMetadata,
  GlossaryEntry,
  ContextRelationship,
  ExternalDefinition,
} from './intermediate-representation.js';

export type {
  ContextDefinition,
  AggregateDefinition,
  CommandDefinition,
  PreconditionDefinition,
  EventDefinition,
  EventOwner,
  ValueObjectDefinition,
  FieldDefinition,
  InvariantDefinition,
  DomainServiceDefinition,
  PolicyDefinition,
  SagaDefinition,
  SagaTransitionDefinition,
  AnnotationDefinition,
  ProjectionDefinition,
  QueryDefinition,
  RuleDefinition,
  GatewayDefinition,
  AggregateStatesDefinition,
  OrchestrationCommandDefinition,
  IssuedCommandDefinition,
  CompensationDefinition,
  EmitOutcomeDefinition,
} from './context-definition.js';

export type { FlowDefinition, LaneDefinition } from './flow-definition.js';

export type {
  MomentDefinition,
  MomentEntry,
  BranchDefinition,
  MomentSequenceItem,
  MomentNote,
} from './frame-definition.js';

export type { ConnectionDefinition, ConnectionType } from './connection-definition.js';

export type { SchemaContract, SchemaFieldDefinition } from './schema-contract.js';

export type {
  ManifestConfiguration,
  WatchConfiguration,
  FileRef,
  GeneratorConfig,
} from './manifest-configuration.js';

export type { ParseResult, ValidationResult, Diagnostic, SourceLocation } from './parse-result.js';

export type { ImportResult, UpstreamFingerprint } from './import-result.js';

export { emitOutcomes, emittedEvents, type EmitsFields } from './emits.js';
