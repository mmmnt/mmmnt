/**
 * VizEmitter — Moment-side envelope production
 *
 * Produces VizDataEnvelope from IR + rendered layouts.
 * Does NOT transmit — that's the connection layer's job.
 * This is the Moment-side emission point at the bounded-context boundary.
 */

import type { IntermediateRepresentation } from '@mmmnt/core';
import { renderContextMap } from '../renderers/index.js';
import { renderTimeline } from '../renderers/index.js';
import type {
  VizDataEnvelope,
  VizSessionConfig,
  VizInitialLoad,
  VizIncrementalUpdate,
} from '../types/index.js';

export class VizEmitter {
  createEnvelope(
    ir: IntermediateRepresentation,
    sessionId: string,
    version: number,
  ): VizDataEnvelope {
    const contextMap = renderContextMap(ir);
    const timeline = renderTimeline(ir);
    const now = new Date().toISOString();

    return {
      sessionId,
      timestamp: now,
      version,
      contextMap,
      timeline,
      metadata: {
        contextCount: ir.contexts.length,
        flowCount: ir.flows.length,
        relationshipCount: ir.relationships.length,
        generatedAt: now,
      },
    };
  }

  createInitialLoad(ir: IntermediateRepresentation, session: VizSessionConfig): VizInitialLoad {
    const envelope = this.createEnvelope(ir, session.sessionId, 1);
    return {
      type: 'viz:initial-load',
      session,
      envelope,
    };
  }

  createIncrementalUpdate(
    ir: IntermediateRepresentation,
    sessionId: string,
    version: number,
    changedFiles: readonly string[],
  ): VizIncrementalUpdate {
    const envelope = this.createEnvelope(ir, sessionId, version);
    return {
      type: 'viz:incremental-update',
      sessionId,
      envelope,
      changedFiles,
    };
  }
}
