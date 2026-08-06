/**
 * SimulationScenarioGenerator — Produces Facet-compatible scenario JSON from IR
 *
 * Walks a flow's temporal sequence and generates:
 * - Scenario metadata (given/when/then)
 * - Expected path (ordered node IDs)
 * - Synthetic events with causation chains, payloads, and timestamps
 *
 * This is the bridge between Moment's specification and Facet's simulation engine.
 *
 * Facet contract invariants upheld here:
 * - events[i] corresponds 1:1 with expectedPath[i] for all path events
 * - SimSaga.* events are appended strictly AFTER all path events, renumbered
 *   sequentially so evt-NNN order equals array order
 * - every path event carries payload.nodeId; events inside a selected branch
 *   carry payload.outcome = the selected branch condition
 * - a `returns-to` arm loop-unrolls (bounded, once per connection) back into
 *   its target moment, so paths never contain reject-then-accept contradictions
 */

import type {
  IntermediateRepresentation,
  FlowDefinition,
  MomentDefinition,
  MomentEntry,
  ConnectionDefinition,
  ContextDefinition,
  EventDefinition,
  CommandDefinition,
  BranchDefinition,
  SagaDefinition,
  SagaTransitionDefinition,
  PreconditionDefinition,
} from '@mmmnt/core';
import { orderedMomentChildren } from './moment-children.js';

/**
 * Truthful scenario classification, derived from the walk itself (not from
 * label text):
 * - 'happy'    — every reached branch point took its first arm
 * - 'failure'  — a selected arm contains a terminal entry (flow aborts)
 * - 'variant'  — deviated from first arms without hitting a terminal arm
 * - 'negative' — synthetic precondition-violation scenario
 * - 'timeout'  — synthetic saga-timeout scenario (declared timeout elapses)
 */
export type ScenarioKind = 'happy' | 'variant' | 'failure' | 'negative' | 'timeout';

export interface SimulationScenario {
  readonly scenarioId: string;
  readonly flowId: string;
  readonly flowName: string;
  readonly scenarioLabel: string;
  readonly kind: ScenarioKind;
  readonly description: string;
  readonly given: string;
  readonly when: string;
  readonly then: string;
  readonly expectedPath: readonly string[];
  readonly activeBranches: readonly ActiveBranch[];
  readonly events: readonly SimulationEvent[];
}

export interface ActiveBranch {
  readonly momentName: string;
  readonly condition: string;
  readonly routeChosen: string;
}

export interface SimulationEvent {
  readonly eventId: string;
  readonly eventType: string;
  readonly productSource: string;
  readonly sessionId: string;
  readonly causationEventIds: readonly string[];
  readonly correlationId: string;
  readonly timestamp: string;
  readonly version: number;
  readonly payload: Record<string, unknown>;
}

interface NodeInfo {
  nodeId: string;
  nodeName: string;
  contextId: string;
  contextName: string;
  nodeKind: string;
  momentName: string;
  momentId: string;
  momentIndex: number;
  /** Selected branch condition when this node was emitted inside (or as the
   *  first node of) a branch-point moment. Surfaces as payload.outcome. */
  outcome?: string;
}

// Lane ID lookup: contextId → lane.id from the flow's lane declarations
type LaneIndex = Map<string, string>;

export interface SimulationOptions {
  readonly scenarioId?: string;
  readonly branchSelections?: Record<string, string>;
  readonly sessionId?: string;
  readonly baseTimestamp?: string;
}

// ---------------------------------------------------------------------------
// 2a. Resolve actual node kind from context map
// ---------------------------------------------------------------------------

