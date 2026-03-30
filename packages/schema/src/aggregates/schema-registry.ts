/**
 * SchemaRegistry Aggregate
 *
 * Persisted to: .domain/schema-registry.jsonl
 * Four-phase field lifecycle: Active → Deprecated → EndOfLife → Removed
 */

import type {
  FieldDefinition,
  FieldPhase,
  SchemaRegistryEvent,
  EventSchemaRegistered,
  EventFieldDeprecated,
  EventFieldEndOfLife,
  EventFieldRemoved,
} from '../events/schema-registry-events.js';

export interface RegisterEventSchemaInput {
  readonly eventType: string;
  readonly version: string;
  readonly fieldDefinitions: readonly FieldDefinition[];
  readonly registeredBy: string;
}

export interface DeprecateFieldInput {
  readonly eventType: string;
  readonly fieldName: string;
  readonly deprecatedSince: string;
  readonly reason: string;
  readonly replacement: string;
  readonly removalTarget?: string;
}

export interface ConfirmEndOfLifeInput {
  readonly eventType: string;
  readonly fieldName: string;
  readonly confirmedBy: string;
  readonly hasActiveConsumers: boolean;
}

export interface RemoveFieldInput {
  readonly eventType: string;
  readonly fieldName: string;
  readonly removedBy: string;
  readonly rationale: string;
  readonly hasActiveConsumers: boolean;
}

interface SchemaEntry {
  readonly eventType: string;
  readonly version: string;
  readonly fieldDefinitions: readonly FieldDefinition[];
  readonly registeredBy: string;
  readonly isGA: boolean;
}

interface FieldState {
  phase: FieldPhase;
}

function isPreGA(version: string): boolean {
  const major = parseInt(version.split('.')[0], 10);
  return !Number.isNaN(major) && major < 1;
}

export class SchemaRegistry {
  private readonly schemas: Map<string, SchemaEntry> = new Map();
  private readonly fieldStates: Map<string, FieldState> = new Map();

  private schemaKey(eventType: string, version: string): string {
    return `${eventType}@${version}`;
  }

  private fieldKey(eventType: string, fieldName: string): string {
    return `${eventType}:${fieldName}`;
  }

  /**
   * SR-01: Register a new schema version. Schemas are immutable — same eventType+version rejected.
   * SR-05: Pre-GA schemas are additive-only.
   */
  registerEventSchema(input: RegisterEventSchemaInput): EventSchemaRegistered {
    const key = this.schemaKey(input.eventType, input.version);
    if (this.schemas.has(key)) {
      throw new Error(
        `SR-01: Schema '${input.eventType}@${input.version}' is already registered and immutable`,
      );
    }

    // SR-05: pre-GA breaking change detection
    if (isPreGA(input.version)) {
      this.assertPreGAAdditiveOnly(input.eventType, input.fieldDefinitions);
    }

    const event: EventSchemaRegistered = {
      type: 'EventSchemaRegistered',
      eventType: input.eventType,
      version: input.version,
      fieldDefinitions: input.fieldDefinitions,
      registeredBy: input.registeredBy,
      timestamp: new Date().toISOString(),
    };

    this.apply(event);
    return event;
  }

  /**
   * SR-03: Deprecation must provide reason and replacement guidance.
   * SR-04: Field must be in Active phase.
   */
  deprecateField(input: DeprecateFieldInput): EventFieldDeprecated {
    if (!input.reason || input.reason.trim() === '') {
      throw new Error(`SR-03: Deprecation of '${input.fieldName}' requires a reason`);
    }
    if (!input.replacement || input.replacement.trim() === '') {
      throw new Error(`SR-03: Deprecation of '${input.fieldName}' requires replacement guidance`);
    }

    this.assertFieldInPhase(input.eventType, input.fieldName, 'active');

    const event: EventFieldDeprecated = {
      type: 'EventFieldDeprecated',
      eventType: input.eventType,
      fieldName: input.fieldName,
      deprecatedSince: input.deprecatedSince,
      reason: input.reason,
      replacement: input.replacement,
      removalTarget: input.removalTarget,
      timestamp: new Date().toISOString(),
    };

    this.apply(event);
    return event;
  }

  /**
   * SR-02: Zero consumption required for end-of-life confirmation.
   * SR-04: Field must be in Deprecated phase.
   */
  confirmEndOfLife(input: ConfirmEndOfLifeInput): EventFieldEndOfLife {
    this.assertFieldInPhase(input.eventType, input.fieldName, 'deprecated');

    if (input.hasActiveConsumers) {
      throw new Error(
        `SR-02: Cannot confirm end-of-life for '${input.fieldName}' — active consumers exist`,
      );
    }

    const event: EventFieldEndOfLife = {
      type: 'EventFieldEndOfLife',
      eventType: input.eventType,
      fieldName: input.fieldName,
      confirmedBy: input.confirmedBy,
      timestamp: new Date().toISOString(),
    };

    this.apply(event);
    return event;
  }

