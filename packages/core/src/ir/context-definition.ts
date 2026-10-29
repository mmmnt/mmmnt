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
  projections?: ProjectionDefinition[];
  queries?: QueryDefinition[];
  rules?: RuleDefinition[];
}

export interface ProjectionDefinition {
  id: string;
  name: string;
  sources: string[];
  description?: string;
  fields: FieldDefinition[];
  gateways?: GatewayDefinition[];
}

/** A gateway (ADR-038 §4): request-to-value logic on the construct that uses it. */
export interface GatewayDefinition {
  id: string;
  name: string;
  consumes: string;
  produces: string;
  description?: string;
}

export interface QueryDefinition {
  id: string;
  name: string;
  reads: string[];
  inputs: FieldDefinition[];
  description?: string;
}

export interface RuleDefinition {
  id: string;
  description: string;
  enforcedBy: string;
  /** `declared`: a service or query of the project; `external`: an enforcer named in prose. */
  enforcerKind: 'declared' | 'external';
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
  /** Internal state (ADR-038 §3): the initial state and the transitions the aggregate's commands make. */
  states?: AggregateStatesDefinition;
}

export interface AggregateStatesDefinition {
  initial?: string;
  /** Every `state initial` written, so a second one is visible to V36. */
  initials: string[];
  transitions: { from: string; to: string; command: string }[];
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
  /** The one domain event the policy reacts to (ADR-038 §1). */
  trigger: string;
  action: string;
  /** The command the policy invokes; the grammar requires it, hand-built IR may omit it. */
  chainsTo?: string;
  gateways?: GatewayDefinition[];
}

/**
 * The palette's Saga, written `orchestration` or `saga` (ADR-038 §2). The IR node kind stays `saga`.
 * `trigger` is the command that invokes it and `compensation` its compensation lines rendered as
 * text (`none` when it has nothing to undo), so consumers that print a saga read the same fields.
 */
export interface SagaDefinition {
  id: string;
  name: string;
  annotations?: AnnotationDefinition[];
  keyword?: 'orchestration' | 'saga';
  trigger: string;
  /** The trigger of the relay policy that invokes `trigger`, when one does: the event the run starts on. */
  startEvent?: string;
  states: string[];
  /**
   * State transitions in declaration order (M-S6). `onCommand` is the orchestration's own command
   * named by `-> To on Command`; `onEvent` is the trigger of the relay policy that invokes it.
   * Optional at the type level so hand-built IR stays valid; the parser always emits it.
   */
  transitions?: SagaTransitionDefinition[];
  compensation: string;
  timeout: string;
  /** The commands invoked on the orchestration; in the palette they emit nothing. */
  commands?: OrchestrationCommandDefinition[];
  issues?: IssuedCommandDefinition[];
  compensations?: CompensationDefinition[];
  gateways?: GatewayDefinition[];
}

export interface OrchestrationCommandDefinition {
  id: string;
  name: string;
  inputs: FieldDefinition[];
  preconditions: PreconditionDefinition[];
  /** Present only when the author wrote `emits`, which V31 refuses. */
  emitsEvent?: string;
}

/** A command an orchestration sends: an aggregate's command, or `<External>.<operation>`. */
export interface IssuedCommandDefinition {
  name: string;
  external?: string;
}

/** `compensation on <Command> issues …`; `compensation none` is `{ none: true }`. */
export type CompensationDefinition =
  | { none: true }
  | { none?: false; onCommand: string; issues: IssuedCommandDefinition[] };

/** One saga state transition (see SagaDefinition.transitions). */
export interface SagaTransitionDefinition {
  from: string;
  to: string;
  onCommand?: string;
  onEvent?: string;
}
