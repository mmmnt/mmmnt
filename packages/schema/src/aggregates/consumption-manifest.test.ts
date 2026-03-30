import { describe, it, expect } from 'vitest';
import { ConsumptionManifest } from './consumption-manifest.js';
import { SchemaRegistry } from './schema-registry.js';

function setupRegistry(): SchemaRegistry {
  const registry = new SchemaRegistry();
  registry.registerEventSchema({
    eventType: 'UserCreated',
    version: '1.0.0',
    fieldDefinitions: [
      { fieldName: 'userId', fieldType: 'string', required: true },
      { fieldName: 'email', fieldType: 'string', required: true },
    ],
    registeredBy: 'admin',
  });
  registry.registerEventSchema({
    eventType: 'OrderPlaced',
    version: '1.0.0',
    fieldDefinitions: [{ fieldName: 'orderId', fieldType: 'string', required: true }],
    registeredBy: 'admin',
  });
  return registry;
}

describe('ConsumptionManifest', () => {
  it('declares consumption for a valid event type', () => {
    const manifest = new ConsumptionManifest();
    const registry = setupRegistry();

    const event = manifest.declareConsumption(
      {
        projectionId: 'proj-1',
        projectionName: 'UserDashboard',
        product: 'moment',
        consumedEvents: [{ eventType: 'UserCreated', fields: ['userId', 'email'] }],
      },
      registry,
    );

    expect(event.type).toBe('ProjectionConsumptionDeclared');
    expect(event.projectionId).toBe('proj-1');
    expect(manifest.getDeclaration('proj-1')).toBeDefined();
  });

  it('CM-01: rejects declaration with unregistered event type', () => {
    const manifest = new ConsumptionManifest();
    const registry = setupRegistry();

    expect(() =>
      manifest.declareConsumption(
        {
          projectionId: 'proj-1',
          projectionName: 'BadProjection',
          product: 'moment',
          consumedEvents: [{ eventType: 'NonExistent', fields: ['foo'] }],
        },
        registry,
      ),
    ).toThrow('CM-01');
  });

  it('CM-02: new declaration supersedes previous for same projectionId', () => {
    const manifest = new ConsumptionManifest();
    const registry = setupRegistry();

    manifest.declareConsumption(
      {
        projectionId: 'proj-1',
        projectionName: 'UserDashboard',
        product: 'moment',
        consumedEvents: [{ eventType: 'UserCreated', fields: ['userId'] }],
      },
      registry,
    );

    manifest.declareConsumption(
      {
        projectionId: 'proj-1',
        projectionName: 'UserDashboard v2',
        product: 'moment',
        consumedEvents: [{ eventType: 'UserCreated', fields: ['userId', 'email'] }],
      },
      registry,
    );

    const decl = manifest.getDeclaration('proj-1');
    expect(decl?.projectionName).toBe('UserDashboard v2');
    expect(decl?.consumedEvents[0].fields).toEqual(['userId', 'email']);
  });

  it('provides zero-consumption proof when no consumers exist for a field', () => {
    const manifest = new ConsumptionManifest();

    expect(manifest.hasZeroConsumers('UserCreated', 'email')).toBe(true);
  });

  it('reports non-zero consumers when a projection consumes the field', () => {
    const manifest = new ConsumptionManifest();
    const registry = setupRegistry();

    manifest.declareConsumption(
      {
        projectionId: 'proj-1',
        projectionName: 'UserDashboard',
        product: 'moment',
        consumedEvents: [{ eventType: 'UserCreated', fields: ['userId', 'email'] }],
      },
      registry,
    );

    expect(manifest.hasZeroConsumers('UserCreated', 'email')).toBe(false);
    expect(manifest.hasZeroConsumers('UserCreated', 'userId')).toBe(false);
    expect(manifest.hasZeroConsumers('OrderPlaced', 'orderId')).toBe(true);
  });

  it('returns consumers for a specific event type and field', () => {
    const manifest = new ConsumptionManifest();
    const registry = setupRegistry();

    manifest.declareConsumption(
      {
        projectionId: 'proj-1',
        projectionName: 'UserDashboard',
        product: 'moment',
        consumedEvents: [{ eventType: 'UserCreated', fields: ['email'] }],
      },
      registry,
    );

    manifest.declareConsumption(
      {
        projectionId: 'proj-2',
        projectionName: 'OrderView',
        product: 'moment',
        consumedEvents: [{ eventType: 'OrderPlaced', fields: ['orderId'] }],
      },
      registry,
    );

    const consumers = manifest.getConsumers('UserCreated', 'email');
    expect(consumers).toHaveLength(1);
    expect(consumers[0].projectionId).toBe('proj-1');

    expect(manifest.getConsumers('UserCreated', 'userId')).toHaveLength(0);
  });

  it('replays events correctly to rebuild state', () => {
    const manifest1 = new ConsumptionManifest();
    const registry = setupRegistry();

    const e1 = manifest1.declareConsumption(
      {
        projectionId: 'proj-1',
        projectionName: 'Dashboard',
        product: 'moment',
        consumedEvents: [{ eventType: 'UserCreated', fields: ['userId'] }],
      },
      registry,
    );

    const manifest2 = new ConsumptionManifest();
    manifest2.apply(e1);

    expect(manifest2.getDeclaration('proj-1')?.projectionName).toBe('Dashboard');
    expect(manifest2.hasZeroConsumers('UserCreated', 'userId')).toBe(false);
  });

  it('zero-consumption proof updates after superseding declaration removes field', () => {
    const manifest = new ConsumptionManifest();
    const registry = setupRegistry();

    manifest.declareConsumption(
      {
        projectionId: 'proj-1',
        projectionName: 'Dashboard',
        product: 'moment',
        consumedEvents: [{ eventType: 'UserCreated', fields: ['userId', 'email'] }],
      },
      registry,
    );

    expect(manifest.hasZeroConsumers('UserCreated', 'email')).toBe(false);

    // Supersede: remove email from consumed fields
    manifest.declareConsumption(
      {
        projectionId: 'proj-1',
        projectionName: 'Dashboard v2',
        product: 'moment',
        consumedEvents: [{ eventType: 'UserCreated', fields: ['userId'] }],
      },
      registry,
    );

    expect(manifest.hasZeroConsumers('UserCreated', 'email')).toBe(true);
    expect(manifest.hasZeroConsumers('UserCreated', 'userId')).toBe(false);
  });
});
