import type {
  IntermediateRepresentation,
  FlowDefinition,
  MomentDefinition,
  MomentEntry,
} from '@mmmnt/core';
import type { ReplayResult, DivergencePoint } from './types/index.js';

/**
 * What a placement on a lane that is not a context resolves to, keyed by the `contextId` the
 * placement carries. A lane that routes an outcome (a `branch-lane`, or a lane classified
 * `[Terminal]`) is not a context: its placements resolve to the lane itself, as core's cross-file
 * validator (PM-05) and derive's topology treat them. A lane classified `[External]` names an
 * external system, which the model must declare (ADR-037 §6).
 */
type LaneTarget = { readonly kind: 'branch-lane' } | { readonly kind: 'external'; label: string };

interface DivergenceState {
  readonly expectedState: string;
  readonly actualState: string;
}

type Resolve = (entry: MomentEntry) => DivergenceState | undefined;

/**
 * EventReplayEngine replays IR-defined event flows across contexts,
 * detects divergence points where actual behavior deviates from specification,
 * and returns a ReplayResult with full divergence detail.
 *
 * Infrastructure-agnostic (Design Principle #6).
 */
export class EventReplayEngine {
  replay(flow: FlowDefinition, ir: IntermediateRepresentation): ReplayResult {
    if (flow.moments.length === 0) {
      return {
        flowId: flow.id,
        stepsReplayed: 0,
        divergencePoints: [],
        finalStateMatch: true,
      };
    }

    const contextIds = new Set(ir.contexts.map((c) => c.id));
    const externalNames = new Set((ir.externals ?? []).map((e) => e.name));
    const laneTargets = buildLaneTargets(flow);
    const resolve: Resolve = (entry) => resolveEntry(entry, contextIds, externalNames, laneTargets);

    const divergencePoints: DivergencePoint[] = [];
    let stepsReplayed = 0;

    for (let i = 0; i < flow.moments.length; i++) {
      const m = flow.moments[i];
      stepsReplayed++;

      const divergence = this.evaluateMoment(m, i, resolve);
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

  private evaluateMoment(
    moment: MomentDefinition,
    momentIndex: number,
    resolve: Resolve,
  ): DivergencePoint | undefined {
    // Check main context entries
    const mainDivergence = this.checkEntries(moment.contextEntries, momentIndex, resolve);
    if (mainDivergence) {
      return mainDivergence;
    }

    // Check branch entries
    if (moment.branches) {
      for (const branch of moment.branches) {
        const branchDivergence = this.checkEntries(branch.entries, momentIndex, resolve);
        if (branchDivergence) {
          return branchDivergence;
        }
      }
    }

    return undefined;
  }

  private checkEntries(
    entries: readonly MomentEntry[],
    momentIndex: number,
    resolve: Resolve,
  ): DivergencePoint | undefined {
    for (const entry of entries) {
      const state = resolve(entry);
      if (state) {
        return { momentIndex, ...state, eventThatCaused: entry.nodeName };
      }
    }
    return undefined;
  }
}

/** The lanes of this flow whose placements do not name a context, by the id the placements carry. */
function buildLaneTargets(flow: FlowDefinition): Map<string, LaneTarget> {
  const targets = new Map<string, LaneTarget>();
  for (const lane of flow.lanes) {
    if (lane.isBranch || lane.classification === 'Terminal') {
      targets.set(lane.contextId, { kind: 'branch-lane' });
    } else if (lane.classification === 'External') {
      targets.set(lane.contextId, { kind: 'external', label: lane.label });
    }
  }
  return targets;
}

/** Undefined when the placement resolves; otherwise what was expected and what was found. */
function resolveEntry(
  entry: MomentEntry,
  contextIds: ReadonlySet<string>,
  externalNames: ReadonlySet<string>,
  laneTargets: ReadonlyMap<string, LaneTarget>,
): DivergenceState | undefined {
  const lane = laneTargets.get(entry.contextId);
  if (lane?.kind === 'branch-lane') return undefined;
  if (lane?.kind === 'external') {
    if (externalNames.has(lane.label)) return undefined;
    return {
      expectedState: `external ${lane.label} exists`,
      actualState: `external ${lane.label} not found`,
    };
  }
  if (contextIds.has(entry.contextId)) return undefined;
  return {
    expectedState: `context ${entry.contextId} exists`,
    actualState: `context ${entry.contextId} not found`,
  };
}
