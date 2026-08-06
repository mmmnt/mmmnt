/**
 * Classification annotation (@classification/@retention/@encryption).
 * Values are rendered as-is; enum membership is not validated (SIM-01).
 */
export interface AnnotationDefinition {
  name: 'classification' | 'retention' | 'encryption';
  value: string;
}

export interface ContextDefinition {
  id: string;
  name: string;
  classification?: 'Core' | 'Supporting' | 'Generic' | 'Terminal';
  description?: string;
  aggregates: AggregateDefinition[];
  domainServices: DomainServiceDefinition[];
  commands: CommandDefinition[];
  events: EventDefinition[];
  policies: PolicyDefinition[];
  sagas: SagaDefinition[];
  valueObjects: ValueObjectDefinition[];
  invariants: InvariantDefinition[];
}

export interface AggregateDefinition {
  id: string;
  name: string;
  annotations?: AnnotationDefinition[];
  identityField: FieldDefinition;
  commands: CommandDefinition[];
  events: EventDefinition[];
  valueObjects: ValueObjectDefinition[];
  invariants: InvariantDefinition[];
}

export interface CommandDefinition {
  id: string;
  name: string;
  annotations?: AnnotationDefinition[];
  inputs: FieldDefinition[];
  preconditions: PreconditionDefinition[];
  emitsEvent: string;
}

export interface PreconditionDefinition {
  name: string;
  description: string;
}

export interface EventDefinition {
  id: string;
  name: string;
  annotations?: AnnotationDefinition[];
  fields: FieldDefinition[];
}

export interface ValueObjectDefinition {
  id: string;
  name: string;
  annotations?: AnnotationDefinition[];
  fields: FieldDefinition[];
}

export interface FieldDefinition {
  name: string;
  type: string;
  isArray: boolean;
  required: boolean;
  deprecated?: { reason: string; replacement: string };
}

export interface InvariantDefinition {
  id: string;
  description: string;
  scope: string;
  annotations?: AnnotationDefinition[];
}

export interface DomainServiceDefinition {
  id: string;
  name: string;
  annotations?: AnnotationDefinition[];
  consumes: string;
  produces: string;
  description: string;
}

export interface PolicyDefinition {
  id: string;
  name: string;
  annotations?: AnnotationDefinition[];
  trigger: string;
  action: string;
  chainsTo?: string;
}

export interface SagaDefinition {
  id: string;
  name: string;
  annotations?: AnnotationDefinition[];
  trigger: string;
  states: string[];
  /**
   * State transitions in declaration order, derived from the `states` chain
   * (M-S6). `onEvent` is present when the spec binds the transition to a
   * domain event via `-> Target on Event`. Optional at the type level so
   * hand-built IR stays valid; the parser always emits it.
   */
  transitions?: SagaTransitionDefinition[];
  compensation: string;
  timeout: string;
}

/** One saga state transition (see SagaDefinition.transitions). */
export interface SagaTransitionDefinition {
  from: string;
  to: string;
  /** Domain event that fires this transition (`-> To on Event`). */
  onEvent?: string;
}
