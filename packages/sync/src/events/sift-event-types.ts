/**
 * Sift Published Language Event Types — Phase 1 (Building Blocks)
 *
 * Per ADR-028: JSONL event files in .domain/ conforming to ComplaiEventEnvelope (ADR-021).
 * One JSONL file per bounded context. Each line is a SiftEventEnvelope.
 *
 * Phase 2 (Event Storming timeline events) deferred until SIFT-1 resolves.
 */

// ---------------------------------------------------------------------------
// ComplaiEventEnvelope — canonical envelope per ADR-021
// ---------------------------------------------------------------------------

export interface SiftEventEnvelope<T extends SiftEventPayload = SiftEventPayload> {
  readonly eventId: string;
  readonly eventType: SiftEventType;
  readonly version: number;
  readonly productSource: 'sift';
  readonly sessionId: string;
  readonly causationEventIds: readonly string[];
  readonly correlationId: string;
  readonly timestamp: string;
  readonly payload: T;
}

// ---------------------------------------------------------------------------
// Event types — Phase 1 building blocks per ADR-017 + ADR-028
// ---------------------------------------------------------------------------

export type SiftEventType =
  | 'BoundedContextDefined'
  | 'AggregateAdded'
  | 'CommandDefined'
  | 'EventDefined'
  | 'ValueObjectDefined'
  | 'InvariantDefined'
  | 'PolicyDefined'
  | 'SagaDefined';

// ---------------------------------------------------------------------------
// Payload interfaces — one per event type
// ---------------------------------------------------------------------------

export interface BoundedContextDefinedPayload {
  readonly contextName: string;
  readonly classification?: 'Core' | 'Supporting' | 'Generic';
}

export interface AggregateAddedPayload {
  readonly contextName: string;
  readonly aggregateName: string;
  readonly identityField: { readonly name: string; readonly type: string };
}

export interface CommandDefinedPayload {
  readonly contextName: string;
  readonly aggregateName: string;
  readonly commandName: string;
  readonly inputs: readonly { readonly name: string; readonly type: string }[];
  readonly emitsEvent: string;
  readonly preconditions?: readonly { readonly name: string; readonly description: string }[];
}

export interface EventDefinedPayload {
  readonly contextName: string;
  readonly aggregateName: string;
  readonly eventName: string;
  readonly fields: readonly {
    readonly name: string;
    readonly type: string;
    readonly deprecated?: { readonly reason: string; readonly replacement: string };
  }[];
}

export interface ValueObjectDefinedPayload {
  readonly contextName: string;
  readonly aggregateName: string;
  readonly voName: string;
  readonly fields: readonly { readonly name: string; readonly type: string }[];
}

export interface InvariantDefinedPayload {
  readonly contextName: string;
  readonly invariantId: string;
  readonly description: string;
  readonly scope: string;
}

export interface PolicyDefinedPayload {
  readonly contextName: string;
  readonly policyName: string;
  readonly trigger: string;
  readonly action: string;
  readonly chainsTo?: string;
}

export interface SagaDefinedPayload {
  readonly contextName: string;
  readonly sagaName: string;
  readonly trigger: string;
  readonly states: readonly string[];
  readonly compensation: string;
  readonly timeout: string;
}

// ---------------------------------------------------------------------------
// Union of all payloads
// ---------------------------------------------------------------------------

export type SiftEventPayload =
  | BoundedContextDefinedPayload
  | AggregateAddedPayload
  | CommandDefinedPayload
  | EventDefinedPayload
  | ValueObjectDefinedPayload
  | InvariantDefinedPayload
  | PolicyDefinedPayload
  | SagaDefinedPayload;