function resolveNodeKind(
  nodeName: string,
  contextId: string,
  contextMap: Map<string, ContextDefinition>,
): string {
  const ctx = contextMap.get(contextId);
  if (!ctx) return 'event';

  const isCommand = findCommand(ctx, nodeName) !== undefined;
  if (isCommand) return 'command';

  const isEvent = findEvent(ctx, nodeName) !== undefined;
  if (isEvent) return 'event';

  return 'event';
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

function resolveOptions(flow: FlowDefinition, options?: SimulationOptions) {
  const scenarioId = options?.scenarioId ?? `scenario-${flow.id}`;
  return {
    scenarioId,
    sessionId: options?.sessionId ?? `sess-${scenarioId}`,
    correlationId: `corr-${scenarioId}`,
    branchSelections: options?.branchSelections ?? {},
    baseTime: new Date(options?.baseTimestamp ?? '2026-01-01T10:00:00.000Z'),
  };
}

// ---------------------------------------------------------------------------
// Main entry — single scenario (backward compatible)
// ---------------------------------------------------------------------------

export function generateSimulationScenario(
  ir: IntermediateRepresentation,
  flow: FlowDefinition,
  options?: SimulationOptions,
): SimulationScenario {
  const opts = resolveOptions(flow, options);
  const contextMap = buildContextMap(ir);
  const walk = walkPath(flow, opts.branchSelections);
  const nodes = walk.nodes;
  // activeBranches declares every observable activation (including forced
  // happy-arm re-visits after a returns-to unroll), deduped — a replay harness
  // compares what it observes against this list. Labels, by contrast, use only
  // reachedBranches (the scenario's free choices).
  const seenActivations = new Set<string>();
  const activeBranches: ActiveBranch[] = [];
  for (const a of walk.activations) {
    const key = `${a.momentName}|${a.condition}`;
    if (seenActivations.has(key)) continue;
    seenActivations.add(key);
    activeBranches.push({
      momentName: a.momentName,
      condition: a.condition,
      routeChosen: a.condition,
    });
  }

  const rawEvents = generateEvents(
    nodes,
    flow,
    contextMap,
    opts.sessionId,
    opts.correlationId,
    opts.baseTime,
  );

  const events = injectSagaTransitions(rawEvents, ir, opts.sessionId, opts.correlationId);
  const contextNames = [...new Set(nodes.map((n) => n.contextName))];
  const label = resolveScenarioLabel(flow, walk.reachedBranches);

  return {
    scenarioId: opts.scenarioId,
    flowId: flow.id,
    flowName: flow.name,
    scenarioLabel: label,
    kind: resolveScenarioKind(walk.reachedBranches),
    description: flow.description ?? `Full lifecycle flow: ${flow.name}`,
    given: `A ${(flow.moments[0]?.name ?? '').toLowerCase()} scenario is initiated`,
    when: buildWhenClause(flow, nodes),
    then: buildThenClause(flow, nodes, contextNames),
    expectedPath: nodes.map((n) => n.nodeId),
    activeBranches,
    events,
  };
}

// ---------------------------------------------------------------------------
// 2b. Multi-scenario generation
// ---------------------------------------------------------------------------

export function generateAllScenarios(
  ir: IntermediateRepresentation,
  flow: FlowDefinition,
  options?: SimulationOptions,
): SimulationScenario[] {
  const combinations = enumerateBranchCombinations(flow);
  if (combinations.length === 0) {
    return [generateSimulationScenario(ir, flow, options)];
  }

  const seenPaths = new Set<string>();
  const scenarios: SimulationScenario[] = [];

  for (const selections of combinations) {
    const pathKey = walkPath(flow, selections)
      .nodes.map((n) => n.nodeId)
      .join('|');
    if (seenPaths.has(pathKey)) continue;
    seenPaths.add(pathKey);

    const idx = scenarios.length;
    scenarios.push(
      generateSimulationScenario(ir, flow, {
        ...options,
        scenarioId: options?.scenarioId
          ? `${options.scenarioId}-${idx}`
          : `scenario-${flow.id}-${idx}`,
        branchSelections: selections,
      }),
    );
  }

  return scenarios;
}

/**
 * Enumerate branch selections incrementally along the walk: each partial
 * selection set is walked, and only the first branch point actually reached
 * without a selection is expanded. Branch points behind a terminal truncation
 * are never enumerated (they are unreachable); `returns-to` arms do not
 * truncate because the unroll still reaches downstream branch points.
 */
function enumerateBranchCombinations(flow: FlowDefinition): Record<string, string>[] {
  const hasBranchPoints = flow.moments.some((m) => m.branches && m.branches.length > 0);
  if (!hasBranchPoints) return [];

  const results: Record<string, string>[] = [];

  const expand = (selections: Record<string, string>): void => {
    const walk = walkPath(flow, selections);
    const next = walk.reachedBranches.find((b) => !(b.momentName in selections));
    if (!next) {
      results.push(selections);
      return;
    }
    const moment = flow.moments.find((m) => m.name === next.momentName);
    for (const branch of moment?.branches ?? []) {
      expand({ ...selections, [next.momentName]: branch.condition });
    }
  };

  expand({});
  return results;
}

// ---------------------------------------------------------------------------
// Label resolution — derived from the branch points actually reached
// ---------------------------------------------------------------------------

function resolveScenarioLabel(flow: FlowDefinition, reachedBranches: ReachedBranch[]): string {
  const deviations = reachedBranches.filter((b) => !b.isFirstArm);
  if (deviations.length === 0) return `Happy Path: ${flow.name}`;

  const bracket = deviations.map((b) => b.condition).join(', ');
  const hasTerminalArm = deviations.some((b) => b.armHasTerminal);

  return hasTerminalArm
    ? `Failure Path: ${flow.name} [${bracket}]`
    : `Variant: ${flow.name} [${bracket}]`;
}

/**
 * Classification mirrors resolveScenarioLabel's decision structure so labels
 * and kinds can never disagree — but the manifest consumes `kind`, never the
 * label text.
 */
function resolveScenarioKind(reachedBranches: ReachedBranch[]): ScenarioKind {
  const deviations = reachedBranches.filter((b) => !b.isFirstArm);
  if (deviations.length === 0) return 'happy';
  return deviations.some((b) => b.armHasTerminal) ? 'failure' : 'variant';
}

// ---------------------------------------------------------------------------
// Context map
// ---------------------------------------------------------------------------

function buildContextMap(ir: IntermediateRepresentation): Map<string, ContextDefinition> {
  return new Map(ir.contexts.map((c) => [c.id, c]));
}

// ---------------------------------------------------------------------------
// Path walking (terminal truncation + bounded returns-to loop unroll)
// ---------------------------------------------------------------------------

interface ReachedBranch {
  momentName: string;
  condition: string;
  isFirstArm: boolean;
  armHasTerminal: boolean;
}

interface BranchActivation {
  momentName: string;
  condition: string;
}

interface WalkResult {
  nodes: NodeInfo[];
  reachedBranches: ReachedBranch[];
  /** Every branch evaluation in walk order, including forced post-unroll
   *  re-visits — the ground truth a replay harness observes. */
  activations: BranchActivation[];
}

interface WalkState {
  nodes: NodeInfo[];
  reachedBranches: ReachedBranch[];
  activations: BranchActivation[];
  reachedNames: Set<string>;
  /** Branch moments whose returns-to has been unrolled: they take their first
   *  (happy) arm on every subsequent visit, so the retry succeeds. */
  forcedFirstArm: Set<string>;
  /** returns-to connection ids already unrolled (each unrolls at most once). */
  usedReturns: Set<string>;
}

interface WalkStep {
  stop: boolean;
  jumpTo?: number;
}

function walkPath(flow: FlowDefinition, branchSelections: Record<string, string>): WalkResult {
  const laneIndex: LaneIndex = new Map(flow.lanes.map((l) => [l.contextId, l.id]));
  const momentIndexById = new Map(flow.moments.map((m, idx) => [m.id, idx]));
  const returnsToCount = flow.connections.filter((c) => c.connectionType === 'returns-to').length;
  const maxMomentVisits = flow.moments.length * (returnsToCount + 2);

  const state: WalkState = {
    nodes: [],
    reachedBranches: [],
    activations: [],
    reachedNames: new Set(),
    forcedFirstArm: new Set(),
    usedReturns: new Set(),
  };

  let idx = 0;
  let visits = 0;
  while (idx < flow.moments.length && visits < maxMomentVisits) {
    visits++;
    const moment = flow.moments[idx];
    const step =
      moment.branches && moment.branches.length > 0
        ? walkBranchedMoment(moment, idx, flow, branchSelections, laneIndex, momentIndexById, state)
        : walkPlainMoment(moment, idx, laneIndex, state);
    if (step.stop) break;
    idx = step.jumpTo ?? idx + 1;
  }

  return {
    nodes: state.nodes,
    reachedBranches: state.reachedBranches,
    activations: state.activations,
  };
}

function walkPlainMoment(
  moment: MomentDefinition,
  momentIndex: number,
  laneIndex: LaneIndex,
  state: WalkState,
): WalkStep {
  // Sequence-aware (M-S12): a plain moment's children are entries only, so
  // honoring the sequence preserves declaration order; the helper guards the
  // degenerate case of a stale sequence anyway.
  for (const child of orderedMomentChildren(moment, 'entries-first')) {
    if (child.kind !== 'entry') continue;
    pushEntryNodes(state.nodes, child.entry, moment, momentIndex, laneIndex, 'main', undefined);
    if (child.entry.terminal) return { stop: true };
  }
  return { stop: false };
}

function walkBranchedMoment(
  moment: MomentDefinition,
  momentIndex: number,
  flow: FlowDefinition,
  branchSelections: Record<string, string>,
  laneIndex: LaneIndex,
  momentIndexById: Map<string, number>,
  state: WalkState,
): WalkStep {
  const branches = moment.branches!;
  const { branch, forced } = selectBranch(moment, branchSelections, state);
  if (!branch) return walkPlainMoment(moment, momentIndex, laneIndex, state);

  const branchIdx = branches.indexOf(branch);
  recordBranchPoint(state, moment, branch, branchIdx, forced);

  // Sequence-aware (M-S12): children are walked in textual order when the IR
  // carries a sequence. The `when` arms collectively form ONE decision point:
  // the selected arm is emitted at the position of the first branch child,
  // sibling arms are skipped. Hand-built IR without a sequence keeps this
  // walker's legacy branches-then-entries order.
  let emittedAny = false;
  let branchEmitted = false;
  for (const child of orderedMomentChildren(moment, 'branches-first')) {
    if (child.kind === 'branch') {
      if (branchEmitted) continue;
      branchEmitted = true;

      const step = emitSelectedArm(
        moment,
        momentIndex,
        flow,
        branch,
        branchIdx,
        laneIndex,
        momentIndexById,
        state,
      );
      if (step) return step;
      if (branch.entries.length > 0) emittedAny = true;
    } else {
      // First event of a branch-point moment carries the selection outcome
      // even when the selected arm itself emitted nothing.
      const outcome = emittedAny ? undefined : branch.condition;
      pushEntryNodes(state.nodes, child.entry, moment, momentIndex, laneIndex, 'main', outcome);
      emittedAny = true;
      if (child.entry.terminal) return { stop: true };
    }
  }

  return { stop: false };
}

/** Pick the arm for this visit: a forced re-visit (post-unroll) always takes
 *  the first arm; a free visit honors the scenario's branch selection. */
function selectBranch(
  moment: MomentDefinition,
  branchSelections: Record<string, string>,
  state: WalkState,
): { branch: BranchDefinition | undefined; forced: boolean } {
  const branches = moment.branches!;
  const forced = state.forcedFirstArm.has(moment.name);
  const selected = forced ? branches[0]?.condition : branchSelections[moment.name];
  const branch =
    (selected ? branches.find((b) => b.condition === selected) : undefined) ?? branches[0];
  return { branch, forced };
}

function recordBranchPoint(
  state: WalkState,
  moment: MomentDefinition,
  branch: BranchDefinition,
  branchIdx: number,
  forced: boolean,
): void {
  // Every evaluation — free or forced — is an observable activation.
  state.activations.push({ momentName: moment.name, condition: branch.condition });

  // Record the branch point on its first free (non-forced) visit only —
  // a forced re-visit after an unroll is not a scenario choice.
  if (!forced && !state.reachedNames.has(moment.name)) {
    state.reachedNames.add(moment.name);
    state.reachedBranches.push({
      momentName: moment.name,
      condition: branch.condition,
      isFirstArm: branchIdx === 0,
      armHasTerminal: branch.entries.some((e) => e.terminal),
    });
  }
}

/** Emit the selected arm's entries. Returns a WalkStep that short-circuits
 *  the moment (terminal stop, or returns-to jump), or null to fall through
 *  to the moment's remaining children. */
function emitSelectedArm(
  moment: MomentDefinition,
  momentIndex: number,
  flow: FlowDefinition,
  branch: BranchDefinition,
  branchIdx: number,
  laneIndex: LaneIndex,
  momentIndexById: Map<string, number>,
  state: WalkState,
): WalkStep | null {
  for (const entry of branch.entries) {
    pushEntryNodes(
      state.nodes,
      entry,
      moment,
      momentIndex,
      laneIndex,
      `br${branchIdx}`,
      branch.condition,
    );
    if (entry.terminal) return { stop: true };
  }

  // Bounded loop unroll: a returns-to arm jumps back into its target
  // moment instead of falling through linearly. The branch point is then
  // forced onto its first (happy) arm so the retry succeeds on the second
  // pass.
  const returnsTo = findReturnsToConnection(flow, moment, branch);
  if (returnsTo?.targetMomentId !== undefined && !state.usedReturns.has(returnsTo.id)) {
    const targetIdx = momentIndexById.get(returnsTo.targetMomentId);
    if (targetIdx !== undefined) {
      state.usedReturns.add(returnsTo.id);
      state.forcedFirstArm.add(moment.name);
      return { stop: false, jumpTo: targetIdx };
    }
  }
  return null;
}

function findReturnsToConnection(
  flow: FlowDefinition,
  moment: MomentDefinition,
  branch: BranchDefinition,
): ConnectionDefinition | undefined {
  return flow.connections.find(
    (c) =>
      c.connectionType === 'returns-to' &&
      c.sourceMomentId === moment.id &&
      (c.branchCondition === branch.condition ||
        (c.branchCondition === undefined &&
          branch.entries.some((e) => e.nodeName === c.sourceNodeName))),
  );
}

/** Emit one node per multiplicity unit (an entry with multiplicity N emits N
 *  path positions so events and expectedPath stay 1:1 aligned). */
function pushEntryNodes(
  nodes: NodeInfo[],
  entry: MomentEntry,
  moment: MomentDefinition,
  momentIndex: number,
  laneIndex: LaneIndex,
  scope: string,
  outcome: string | undefined,
): void {
  const count = resolveMultiplicity(entry.multiplicity);
  for (let k = 0; k < count; k++) {
    nodes.push(entryToNode(entry, moment, momentIndex, laneIndex, scope, outcome));
  }
}

function resolveMultiplicity(multiplicity: number | string | undefined): number {
  if (typeof multiplicity === 'number' && Number.isFinite(multiplicity) && multiplicity > 1) {
    return Math.floor(multiplicity);
  }
  if (typeof multiplicity === 'string' && /^\d+$/.test(multiplicity)) {
    const n = parseInt(multiplicity, 10);
    if (n > 1) return n;
  }
  return 1;
}

function entryToNode(
  entry: MomentEntry,
  moment: MomentDefinition,
  momentIndex: number,
  laneIndex: LaneIndex,
  scope: string,
  outcome?: string,
): NodeInfo {
  const contextName = entry.contextId.replace(/^ctx-/, '');
  const laneId = laneIndex.get(entry.contextId) ?? entry.contextId;
  return {
    nodeId: `${moment.id}::${laneId}::${entry.nodeName}::${scope}`,
    nodeName: entry.nodeName,
    contextId: entry.contextId,
    contextName,
    nodeKind: entry.nodeKind,
    momentName: moment.name,
    momentId: moment.id,
    momentIndex,
    ...(outcome !== undefined ? { outcome } : {}),
  };
}

// ---------------------------------------------------------------------------
// Event generation
// ---------------------------------------------------------------------------

function generateEvents(
  nodes: NodeInfo[],
  flow: FlowDefinition,
  contextMap: Map<string, ContextDefinition>,
  sessionId: string,
  correlationId: string,
  baseTime: Date,
): SimulationEvent[] {
  const events: SimulationEvent[] = [];
  const eventIds = nodes.map((_, i) => `evt-${String(i + 1).padStart(3, '0')}`);

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const timestamp = new Date(baseTime.getTime() + i * 1000).toISOString();
    const causationEventIds = findCausationEvents(node, nodes, flow, eventIds, i);

    // 2a: resolve actual node kind from context map
    const effectiveKind = resolveNodeKind(node.nodeName, node.contextId, contextMap);
    const eventType = resolveEventType(node, effectiveKind);
    const productSource = resolveProductSource(node, effectiveKind, contextMap);
    const payload = buildPayload(node, effectiveKind, contextMap, flow);

    events.push({
      eventId: eventIds[i],
      eventType,
      productSource,
      sessionId,
      causationEventIds,
      correlationId,
      timestamp,
      version: 1,
      payload,
    });
  }

  return events;
}

