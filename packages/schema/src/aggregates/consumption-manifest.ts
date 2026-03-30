/**
 * ConsumptionManifest Aggregate
 *
 * Persisted to: .domain/consumption-manifest.jsonl
 * Tracks which projections consume which event fields.
 * Provides zero-consumption proof for SchemaRegistry SR-02.
 */

import type {
  ConsumedEventDeclaration,
  ConsumptionManifestEvent,
  ProjectionConsumptionDeclared,
} from '../events/consumption-manifest-events.js';
import type { SchemaRegistry } from './schema-registry.js';

export interface DeclareConsumptionInput {
  readonly projectionId: string;
  readonly projectionName: string;
  readonly product: string;
  readonly consumedEvents: readonly ConsumedEventDeclaration[];
}

export interface ConsumptionEntry {
  readonly projectionId: string;
  readonly projectionName: string;
  readonly product: string;
  readonly consumedEvents: readonly ConsumedEventDeclaration[];
}

export class ConsumptionManifest {
  private readonly declarations: Map<string, ConsumptionEntry> = new Map();

  /**
   * CM-01: Declarations must reference valid event types.
   * CM-02: New declaration for same projectionId supersedes previous.
   */
  declareConsumption(
    input: DeclareConsumptionInput,
    registry: SchemaRegistry,
  ): ProjectionConsumptionDeclared {
    // CM-01: validate all event types exist in registry
    const registeredTypes = new Set(registry.getRegisteredEventTypes());
    for (const consumed of input.consumedEvents) {
      if (!registeredTypes.has(consumed.eventType)) {
        throw new Error(
          `CM-01: Event type '${consumed.eventType}' is not registered in SchemaRegistry`,
        );
      }
    }

    const event: ProjectionConsumptionDeclared = {
      type: 'ProjectionConsumptionDeclared',
      projectionId: input.projectionId,
      projectionName: input.projectionName,
      product: input.product,
      consumedEvents: input.consumedEvents,
      timestamp: new Date().toISOString(),
    };

    this.apply(event);
    return event;
  }

  /**
   * Apply a domain event to update internal state (event sourcing replay).
   * CM-02 is inherent: Map.set supersedes previous entry for same projectionId.
   */
  apply(event: ConsumptionManifestEvent): void {
    switch (event.type) {
      case 'ProjectionConsumptionDeclared':
        // CM-02: supersedes previous declaration for same projectionId
        this.declarations.set(event.projectionId, {
          projectionId: event.projectionId,
          projectionName: event.projectionName,
          product: event.product,
          consumedEvents: event.consumedEvents,
        });
        break;
      default: {
        const exhaustive: never = event as never;
        throw new Error(`CM-03: Unknown event type '${(exhaustive as { type: string }).type}'`);
      }
    }
  }

  /**
   * Zero-consumption proof query for SchemaRegistry SR-02.
   * Returns true if no declared projections in this manifest consume the specified field.
   */
  hasZeroConsumers(eventType: string, fieldName: string): boolean {
    for (const entry of this.declarations.values()) {
      for (const consumed of entry.consumedEvents) {
        if (consumed.eventType === eventType && consumed.fields.includes(fieldName)) {
          return false;
        }
      }
    }
    return true;
  }

  /**
   * Returns all projections that consume the specified event type and field.
   */
  getConsumers(eventType: string, fieldName: string): readonly ConsumptionEntry[] {
    const consumers: ConsumptionEntry[] = [];
    for (const entry of this.declarations.values()) {
      for (const consumed of entry.consumedEvents) {
        if (consumed.eventType === eventType && consumed.fields.includes(fieldName)) {
          consumers.push(entry);
          break;
        }
      }
    }
    return consumers;
  }

  getDeclaration(projectionId: string): ConsumptionEntry | undefined {
    return this.declarations.get(projectionId);
  }
}
