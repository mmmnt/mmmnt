import type {
  IntermediateRepresentation,
  FlowDefinition,
  FrameDefinition,
  FrameEntry,
} from '@mmmnt/core';
import type { ReplayResult, DivergencePoint } from './types/index.js';

/**
 * EventReplayEngine replays IR-defined event flows across contexts,
 * detects divergence points where actual behavior deviates from specification,
 * and returns a ReplayResult with full divergence detail.
 *
 * Infrastructure-agnostic (Design Principle #6).
 */
export class EventReplayEngine {
  replay(flow: FlowDefinition, ir: IntermediateRepresentation): ReplayResult {
    if (flow.frames.length === 0) {
      return {
        flowId: flow.id,
        stepsReplayed: 0,
        divergencePoints: [],
        finalStateMatch: true,
      };
    }

    const contextIndex = new Map(ir.contexts.map((c) => [c.id, c]));
    const divergencePoints: DivergencePoint[] = [];
    let stepsReplayed = 0;

    for (let i = 0; i < flow.frames.length; i++) {
      const frame = flow.frames[i];
      stepsReplayed++;

      const divergence = this.evaluateFrame(frame, i, contextIndex);
      if (divergence) {
        divergencePoints.push(divergence);
      }
    }

    const finalStateMatch = divergencePoints.length === 0;

    return {
      flowId: flow.id,
      stepsReplayed,
      divergencePoints,
      finalStateMatch,
    };
  }

  private evaluateFrame(
    frame: FrameDefinition,
    frameIndex: number,
    contextIndex: ReadonlyMap<string, { id: string; name: string }>,
  ): DivergencePoint | undefined {
    // Check main context entries
    const mainDivergence = this.checkEntries(frame.contextEntries, frameIndex, contextIndex);
    if (mainDivergence) {
      return mainDivergence;
    }

    // Check branch entries
    if (frame.branches) {
      for (const branch of frame.branches) {
        const branchDivergence = this.checkEntries(branch.entries, frameIndex, contextIndex);
        if (branchDivergence) {
          return branchDivergence;
        }
      }
    }

    return undefined;
  }

  private checkEntries(
    entries: readonly FrameEntry[],
    frameIndex: number,
    contextIndex: ReadonlyMap<string, { id: string; name: string }>,
  ): DivergencePoint | undefined {
    for (const entry of entries) {
      const context = contextIndex.get(entry.contextId);
      if (!context) {
        return {
          frameIndex,
          expectedState: `context ${entry.contextId} exists`,
          actualState: `context ${entry.contextId} not found`,
          eventThatCaused: entry.nodeName,
        };
      }
    }
    return undefined;
  }
}