/**
 * Causation: a `triggered-by` connection contributes causation ONLY to the
 * event of its consuming node (targetNodeName), mapping the most recent prior
 * emission of sourceNodeName as the cause. Falls back to previous-node
 * causation when the node declares no trigger.
 */
function findCausationEvents(
  node: NodeInfo,
  allNodes: NodeInfo[],
  flow: FlowDefinition,
  eventIds: string[],
  currentIndex: number,
): string[] {
  const causation: string[] = [];

  for (const conn of flow.connections) {
    if (!isCausationConnectionFor(conn, node)) continue;

    const triggerName = conn.sourceNodeName ?? conn.eventId.replace(/^evt-/, '');
    const causeId = findLatestPriorEmission(triggerName, allNodes, eventIds, currentIndex);
    if (causeId !== undefined) causation.push(causeId);
  }

  const deduped = [...new Set(causation)];
  if (deduped.length === 0 && currentIndex > 0) {
    deduped.push(eventIds[currentIndex - 1]);
  }
  return deduped;
}

/** A `triggered-by` connection contributes causation to this node's event only
 *  when it targets the node in its moment (and matching branch outcome). */
function isCausationConnectionFor(conn: ConnectionDefinition, node: NodeInfo): boolean {
  if (conn.connectionType !== 'triggered-by') return false;
  if (conn.targetNodeName !== node.nodeName) return false;
  if (conn.sourceMomentId !== node.momentId) return false;
  if (conn.branchCondition !== undefined && conn.branchCondition !== node.outcome) return false;
  return true;
}

