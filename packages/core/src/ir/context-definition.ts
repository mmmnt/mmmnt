export interface ContextDefinition {
  id: string;
  name: string;
  classification?: 'Core' | 'Supporting' | 'Generic' | 'Terminal';
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
  identityField: FieldDefinition;
  commands: CommandDefinition[];
  events: EventDefinition[];
  valueObjects: ValueObjectDefinition[];
  invariants: InvariantDefinition[];
}

export interface CommandDefinition {
  id: string;
  name: string;
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
  fields: FieldDefinition[];
}

export interface ValueObjectDefinition {
  id: string;
  name: string;
  fields: FieldDefinition[];
}

export interface FieldDefinition {
  name: string;
  type: string;
  isArray: boolean;
  required: boolean;
}

export interface InvariantDefinition {
  id: string;
  description: string;
  scope: string;
}

export interface DomainServiceDefinition {
  id: string;
  name: string;
  consumes: string;
  produces: string;
  description: string;
}

export interface PolicyDefinition {
  id: string;
  name: string;
  trigger: string;
  action: string;
  chainsTo?: string;
}

export interface SagaDefinition {
  id: string;
  name: string;
  trigger: string;
  states: string[];
  compensation: string;
  timeout: string;
}