  /**
   * SR-02: Zero consumption required for field removal.
   * SR-04: Field must be in EndOfLife phase.
   */
  removeField(input: RemoveFieldInput): EventFieldRemoved {
    this.assertFieldInPhase(input.eventType, input.fieldName, 'end-of-life');

    if (input.hasActiveConsumers) {
      throw new Error(`SR-02: Cannot remove field '${input.fieldName}' — active consumers exist`);
    }

    const event: EventFieldRemoved = {
      type: 'EventFieldRemoved',
      eventType: input.eventType,
      fieldName: input.fieldName,
      removedBy: input.removedBy,
      rationale: input.rationale,
      timestamp: new Date().toISOString(),
    };

    this.apply(event);
    return event;
  }

  /**
   * Apply a domain event to update internal state (event sourcing replay).
   * Enforces all invariants during replay to detect corrupted streams.
   */
  apply(event: SchemaRegistryEvent): void {
    switch (event.type) {
      case 'EventSchemaRegistered':
        this.applySchemaRegistered(event);
        break;
      case 'EventFieldDeprecated':
        this.applyFieldDeprecated(event);
        break;
      case 'EventFieldEndOfLife':
        this.applyFieldEndOfLife(event);
        break;
      case 'EventFieldRemoved':
        this.applyFieldRemoved(event);
        break;
      default: {
        const exhaustive: never = event;
        throw new Error(`SR-06: Unknown event type '${(exhaustive as { type: string }).type}'`);
      }
    }
  }

  private applySchemaRegistered(event: EventSchemaRegistered): void {
    const key = this.schemaKey(event.eventType, event.version);
    if (this.schemas.has(key)) {
      throw new Error(
        `SR-01: Duplicate schema '${event.eventType}@${event.version}' in event stream`,
      );
    }
    if (isPreGA(event.version)) {
      this.assertPreGAAdditiveOnly(event.eventType, event.fieldDefinitions);
    }
    this.schemas.set(key, {
      eventType: event.eventType,
      version: event.version,
      fieldDefinitions: event.fieldDefinitions,
      registeredBy: event.registeredBy,
      isGA: !isPreGA(event.version),
    });
    for (const field of event.fieldDefinitions) {
      const fk = this.fieldKey(event.eventType, field.fieldName);
      if (!this.fieldStates.has(fk)) {
        this.fieldStates.set(fk, { phase: 'active' });
      }
    }
  }

  private applyFieldDeprecated(event: EventFieldDeprecated): void {
    this.assertFieldInPhase(event.eventType, event.fieldName, 'active');
    if (!event.reason || event.reason.trim() === '') {
      throw new Error(`SR-03: Deprecation reason is required for field '${event.fieldName}'`);
    }
    if (!event.replacement || event.replacement.trim() === '') {
      throw new Error(`SR-03: Deprecation replacement is required for field '${event.fieldName}'`);
    }
    this.fieldStates.set(this.fieldKey(event.eventType, event.fieldName), {
      phase: 'deprecated',
    });
  }

  private applyFieldEndOfLife(event: EventFieldEndOfLife): void {
    this.assertFieldInPhase(event.eventType, event.fieldName, 'deprecated');
    this.fieldStates.set(this.fieldKey(event.eventType, event.fieldName), {
      phase: 'end-of-life',
    });
  }

  private applyFieldRemoved(event: EventFieldRemoved): void {
    this.assertFieldInPhase(event.eventType, event.fieldName, 'end-of-life');
    this.fieldStates.set(this.fieldKey(event.eventType, event.fieldName), { phase: 'removed' });
  }

  getFieldPhase(eventType: string, fieldName: string): FieldPhase | undefined {
    return this.fieldStates.get(this.fieldKey(eventType, fieldName))?.phase;
  }

  hasSchema(eventType: string, version: string): boolean {
    return this.schemas.has(this.schemaKey(eventType, version));
  }

  getRegisteredEventTypes(): string[] {
    const types = new Set<string>();
    for (const entry of this.schemas.values()) {
      types.add(entry.eventType);
    }
    return [...types];
  }

  private assertFieldInPhase(
    eventType: string,
    fieldName: string,
    expectedPhase: FieldPhase,
  ): void {
    const fk = this.fieldKey(eventType, fieldName);
    const state = this.fieldStates.get(fk);
    if (!state) {
      throw new Error(`Field '${fieldName}' not found in event type '${eventType}'`);
    }
    if (state.phase !== expectedPhase) {
      throw new Error(
        `SR-04: Field '${fieldName}' is in '${state.phase}' phase, expected '${expectedPhase}'`,
      );
    }
  }

  private assertPreGAAdditiveOnly(eventType: string, newFields: readonly FieldDefinition[]): void {
    // Collect all fields ever defined across all versions of this event type
    const existingFields = this.getAllFieldNames(eventType);
    if (existingFields.size === 0) return; // First registration — always allowed

    const newFieldNames = new Set(newFields.map((f) => f.fieldName));
    for (const existing of existingFields) {
      if (!newFieldNames.has(existing)) {
        throw new Error(
          `SR-05: Pre-GA schema for '${eventType}' cannot remove field '${existing}' — additive-only`,
        );
      }
    }
  }

  private getAllFieldNames(eventType: string): Set<string> {
    const fields = new Set<string>();
    for (const [key, entry] of this.schemas.entries()) {
      if (key.startsWith(`${eventType}@`)) {
        for (const f of entry.fieldDefinitions) {
          fields.add(f.fieldName);
        }
      }
    }
    return fields;
  }
}