/** Event id of the most recent emission of `triggerName` before currentIndex. */
function findLatestPriorEmission(
  triggerName: string,
  allNodes: NodeInfo[],
  eventIds: string[],
  currentIndex: number,
): string | undefined {
  for (let j = currentIndex - 1; j >= 0; j--) {
    if (allNodes[j].nodeName === triggerName) {
      return eventIds[j];
    }
  }
  return undefined;
}

function resolveEventType(node: NodeInfo, effectiveKind: string): string {
  if (effectiveKind === 'command') {
    return `SimProcess.${node.nodeName}`;
  }
  return node.nodeName;
}

function resolveProductSource(
  node: NodeInfo,
  effectiveKind: string,
  contextMap: Map<string, ContextDefinition>,
): string {
  const ctx = contextMap.get(node.contextId);
  if (!ctx) return 'moment:simulation';

  if (effectiveKind === 'event') {
    const isDefinedEvent = ctx.events.some((e) => e.name === node.nodeName);
    if (isDefinedEvent) {
      return ctx.name.toLowerCase().replace(/\s+/g, '-');
    }
  }

  return 'moment:simulation';
}

// ---------------------------------------------------------------------------
// 2a. Payload building (uses resolved effective kind)
// ---------------------------------------------------------------------------

function buildPayload(
  node: NodeInfo,
  effectiveKind: string,
  contextMap: Map<string, ContextDefinition>,
  flow: FlowDefinition,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    nodeId: node.nodeId,
  };

  const ctx = contextMap.get(node.contextId);
  const cmd = ctx && effectiveKind === 'command' ? findCommand(ctx, node.nodeName) : undefined;
  const evt = ctx && effectiveKind === 'event' ? findEvent(ctx, node.nodeName) : undefined;

  if (cmd) {
    payload.processName = node.nodeName;
    for (const input of cmd.inputs) {
      payload[input.name] = generatePlaceholder(input.type, input.name);
    }
  } else if (evt) {
    for (const field of evt.fields) {
      payload[field.name] = generatePlaceholder(field.type, field.name);
    }
  }

  // Crossing contracts are boundary projections: every crosses-to contract the
  // flow attaches to this node name contributes its required shape, so the
  // payload is the UNION of declared fields and all crossing contract fields.
  // Declared fields win on name collision (contract-only fields are added);
  // for flow-only specs with no declaring context this doubles as the
  // payload-synthesis fallback so payloads are not bare {nodeId}. Matching is
  // by node name across the whole flow — Facet's schema tier validates an
  // event type against every crossing contract regardless of which moment the
  // crossing was declared in.
  addContractFields(payload, node, flow);

  if (node.outcome !== undefined) {
    payload.outcome = node.outcome;
  }

  return payload;
}

