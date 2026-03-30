import { describe, it, expect } from 'vitest';
import { SchemaRegistry } from './schema-registry.js';
import type { FieldDefinition } from '../events/schema-registry-events.js';

function makeFields(names: string[] = ['userId', 'email']): FieldDefinition[] {
  return names.map((name) => ({ fieldName: name, fieldType: 'string', required: true }));
}

describe('SchemaRegistry', () => {
  // --- RegisterEventSchema ---

  it('registers a new event schema successfully', () => {
    const registry = new SchemaRegistry();
    const event = registry.registerEventSchema({
      eventType: 'UserCreated',
      version: '1.0.0',
      fieldDefinitions: makeFields(),
      registeredBy: 'admin',
    });

    expect(event.type).toBe('EventSchemaRegistered');
    expect(event.eventType).toBe('UserCreated');
    expect(event.version).toBe('1.0.0');
    expect(registry.hasSchema('UserCreated', '1.0.0')).toBe(true);
  });

  it('SR-01: rejects re-registration of same eventType+version (immutable)', () => {
    const registry = new SchemaRegistry();
    registry.registerEventSchema({
      eventType: 'UserCreated',
      version: '1.0.0',
      fieldDefinitions: makeFields(),
      registeredBy: 'admin',
    });

    expect(() =>
      registry.registerEventSchema({
        eventType: 'UserCreated',
        version: '1.0.0',
        fieldDefinitions: makeFields(['name']),
        registeredBy: 'admin',
      }),
    ).toThrow('SR-01');
  });

  it('allows registering a new version of the same event type', () => {
    const registry = new SchemaRegistry();
    registry.registerEventSchema({
      eventType: 'UserCreated',
      version: '1.0.0',
      fieldDefinitions: makeFields(),
      registeredBy: 'admin',
    });
    registry.registerEventSchema({
      eventType: 'UserCreated',
      version: '1.1.0',
      fieldDefinitions: makeFields(['userId', 'email', 'name']),
      registeredBy: 'admin',
    });

    expect(registry.hasSchema('UserCreated', '1.0.0')).toBe(true);
    expect(registry.hasSchema('UserCreated', '1.1.0')).toBe(true);
  });

  // --- SR-05: Pre-GA additive-only ---

  it('SR-05: allows additive fields in pre-GA schemas', () => {
    const registry = new SchemaRegistry();
    registry.registerEventSchema({
      eventType: 'UserCreated',
      version: '0.1.0',
      fieldDefinitions: makeFields(['userId']),
      registeredBy: 'admin',
    });

    const event = registry.registerEventSchema({
      eventType: 'UserCreated',
      version: '0.2.0',
      fieldDefinitions: makeFields(['userId', 'email']),
      registeredBy: 'admin',
    });

    expect(event.type).toBe('EventSchemaRegistered');
  });

  it('SR-05: rejects field removal in pre-GA schemas', () => {
    const registry = new SchemaRegistry();
    registry.registerEventSchema({
      eventType: 'UserCreated',
      version: '0.1.0',
      fieldDefinitions: makeFields(['userId', 'email']),
      registeredBy: 'admin',
    });

    expect(() =>
      registry.registerEventSchema({
        eventType: 'UserCreated',
        version: '0.2.0',
        fieldDefinitions: makeFields(['userId']),
        registeredBy: 'admin',
      }),
    ).toThrow('SR-05');
  });

  // --- DeprecateField ---

  it('SR-03: deprecates a field with reason and replacement', () => {
    const registry = new SchemaRegistry();
    registry.registerEventSchema({
      eventType: 'UserCreated',
      version: '1.0.0',
      fieldDefinitions: makeFields(),
      registeredBy: 'admin',
    });

    const event = registry.deprecateField({
      eventType: 'UserCreated',
      fieldName: 'email',
      deprecatedSince: '1.1.0',
      reason: 'Moving to contact info object',
      replacement: 'contactInfo.email',
    });

    expect(event.type).toBe('EventFieldDeprecated');
    expect(registry.getFieldPhase('UserCreated', 'email')).toBe('deprecated');
  });

  it('SR-03: rejects deprecation without reason', () => {
    const registry = new SchemaRegistry();
    registry.registerEventSchema({
      eventType: 'UserCreated',
      version: '1.0.0',
      fieldDefinitions: makeFields(),
      registeredBy: 'admin',
    });

    expect(() =>
      registry.deprecateField({
        eventType: 'UserCreated',
        fieldName: 'email',
        deprecatedSince: '1.1.0',
        reason: '',
        replacement: 'contactInfo.email',
      }),
    ).toThrow('SR-03');
  });

  it('SR-03: rejects deprecation without replacement guidance', () => {
    const registry = new SchemaRegistry();
    registry.registerEventSchema({
      eventType: 'UserCreated',
      version: '1.0.0',
      fieldDefinitions: makeFields(),
      registeredBy: 'admin',
    });

    expect(() =>
      registry.deprecateField({
        eventType: 'UserCreated',
        fieldName: 'email',
        deprecatedSince: '1.1.0',
        reason: 'Moving to contact info',
        replacement: '',
      }),
    ).toThrow('SR-03');
  });

  it('SR-04: rejects deprecation of non-active field', () => {
    const registry = new SchemaRegistry();
    registry.registerEventSchema({
      eventType: 'UserCreated',
      version: '1.0.0',
      fieldDefinitions: makeFields(),
      registeredBy: 'admin',
    });
    registry.deprecateField({
      eventType: 'UserCreated',
      fieldName: 'email',
      deprecatedSince: '1.1.0',
      reason: 'Moving',
      replacement: 'contactInfo.email',
    });

    expect(() =>
      registry.deprecateField({
        eventType: 'UserCreated',
        fieldName: 'email',
        deprecatedSince: '1.2.0',
        reason: 'Again',
        replacement: 'contactInfo.email',
      }),
    ).toThrow('SR-04');
  });

  // --- ConfirmEndOfLife ---

  it('confirms end-of-life for a deprecated field with zero consumers', () => {
    const registry = new SchemaRegistry();
    registry.registerEventSchema({
      eventType: 'UserCreated',
      version: '1.0.0',
      fieldDefinitions: makeFields(),
      registeredBy: 'admin',
    });
    registry.deprecateField({
      eventType: 'UserCreated',
      fieldName: 'email',
      deprecatedSince: '1.1.0',
      reason: 'Moving',
      replacement: 'contactInfo.email',
    });

    const event = registry.confirmEndOfLife({
      eventType: 'UserCreated',
      fieldName: 'email',
      confirmedBy: 'admin',
      hasActiveConsumers: false,
    });

    expect(event.type).toBe('EventFieldEndOfLife');
    expect(registry.getFieldPhase('UserCreated', 'email')).toBe('end-of-life');
  });

  it('SR-02: rejects end-of-life with active consumers', () => {
    const registry = new SchemaRegistry();
    registry.registerEventSchema({
      eventType: 'UserCreated',
      version: '1.0.0',
      fieldDefinitions: makeFields(),
      registeredBy: 'admin',
    });
    registry.deprecateField({
      eventType: 'UserCreated',
      fieldName: 'email',
      deprecatedSince: '1.1.0',
      reason: 'Moving',
      replacement: 'contactInfo.email',
    });

    expect(() =>
      registry.confirmEndOfLife({
        eventType: 'UserCreated',
        fieldName: 'email',
        confirmedBy: 'admin',
        hasActiveConsumers: true,
      }),
    ).toThrow('SR-02');
  });

  it('SR-04: rejects end-of-life for active field (phase skipping)', () => {
    const registry = new SchemaRegistry();
    registry.registerEventSchema({
      eventType: 'UserCreated',
      version: '1.0.0',
      fieldDefinitions: makeFields(),
      registeredBy: 'admin',
    });

    expect(() =>
      registry.confirmEndOfLife({
        eventType: 'UserCreated',
        fieldName: 'email',
        confirmedBy: 'admin',
        hasActiveConsumers: false,
      }),
    ).toThrow('SR-04');
  });

  // --- RemoveField ---

  it('removes a field in end-of-life phase with zero consumers', () => {
    const registry = new SchemaRegistry();
    registry.registerEventSchema({
      eventType: 'UserCreated',
      version: '1.0.0',
      fieldDefinitions: makeFields(),
      registeredBy: 'admin',
    });
    registry.deprecateField({
      eventType: 'UserCreated',
      fieldName: 'email',
      deprecatedSince: '1.1.0',
      reason: 'Moving',
      replacement: 'contactInfo.email',
    });
    registry.confirmEndOfLife({
      eventType: 'UserCreated',
      fieldName: 'email',
      confirmedBy: 'admin',
      hasActiveConsumers: false,
    });

    const event = registry.removeField({
      eventType: 'UserCreated',
      fieldName: 'email',
      removedBy: 'admin',
      rationale: 'Migration complete',
      hasActiveConsumers: false,
    });

    expect(event.type).toBe('EventFieldRemoved');
    expect(registry.getFieldPhase('UserCreated', 'email')).toBe('removed');
  });

  it('SR-02: rejects removal with active consumers', () => {
    const registry = new SchemaRegistry();
    registry.registerEventSchema({
      eventType: 'UserCreated',
      version: '1.0.0',
      fieldDefinitions: makeFields(),
      registeredBy: 'admin',
    });
    registry.deprecateField({
      eventType: 'UserCreated',
      fieldName: 'email',
      deprecatedSince: '1.1.0',
      reason: 'Moving',
      replacement: 'contactInfo.email',
    });
    registry.confirmEndOfLife({
      eventType: 'UserCreated',
      fieldName: 'email',
      confirmedBy: 'admin',
      hasActiveConsumers: false,
    });

    expect(() =>
      registry.removeField({
        eventType: 'UserCreated',
        fieldName: 'email',
        removedBy: 'admin',
        rationale: 'Done',
        hasActiveConsumers: true,
      }),
    ).toThrow('SR-02');
  });

  it('SR-04: rejects removal of active field (phase skipping Active→Removed)', () => {
    const registry = new SchemaRegistry();
    registry.registerEventSchema({
      eventType: 'UserCreated',
      version: '1.0.0',
      fieldDefinitions: makeFields(),
      registeredBy: 'admin',
    });

    expect(() =>
      registry.removeField({
        eventType: 'UserCreated',
        fieldName: 'email',
        removedBy: 'admin',
        rationale: 'Skip phases',
        hasActiveConsumers: false,
      }),
    ).toThrow('SR-04');
  });

  // --- Full lifecycle ---

  it('SR-04: full four-phase lifecycle Active → Deprecated → EndOfLife → Removed', () => {
    const registry = new SchemaRegistry();

    registry.registerEventSchema({
      eventType: 'OrderPlaced',
      version: '1.0.0',
      fieldDefinitions: makeFields(['orderId', 'legacyCode']),
      registeredBy: 'admin',
    });
    expect(registry.getFieldPhase('OrderPlaced', 'legacyCode')).toBe('active');

    registry.deprecateField({
      eventType: 'OrderPlaced',
      fieldName: 'legacyCode',
      deprecatedSince: '1.1.0',
      reason: 'Replaced by structured code',
      replacement: 'orderCode',
    });
    expect(registry.getFieldPhase('OrderPlaced', 'legacyCode')).toBe('deprecated');

    registry.confirmEndOfLife({
      eventType: 'OrderPlaced',
      fieldName: 'legacyCode',
      confirmedBy: 'admin',
      hasActiveConsumers: false,
    });
    expect(registry.getFieldPhase('OrderPlaced', 'legacyCode')).toBe('end-of-life');

    registry.removeField({
      eventType: 'OrderPlaced',
      fieldName: 'legacyCode',
      removedBy: 'admin',
      rationale: 'All consumers migrated',
      hasActiveConsumers: false,
    });
    expect(registry.getFieldPhase('OrderPlaced', 'legacyCode')).toBe('removed');
  });

  // --- Event sourcing replay ---

  it('replays events correctly to rebuild state', () => {
    const r1 = new SchemaRegistry();
    const e1 = r1.registerEventSchema({
      eventType: 'UserCreated',
      version: '1.0.0',
      fieldDefinitions: makeFields(),
      registeredBy: 'admin',
    });
    const e2 = r1.deprecateField({
      eventType: 'UserCreated',
      fieldName: 'email',
      deprecatedSince: '1.1.0',
      reason: 'Moving',
      replacement: 'contactInfo.email',
    });

    const r2 = new SchemaRegistry();
    r2.apply(e1);
    r2.apply(e2);

    expect(r2.hasSchema('UserCreated', '1.0.0')).toBe(true);
    expect(r2.getFieldPhase('UserCreated', 'email')).toBe('deprecated');
    expect(r2.getFieldPhase('UserCreated', 'userId')).toBe('active');
  });

  it('returns registered event types', () => {
    const registry = new SchemaRegistry();
    registry.registerEventSchema({
      eventType: 'UserCreated',
      version: '1.0.0',
      fieldDefinitions: makeFields(),
      registeredBy: 'admin',
    });
    registry.registerEventSchema({
      eventType: 'OrderPlaced',
      version: '1.0.0',
      fieldDefinitions: makeFields(['orderId']),
      registeredBy: 'admin',
    });

    const types = registry.getRegisteredEventTypes();
    expect(types).toContain('UserCreated');
    expect(types).toContain('OrderPlaced');
    expect(types).toHaveLength(2);
  });
});
