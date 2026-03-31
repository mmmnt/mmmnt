/**
 * VizDataEnvelope — Bounded-context crossing contract
 *
 * The event shape that crosses from Moment (producer) to the visualization
 * consumer. Both sides develop against this contract independently.
 * The consumer-side server infrastructure is built laterally.
 */

import type { ContextMapLayout } from './context-map-layout.js';
import type { TimelineLayout } from './timeline-layout.js';

/**
 * Session identifier for a visualization connection.
 * Establishes identity between Moment CLI and the visualization consumer.
 */
export interface VizSessionConfig {
  readonly sessionId: string;
  readonly specificationName: string;
  readonly startedAt: string;
  readonly endpoint?: string;
  readonly authToken?: string;
}

/**
 * The data payload that crosses the bounded-context boundary.
 * Contains everything the visualization consumer needs to render.
 */
export interface VizDataEnvelope {
  readonly sessionId: string;
  /** When this envelope was emitted by the producer (event emission time). */
  readonly timestamp: string;
  readonly version: number;
  readonly contextMap: ContextMapLayout;
  readonly timeline: TimelineLayout;
  readonly metadata: VizEnvelopeMetadata;
}

export interface VizEnvelopeMetadata {
  readonly contextCount: number;
  readonly flowCount: number;
  readonly relationshipCount: number;
  /** When the topology/layouts were generated from IR (may differ from envelope emission time). */
  readonly generatedAt: string;
  readonly specificationHash?: string;
}

/**
 * Discriminated union of transmission event types.
 * Defines the protocol for communication across the boundary.
 */
export type VizTransmissionEvent = VizInitialLoad | VizIncrementalUpdate | VizSessionClose;

export interface VizInitialLoad {
  readonly type: 'viz:initial-load';
  readonly session: VizSessionConfig;
  readonly envelope: VizDataEnvelope;
}

export interface VizIncrementalUpdate {
  readonly type: 'viz:incremental-update';
  readonly sessionId: string;
  readonly envelope: VizDataEnvelope;
  readonly changedFiles: readonly string[];
}

export interface VizSessionClose {
  readonly type: 'viz:session-close';
  readonly sessionId: string;
  readonly closedAt: string;
  readonly reason: 'user-initiated' | 'error' | 'timeout';
}