function addContractFields(
  payload: Record<string, unknown>,
  node: NodeInfo,
  flow: FlowDefinition,
): void {
  for (const conn of flow.connections) {
    if (conn.connectionType !== 'crosses-to') continue;
    if (conn.sourceNodeName !== node.nodeName) continue;
    if (!('schemaContract' in conn)) continue;
    for (const field of conn.schemaContract.fields) {
      if (field.name in payload) continue;
      payload[field.name] = generatePlaceholder(field.type, field.name);
    }
  }
}

// ---------------------------------------------------------------------------
// 2c. Saga state progression (M-S6) — markers appended strictly after all
//     path events
// ---------------------------------------------------------------------------

/** One saga state milestone: the state reached and the path event that fired it. */
interface SagaProgressionStep {
  readonly state: string;
  readonly cause: SimulationEvent;
}

function injectSagaTransitions(
  events: SimulationEvent[],
  ir: IntermediateRepresentation,
  sessionId: string,
  correlationId: string,
): SimulationEvent[] {
  const sagas = collectSagas(ir);
  if (sagas.length === 0 || events.length === 0) return events;

  const sagaEvents: SimulationEvent[] = [];
  const lastPathTime = new Date(events[events.length - 1].timestamp).getTime();

  // Each saga progresses independently against the same path; its markers are
  // emitted as one contiguous run, sagas in declaration order, all strictly
  // trailing and renumbered so evt-NNN order equals array order.
  for (const saga of sagas) {
    for (const step of computeSagaProgression(saga, events)) {
      const eventCounter = events.length + sagaEvents.length + 1;
      const timestamp = new Date(lastPathTime + (sagaEvents.length + 1) * 1000).toISOString();
      sagaEvents.push({
        eventId: `evt-${String(eventCounter).padStart(3, '0')}`,
        eventType: `SimSaga.${saga.name}.${step.state}`,
        productSource: 'moment:simulation',
        sessionId,
        causationEventIds: [step.cause.eventId],
        correlationId,
        timestamp,
        version: 1,
        payload: {
          sagaName: saga.name,
          state: step.state,
          triggeredBy: step.cause.eventType,
        },
      });
    }
  }

  return [...events, ...sagaEvents];
}

