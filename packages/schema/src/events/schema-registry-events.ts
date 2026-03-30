export type FieldPhase = 'active' | 'deprecated' | 'end-of-life' | 'removed';

export interface FieldDefinition {
  readonly fieldName: string;
  readonly fieldType: string;
  readonly required: boolean;
}

export interface EventSchemaRegistered {
  readonly type: 'EventSchemaRegistered';
  readonly eventType: string;
  readonly version: string;
  readonly fieldDefinitions: readonly FieldDefinition[];
  readonly registeredBy: string;
  readonly timestamp: string;
}

export interface EventFieldDeprecated {
  readonly type: 'EventFieldDeprecated';
  readonly eventType: string;
  readonly fieldName: string;
  readonly deprecatedSince: string;
  readonly reason: string;
  readonly replacement: string;
  readonly removalTarget?: string;
  readonly timestamp: string;
}

export interface EventFieldEndOfLife {
  readonly type: 'EventFieldEndOfLife';
  readonly eventType: string;
  readonly fieldName: string;
  readonly confirmedBy: string;
  readonly timestamp: string;
}

export interface EventFieldRemoved {
  readonly type: 'EventFieldRemoved';
  readonly eventType: string;
  readonly fieldName: string;
  readonly removedBy: string;
  readonly rationale: string;
  readonly timestamp: string;
}

export type SchemaRegistryEvent =
  | EventSchemaRegistered
  | EventFieldDeprecated
  | EventFieldEndOfLife
  | EventFieldRemoved;