function collectSagas(ir: IntermediateRepresentation): SagaDefinition[] {
  return ir.contexts.flatMap((ctx) => ctx.sagas);
}

/**
 * Walks a saga's declared transitions against the path events (M-S6):
 * - The initial state is reached when the trigger event's FIRST occurrence
 *   is found in the path.
 * - Each subsequent state is reached ONLY when its transition declares an
 *   `onEvent` that occurs in the path strictly AFTER the previous milestone
 *   (an onEvent earlier than the trigger — or earlier than the previous
 *   transition's event — does not count).
 * - An unmapped transition (no `onEvent`) stops progression: the generator
 *   never invents a transition the spec did not bind to an event.
 */
function computeSagaProgression(
  saga: SagaDefinition,
  events: readonly SimulationEvent[],
): SagaProgressionStep[] {
  if (saga.states.length === 0) return [];

  const triggerIdx = events.findIndex((e) => e.eventType === saga.trigger);
  if (triggerIdx === -1) return [];

  const steps: SagaProgressionStep[] = [{ state: saga.states[0], cause: events[triggerIdx] }];

  let cursor = triggerIdx;
  for (const transition of sagaTransitionChain(saga)) {
    if (!transition.onEvent) break;
    const fireIdx = findEventAfter(events, transition.onEvent, cursor);
    if (fireIdx === -1) break;
    steps.push({ state: transition.to, cause: events[fireIdx] });
    cursor = fireIdx;
  }

  return steps;
}

/**
 * The saga's transition chain in declaration order. `transitions` is optional
 * at the type level (hand-built IR); when absent, every transition is treated
 * as unmapped — same no-invention rule as an explicit transition without
 * `onEvent`.
 */
function sagaTransitionChain(saga: SagaDefinition): readonly SagaTransitionDefinition[] {
  return saga.transitions ?? [];
}

function findEventAfter(
  events: readonly SimulationEvent[],
  eventType: string,
  afterIndex: number,
): number {
  for (let i = afterIndex + 1; i < events.length; i++) {
    if (events[i].eventType === eventType) return i;
  }
  return -1;
}

// ---------------------------------------------------------------------------
// 2d. Negative scenarios from precondition violations
// ---------------------------------------------------------------------------

export function deriveNegativeScenarios(
  ir: IntermediateRepresentation,
  flow: FlowDefinition,
  options?: SimulationOptions,
): SimulationScenario[] {
  const contextMap = buildContextMap(ir);
  const opts = resolveOptions(flow, options);
  const walk = walkPath(flow, opts.branchSelections);
  const nodes = walk.nodes;
  const scenarios: SimulationScenario[] = [];
  const usedIds = new Set<string>();

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const kind = resolveNodeKind(node.nodeName, node.contextId, contextMap);
    if (kind !== 'command') continue;

    const preconditions = findPreconditions(node, contextMap);
    for (const pre of preconditions) {
      // Suffix the path index when the same command+precondition repeats so
      // scenario ids never collide.
      const baseId = `${opts.scenarioId}-neg-${node.nodeName}-${pre.name}`;
      const scenarioId = usedIds.has(baseId) ? `${baseId}-${i}` : baseId;
      usedIds.add(scenarioId);
      usedIds.add(baseId);
      scenarios.push(buildNegativeScenario(ir, flow, walk, i, pre, contextMap, opts, scenarioId));
    }
  }

  return scenarios;
}

function findPreconditions(
  node: NodeInfo,
  contextMap: Map<string, ContextDefinition>,
): PreconditionDefinition[] {
  const ctx = contextMap.get(node.contextId);
  if (!ctx) return [];
  const cmd = findCommand(ctx, node.nodeName);
  return cmd?.preconditions ?? [];
}

function buildNegativeScenario(
  ir: IntermediateRepresentation,
  flow: FlowDefinition,
  walk: WalkResult,
  failIndex: number,
  precondition: PreconditionDefinition,
  contextMap: Map<string, ContextDefinition>,
  opts: ReturnType<typeof resolveOptions>,
  scenarioId: string,
): SimulationScenario {
  const allNodes = walk.nodes;
  const precedingNodes = allNodes.slice(0, failIndex + 1);
  const failNode = allNodes[failIndex];

  // Declare the branch activations actually observed along the truncated path
  // (the walk's activations restricted to moments the path reaches) — a replay
  // harness compares observed activations against this list.
  const reachedMoments = new Set(precedingNodes.map((n) => n.momentName));
  const seenActivations = new Set<string>();
  const activeBranches: ActiveBranch[] = [];
  for (const a of walk.activations) {
    if (!reachedMoments.has(a.momentName)) continue;
    const key = `${a.momentName} ${a.condition}`;
    if (seenActivations.has(key)) continue;
    seenActivations.add(key);
    activeBranches.push({
      momentName: a.momentName,
      condition: a.condition,
      routeChosen: a.condition,
    });
  }

  const events = generateEvents(
    precedingNodes,
    flow,
    contextMap,
    opts.sessionId,
    opts.correlationId,
    opts.baseTime,
  );

  const failureEvent = buildFailureEvent(failNode, precondition, events, opts);
  const allEvents = injectSagaTransitions(
    [...events, failureEvent],
    ir,
    opts.sessionId,
    opts.correlationId,
  );

  return {
    scenarioId,
    flowId: flow.id,
    flowName: flow.name,
    scenarioLabel: `Failure: ${precondition.description} not met`,
    kind: 'negative',
    description: `Negative scenario: ${precondition.description} precondition violation at ${failNode.nodeName}`,
    given: `A ${(flow.moments[0]?.name ?? '').toLowerCase()} scenario is initiated`,
    when: `${failNode.nodeName} is invoked without satisfying ${precondition.name}`,
    then: `The command ${failNode.nodeName} is rejected`,
    expectedPath: precedingNodes.map((n) => n.nodeId),
    activeBranches,
    events: allEvents,
  };
}

function buildFailureEvent(
  failNode: NodeInfo,
  precondition: PreconditionDefinition,
  precedingEvents: SimulationEvent[],
  opts: ReturnType<typeof resolveOptions>,
): SimulationEvent {
  const lastEvent = precedingEvents[precedingEvents.length - 1];
  const eventCounter = precedingEvents.length + 1;
  return {
    eventId: `evt-${String(eventCounter).padStart(3, '0')}`,
    eventType: `SimFailure.${failNode.nodeName}.PreconditionViolation`,
    productSource: 'moment:simulation',
    sessionId: opts.sessionId,
    causationEventIds: lastEvent ? [lastEvent.eventId] : [],
    correlationId: opts.correlationId,
    timestamp: new Date(opts.baseTime.getTime() + precedingEvents.length * 1000).toISOString(),
    version: 1,
    payload: {
      nodeId: failNode.nodeId,
      failedPrecondition: precondition.name,
      description: precondition.description,
    },
  };
}

// ---------------------------------------------------------------------------
// 2e. Timeout scenarios from saga timeout declarations (M-S11)
// ---------------------------------------------------------------------------

/**
 * Synthesizes one timeout scenario per saga that declares a timeout, in the
 * flow that OWNS the saga (single-owner rule, mirroring the gherkin
 * generator's saga assignment: the first flow containing the saga's trigger
 * node, falling back to the first flow).
 *
 * The scenario is the HAPPY walk truncated after the moment containing the
 * saga's trigger event — the domain flow stops there, which IS the timeout —
 * followed by trailing markers:
 *   SimSaga.<Saga>.<InitialState>
 *   SimSaga.<Saga>.TimedOut     (payload { timeoutName })
 *   SimSaga.<Saga>.Compensated  (payload { description }) iff compensation ≠ 'none'
 * All envelope invariants (1:1 path alignment, trailing markers, sequential
 * renumbering, timestamps after the last path event) match other scenarios.
 */
export function deriveTimeoutScenarios(
  ir: IntermediateRepresentation,
  flow: FlowDefinition,
  options?: SimulationOptions,
): SimulationScenario[] {
  const opts = resolveOptions(flow, options);
  const contextMap = buildContextMap(ir);
  const scenarios: SimulationScenario[] = [];

  for (const saga of collectSagas(ir)) {
    if (saga.timeout === 'none' || saga.timeout === '') continue;
    if (saga.states.length === 0) continue;

    const owner = ir.flows.find((f) => flowContainsNodeName(f, saga.trigger)) ?? ir.flows[0];
    if (!owner || owner.id !== flow.id) continue;

    const scenario = buildTimeoutScenario(flow, saga, contextMap, opts);
    if (scenario) scenarios.push(scenario);
  }

  return scenarios;
}

function flowContainsNodeName(flow: FlowDefinition, nodeName: string): boolean {
  for (const moment of flow.moments) {
    if (moment.contextEntries.some((e) => e.nodeName === nodeName)) return true;
    for (const branch of moment.branches ?? []) {
      if (branch.entries.some((e) => e.nodeName === nodeName)) return true;
    }
  }
  return false;
}

function buildTimeoutScenario(
  flow: FlowDefinition,
  saga: SagaDefinition,
  contextMap: Map<string, ContextDefinition>,
  opts: ReturnType<typeof resolveOptions>,
): SimulationScenario | null {
  // HAPPY walk: no branch selections, every branch point takes its first arm.
  const walk = walkPath(flow, {});
  const triggerIdx = walk.nodes.findIndex((n) => n.nodeName === saga.trigger);
  // Trigger not on the happy walk of the owning flow: nothing truthful to
  // truncate — skip rather than invent a path.
  if (triggerIdx === -1) return null;

  const nodes = truncateAfterTriggerMoment(walk.nodes, triggerIdx);

  const pathEvents = generateEvents(
    nodes,
    flow,
    contextMap,
    opts.sessionId,
    opts.correlationId,
    opts.baseTime,
  );
  const events = appendTimeoutMarkers(pathEvents, saga, triggerIdx, opts);

  const activeBranches = collectTruncatedActiveBranches(walk.activations, nodes);

  const hasCompensation = saga.compensation !== 'none' && saga.compensation !== '';
  const lastMomentName = nodes[nodes.length - 1]?.momentName ?? flow.name;

  return {
    scenarioId: `${opts.scenarioId}-timeout-${saga.name}`,
    flowId: flow.id,
    flowName: flow.name,
    scenarioLabel: `Timeout: ${flow.name} [${saga.name}.${saga.timeout}]`,
    kind: 'timeout',
    description: `Timeout scenario: saga ${saga.name} timeout ${saga.timeout} elapses after ${saga.trigger}; the domain flow stops at ${lastMomentName}`,
    given: `A ${(flow.moments[0]?.name ?? '').toLowerCase()} scenario is initiated`,
    when: `Saga ${saga.name} timeout ${saga.timeout} elapses after ${saga.trigger}`,
    then: hasCompensation
      ? `Saga ${saga.name} times out and compensates: ${saga.compensation}`
      : `Saga ${saga.name} times out`,
    expectedPath: nodes.map((n) => n.nodeId),
    activeBranches,
    events,
  };
}

/** Truncate AFTER the moment containing the trigger node: keep the trigger
 *  moment's remaining contiguous nodes (same moment visit), drop the rest. */
function truncateAfterTriggerMoment(walkNodes: NodeInfo[], triggerIdx: number): NodeInfo[] {
  let cut = triggerIdx;
  while (
    cut + 1 < walkNodes.length &&
    walkNodes[cut + 1].momentId === walkNodes[triggerIdx].momentId
  ) {
    cut++;
  }
  return walkNodes.slice(0, cut + 1);
}

/** Branch activations observable within the truncated path only. */
function collectTruncatedActiveBranches(
  activations: WalkResult['activations'],
  nodes: NodeInfo[],
): ActiveBranch[] {
  const includedMoments = new Set(nodes.map((n) => n.momentName));
  const seenActivations = new Set<string>();
  const activeBranches: ActiveBranch[] = [];
  for (const a of activations) {
    if (!includedMoments.has(a.momentName)) continue;
    const key = `${a.momentName} ${a.condition}`;
    if (seenActivations.has(key)) continue;
    seenActivations.add(key);
    activeBranches.push({
      momentName: a.momentName,
      condition: a.condition,
      routeChosen: a.condition,
    });
  }
  return activeBranches;
}

function appendTimeoutMarkers(
  pathEvents: SimulationEvent[],
  saga: SagaDefinition,
  triggerIdx: number,
  opts: ReturnType<typeof resolveOptions>,
): SimulationEvent[] {
  const lastPathTime =
    pathEvents.length > 0
      ? new Date(pathEvents[pathEvents.length - 1].timestamp).getTime()
      : opts.baseTime.getTime();
  const markers: SimulationEvent[] = [];

  const push = (
    eventType: string,
    payload: Record<string, unknown>,
    causeEventId: string | undefined,
  ): SimulationEvent => {
    const counter = pathEvents.length + markers.length + 1;
    const marker: SimulationEvent = {
      eventId: `evt-${String(counter).padStart(3, '0')}`,
      eventType,
      productSource: 'moment:simulation',
      sessionId: opts.sessionId,
      causationEventIds: causeEventId ? [causeEventId] : [],
      correlationId: opts.correlationId,
      timestamp: new Date(lastPathTime + (markers.length + 1) * 1000).toISOString(),
      version: 1,
      payload,
    };
    markers.push(marker);
    return marker;
  };

  const triggerEvent = pathEvents[triggerIdx];
  const initialState = saga.states[0];
  const initial = push(
    `SimSaga.${saga.name}.${initialState}`,
    {
      sagaName: saga.name,
      state: initialState,
      triggeredBy: triggerEvent?.eventType ?? saga.trigger,
    },
    triggerEvent?.eventId,
  );
  const timedOut = push(
    `SimSaga.${saga.name}.TimedOut`,
    { timeoutName: saga.timeout },
    initial.eventId,
  );
  if (saga.compensation !== 'none' && saga.compensation !== '') {
    push(`SimSaga.${saga.name}.Compensated`, { description: saga.compensation }, timedOut.eventId);
  }

  return [...pathEvents, ...markers];
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function findCommand(ctx: ContextDefinition, name: string): CommandDefinition | undefined {
  const topLevel = ctx.commands.find((c) => c.name === name);
  if (topLevel) return topLevel;

  for (const agg of ctx.aggregates) {
    const cmd = agg.commands.find((c) => c.name === name);
    if (cmd) return cmd;
  }
  return undefined;
}

function findEvent(ctx: ContextDefinition, name: string): EventDefinition | undefined {
  const topLevel = ctx.events.find((e) => e.name === name);
  if (topLevel) return topLevel;

  for (const agg of ctx.aggregates) {
    const evt = agg.events.find((e) => e.name === name);
    if (evt) return evt;
  }
  return undefined;
}

function generatePlaceholder(type: string, name: string): unknown {
  if (type === 'UUID') return `${name}-001`;
  if (type === 'string') return `sample-${name}`;
  if (type === 'number') return 0;
  if (type === 'boolean') return true;
  if (type === 'DateTime') return '2026-01-01T10:00:00.000Z';
  if (type === 'Date') return '2026-01-01';
  if (type === 'Money') return 0;
  if (type.endsWith('[]')) return [];
  return {};
}

function buildWhenClause(flow: FlowDefinition, nodes: NodeInfo[]): string {
  const momentNames = [...new Set(nodes.map((n) => n.momentName))];
  return `The flow progresses through ${momentNames.join(', ')}`;
}

function buildThenClause(flow: FlowDefinition, nodes: NodeInfo[], contextNames: string[]): string {
  const lastNode = nodes[nodes.length - 1];
  return `The flow completes at ${lastNode?.momentName ?? 'end'} across ${contextNames.join(', ')}`;
}
