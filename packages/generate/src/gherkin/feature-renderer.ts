import type {
  IntermediateRepresentation,
  FlowDefinition,
  MomentDefinition,
  MomentEntry,
  BranchDefinition,
  ConnectionDefinition,
  ContextDefinition,
  CommandDefinition,
  EventDefinition,
  PreconditionDefinition,
  SagaDefinition,
} from '@mmmnt/core';

/**
 * Renders a flow into a complete, richly-tagged Gherkin .feature file.
 *
 * Uses the full Gherkin vocabulary:
 * - Tags: @context, @aggregate, @classification, @crossing, @terminal,
 *         @happy-path, @failure-path, @policy, @saga, @invariant
 * - Rule: groups scenarios by bounded context
 * - Background: shared preconditions
 * - Data tables: crossing contracts
 *
 * GN-02: Given=precondition, When=command, Then=event
 * GN-03: Exact specification vocabulary preserved
 */
export function renderFeatureFromIr(flow: FlowDefinition, ir: IntermediateRepresentation): string {
  const lines: string[] = [];
  const ctxMap = new Map(ir.contexts.map((c) => [c.id, c]));

  renderFeatureHeader(lines, flow, ir);
  renderMomentsByContext(lines, flow, ir, ctxMap);

  return lines.join('\n').trimEnd() + '\n';
}

function renderFeatureHeader(
  lines: string[],
  flow: FlowDefinition,
  ir: IntermediateRepresentation,
): void {
  // Feature-level tags
  const tags: string[] = [];
  const ctxIds = collectFlowContextIds(flow);
  for (const id of ctxIds) {
    const ctx = ir.contexts.find((c) => c.id === id);
    if (ctx) {
      tags.push(`@context:${ctx.name}`);
      if (ctx.classification) tags.push(`@classification:${ctx.classification}`);
    }
  }
  if (tags.length > 0) lines.push(tags.join(' '));

  lines.push(`Feature: ${flow.name}`);
  if (flow.description) {
    lines.push(`  ${flow.description}`);
  }
  lines.push('');
}

function renderMomentsByContext(
  lines: string[],
  flow: FlowDefinition,
  ir: IntermediateRepresentation,
  ctxMap: Map<string, ContextDefinition>,
): void {
  const contextGroups = groupMomentsByContext(flow);
  // Single-owner rule (mirrors deriveTopology's saga test-case assignment):
  // a saga's synthetic scenarios render only in the flow that contains its
  // trigger node (fallback: the first flow) — never duplicated into every
  // flow whose contexts declare sagas.
  const ownedSagaIds = collectOwnedSagaIds(flow, ir);

  for (const [ctxId, moments] of contextGroups) {
    const ctx = ctxMap.get(ctxId);
    const ctxName = ctx?.name ?? ctxId.replace(/^ctx-/, '');
    const classification = ctx?.classification ? ` [${ctx.classification}]` : '';

    lines.push(`  Rule: ${ctxName}${classification}`);
    lines.push('');

    const sharedPreconditions = extractSharedPreconditions(moments, ctxMap);
    renderBackgroundBlock(lines, sharedPreconditions);

    for (const moment of moments) {
      if (moment.branches && moment.branches.length > 0) {
        for (const branch of moment.branches) {
          renderBranchScenario(
            lines,
            moment,
            branch.condition,
            branch.entries,
            flow,
            ctxMap,
            ir,
            sharedPreconditions,
          );
        }
      } else {
        renderScenario(
          lines,
          moment,
          moment.contextEntries,
          flow,
          ctxMap,
          ir,
          undefined,
          sharedPreconditions,
        );
      }
    }

    renderSagaScenarios(lines, ctxId, ir, ownedSagaIds);
  }

  // Fallback ownership can assign a saga to a flow that never touches the
  // saga's context — render those under their own Rule so they are not
  // silently dropped from every feature.
  renderOrphanOwnedSagas(lines, ir, contextGroups, ownedSagaIds);
}

function renderScenario(
  lines: string[],
  moment: MomentDefinition,
  entries: readonly MomentEntry[],
  flow: FlowDefinition,
  ctxMap: Map<string, ContextDefinition>,
  ir: IntermediateRepresentation,
  variant: string | undefined,
  sharedPreconditions: Set<string> = new Set(),
): void {
  const label = variant ? `${moment.name} [${variant}]` : moment.name;
  const tags = buildScenarioTags(entries, moment, undefined, flow, ctxMap, ir);

  if (tags.length > 0) lines.push(`    ${tags.join(' ')}`);
  lines.push(`    Scenario: ${label}`);

  const steps: string[] = [];
  const usedConnections = new Set<string>();
  // Sequence-aware (M-S12): a plain moment's steps follow the textual child
  // order; `entries` is always the moment's own contextEntries here.
  for (const entry of orderedMainEntries(moment)) {
    renderEntrySteps(
      steps,
      entry,
      moment,
      undefined,
      flow,
      ctxMap,
      sharedPreconditions,
      usedConnections,
    );
  }
  promoteLeadingAnd(steps);
  lines.push(...steps);

  lines.push('');
}

function renderBranchScenario(
  lines: string[],
  moment: MomentDefinition,
  condition: string,
  branchEntries: readonly MomentEntry[],
  flow: FlowDefinition,
  ctxMap: Map<string, ContextDefinition>,
  ir: IntermediateRepresentation,
  sharedPreconditions: Set<string> = new Set(),
): void {
  const isTerminal = branchEntries.some((e) => e.terminal);

  if (isTerminal) {
    renderTerminalBranchScenario(lines, moment, condition, branchEntries, flow, ctxMap, ir);
    return;
  }

  const allEntries = [...moment.contextEntries, ...branchEntries];
  const tags = buildScenarioTags(allEntries, moment, condition, flow, ctxMap, ir);
  const returnsTo = findReturnsTo(moment, condition, flow);
  // Tag the branch by its actual nature: a branch that loops back is a retry
  // path, any other non-terminal branch is an alternative path. @happy-path is
  // never inferred — the spec does not say which branch is the happy one.
  if (!tags.includes('@failure-path')) tags.push(returnsTo ? '@retry-path' : '@alt-path');

  if (tags.length > 0) lines.push(`    ${tags.join(' ')}`);
  lines.push(`    Scenario: ${moment.name} [${condition}]`);

  const steps = buildBranchScenarioSteps(
    moment,
    condition,
    branchEntries,
    flow,
    ctxMap,
    sharedPreconditions,
  );
  if (returnsTo) {
    const targetLabel = resolveReturnsToLabel(returnsTo, flow);
    if (targetLabel) steps.push(`      Then the flow returns to "${targetLabel}"`);
  }
  promoteLeadingAnd(steps);
  lines.push(...steps);

  lines.push('');
}

/** Sequence-aware (M-S12): steps follow the moment's textual child order.
 *  Only the arm being rendered contributes branch steps; sibling arms are
 *  other scenarios. */
function buildBranchScenarioSteps(
  moment: MomentDefinition,
  condition: string,
  branchEntries: readonly MomentEntry[],
  flow: FlowDefinition,
  ctxMap: Map<string, ContextDefinition>,
  sharedPreconditions: Set<string>,
): string[] {
  const steps: string[] = [];
  const usedConnections = new Set<string>();
  for (const child of orderedMomentChildren(moment)) {
    if (child.kind === 'entry') {
      renderEntrySteps(
        steps,
        child.entry,
        moment,
        undefined,
        flow,
        ctxMap,
        sharedPreconditions,
        usedConnections,
      );
    } else if (child.branch.condition === condition && child.branch.entries === branchEntries) {
      for (const entry of child.branch.entries) {
        renderEntrySteps(
          steps,
          entry,
          moment,
          condition,
          flow,
          ctxMap,
          sharedPreconditions,
          usedConnections,
        );
      }
    }
  }
  return steps;
}

function renderTerminalBranchScenario(
  lines: string[],
  moment: MomentDefinition,
  condition: string,
  branchEntries: readonly MomentEntry[],
  flow: FlowDefinition,
  ctxMap: Map<string, ContextDefinition>,
  ir: IntermediateRepresentation,
): void {
  const tags = ['@terminal', '@failure-path'];
  lines.push(`    ${tags.join(' ')}`);
  lines.push(`    Scenario: ${moment.name} [${condition}]`);

  const failedPrecondition = findFailedPrecondition(moment, ctxMap);
  lines.push(`      Given the ${moment.name.toLowerCase()} is evaluated`);
  if (failedPrecondition) {
    lines.push(`      When ${failedPrecondition.name} is not satisfied`);
  } else {
    lines.push(`      When the outcome is ${condition}`);
  }

  // Render what actually happens on this branch before the flow ends.
  const usedConnections = new Set<string>();
  for (const entry of branchEntries) {
    renderEntrySteps(lines, entry, moment, condition, flow, ctxMap, new Set(), usedConnections);
  }

  if (failedPrecondition) {
    lines.push(`      Then the flow terminates because ${failedPrecondition.description}`);
  } else {
    const terminalNode = branchEntries.find((e) => e.terminal)?.nodeName;
    lines.push(`      Then the flow terminates${terminalNode ? ` at ${terminalNode}` : ''}`);
  }

  const compensation = findCompensationForMoment(moment, ir);
  if (compensation) {
    lines.push(
      `      And saga ${compensation.sagaName} compensation is triggered: ${compensation.compensation}`,
    );
  }

  lines.push('');
}

function buildScenarioTags(
  entries: readonly MomentEntry[],
  moment: MomentDefinition,
  branchCondition: string | undefined,
  flow: FlowDefinition,
  ctxMap: Map<string, ContextDefinition>,
  ir: IntermediateRepresentation,
): string[] {
  const tags: string[] = [];

  collectAggregateTags(entries, ctxMap, tags);
  if (entries.some((e) => findCrossing(e, moment, branchCondition, flow))) tags.push('@crossing');
  collectPolicyTags(entries, ctxMap, tags);
  collectSagaTags(entries, ir, tags);
  collectInvariantTags(entries, ctxMap, tags);

  return [...new Set(tags)];
}

function collectAggregateTags(
  entries: readonly MomentEntry[],
  ctxMap: Map<string, ContextDefinition>,
  tags: string[],
): void {
  for (const entry of entries) {
    const ctx = ctxMap.get(entry.contextId);
    if (!ctx) continue;
    const aggName = findAggregateName(ctx, entry.nodeName);
    if (aggName && !tags.includes(`@aggregate:${aggName}`)) {
      tags.push(`@aggregate:${aggName}`);
    }
  }
}

function collectPolicyTags(
  entries: readonly MomentEntry[],
  ctxMap: Map<string, ContextDefinition>,
  tags: string[],
): void {
  for (const entry of entries) {
    const ctx = ctxMap.get(entry.contextId);
    if (!ctx) continue;
    for (const pol of ctx.policies) {
      if (pol.chainsTo === entry.nodeName) tags.push(`@policy:${pol.name}`);
    }
  }
}

function collectSagaTags(
  entries: readonly MomentEntry[],
  ir: IntermediateRepresentation,
  tags: string[],
): void {
  for (const ctx of ir.contexts) {
    for (const saga of ctx.sagas) {
      if (entries.find((e) => e.nodeName === saga.trigger)) tags.push(`@saga:${saga.name}`);
    }
  }
}

function collectInvariantTags(
  entries: readonly MomentEntry[],
  ctxMap: Map<string, ContextDefinition>,
  tags: string[],
): void {
  for (const entry of entries) {
    const ctx = ctxMap.get(entry.contextId);
    if (!ctx) continue;
    for (const inv of ctx.invariants) {
      const agg = findAggregateName(ctx, entry.nodeName);
      if (inv.scope === agg) tags.push(`@invariant:${inv.id}`);
    }
  }
}

function renderEntrySteps(
  lines: string[],
  entry: MomentEntry,
  moment: MomentDefinition,
  branchCondition: string | undefined,
  flow: FlowDefinition,
  ctxMap: Map<string, ContextDefinition>,
  sharedPreconditions: Set<string> = new Set(),
  usedConnections: Set<string> = new Set(),
): void {
  const ctx = ctxMap.get(entry.contextId);
  const ctxName = entry.contextId.replace(/^ctx-/, '');

  // GN-02: the resolved node kind decides the step keyword — commands render
  // as When steps, everything else as Then steps. Flow-only nodes that core
  // could not resolve default to 'event' and keep the previous behavior.
  if (entry.nodeKind === 'command') {
    renderCommandStep(lines, entry, ctx, ctxName, moment, flow, sharedPreconditions);
  } else {
    renderEventStep(lines, entry, ctx, ctxName, moment, branchCondition, flow, usedConnections);
  }
}

function renderCommandStep(
  lines: string[],
  entry: MomentEntry,
  ctx: ContextDefinition | undefined,
  ctxName: string,
  moment: MomentDefinition,
  flow: FlowDefinition,
  sharedPreconditions: Set<string> = new Set(),
): void {
  const cmd = findCommand(ctx, entry.nodeName);

  if (cmd) {
    for (const pre of cmd.preconditions) {
      if (!sharedPreconditions.has(pre.description)) {
        lines.push(`      Given ${pre.description}`);
      }
    }
  }

  const trigger = findTriggeredBy(entry, moment, flow);
  if (trigger) {
    lines.push(`      And ${trigger} has occurred`);
  }

  const inputs = cmd?.inputs.map((i) => i.name).join(', ') ?? '';
  const withClause = inputs ? ` with ${inputs}` : '';
  lines.push(`      When ${ctxName} performs ${entry.nodeName}${withClause}`);
}

function renderCrossingStep(
  lines: string[],
  entry: MomentEntry,
  crossing: ConnectionDefinition,
): void {
  const targetName = crossing.targetContextId.replace(/^ctx-/, '');
  const contract = 'schemaContract' in crossing ? crossing.schemaContract : null;
  const relType = contract?.relationshipType ?? '';

  lines.push(`      Then ${entry.nodeName} crosses to ${targetName} via ${relType}`);

  if (contract && contract.fields.length > 0) {
    const required = contract.fields.filter((f) => f.required);
    if (required.length > 0) {
      lines.push(`        | ${required.map((f) => f.name).join(' | ')} |`);
      lines.push(`        | ${required.map((f) => f.type).join(' | ')} |`);
    }
  }
}

function renderInternalEventStep(
  lines: string[],
  entry: MomentEntry,
  evt: EventDefinition | undefined,
  ctxName: string,
): void {
  const modifier = entry.optional ? ' (optional)' : entry.terminal ? ' (terminal)' : '';
  lines.push(`      Then ${ctxName} emits ${entry.nodeName}${modifier}`);

  if (evt && evt.fields.length > 0) {
    lines.push(`        carrying ${evt.fields.map((f) => f.name).join(', ')}`);
  }
}

function renderEventStep(
  lines: string[],
  entry: MomentEntry,
  ctx: ContextDefinition | undefined,
  ctxName: string,
  moment: MomentDefinition,
  branchCondition: string | undefined,
  flow: FlowDefinition,
  usedConnections: Set<string> = new Set(),
): void {
  const crossing = findCrossing(entry, moment, branchCondition, flow, usedConnections);
  if (crossing) {
    usedConnections.add(crossing.id);
    renderCrossingStep(lines, entry, crossing);
  } else {
    renderInternalEventStep(lines, entry, findEvent(ctx, entry.nodeName), ctxName);
  }
}

// ============================================================================
// Background & Saga helpers
// ============================================================================

/**
 * Collects all precondition descriptions from all scenarios in a Rule,
 * then returns those that appear in every scenario.
 */
function extractSharedPreconditions(
  moments: MomentDefinition[],
  ctxMap: Map<string, ContextDefinition>,
): Set<string> {
  const scenarioPreconditions = collectAllScenarioPreconditions(moments, ctxMap);
  if (scenarioPreconditions.length === 0) return new Set();

  const first = scenarioPreconditions[0];
  const shared = [...first].filter((desc) => scenarioPreconditions.every((s) => s.has(desc)));
  return new Set(shared);
}

function collectAllScenarioPreconditions(
  moments: MomentDefinition[],
  ctxMap: Map<string, ContextDefinition>,
): Set<string>[] {
  const result: Set<string>[] = [];

  for (const moment of moments) {
    if (moment.branches && moment.branches.length > 0) {
      for (const branch of moment.branches) {
        const isTerminal = branch.entries.some((e) => e.terminal);
        if (isTerminal) continue;
        const allEntries = [...moment.contextEntries, ...branch.entries];
        result.push(collectPreconditionsFromEntries(allEntries, ctxMap));
      }
    } else {
      result.push(collectPreconditionsFromEntries(moment.contextEntries, ctxMap));
    }
  }

  return result;
}

function collectPreconditionsFromEntries(
  entries: readonly MomentEntry[],
  ctxMap: Map<string, ContextDefinition>,
): Set<string> {
  const preconditions = new Set<string>();
  for (const entry of entries) {
    const ctx = ctxMap.get(entry.contextId);
    const cmd = findCommand(ctx, entry.nodeName);
    if (cmd) {
      for (const pre of cmd.preconditions) {
        preconditions.add(pre.description);
      }
    }
  }
  return preconditions;
}

function renderBackgroundBlock(lines: string[], sharedPreconditions: Set<string>): void {
  if (sharedPreconditions.size === 0) return;
  lines.push('    Background:');
  for (const desc of sharedPreconditions) {
    lines.push(`      Given ${desc}`);
  }
  lines.push('');
}

/**
 * Assigns each saga in the spec to exactly one owning flow: the first flow
 * containing the saga's trigger node, falling back to the first flow. Returns
 * the ids of sagas owned by `flow`.
 */
function collectOwnedSagaIds(flow: FlowDefinition, ir: IntermediateRepresentation): Set<string> {
  const owned = new Set<string>();
  for (const ctx of ir.contexts) {
    for (const saga of ctx.sagas) {
      const owner = ir.flows.find((f) => flowContainsNode(f, saga.trigger)) ?? ir.flows[0];
      if (owner && owner.id === flow.id) owned.add(saga.id);
    }
  }
  return owned;
}

function flowContainsNode(flow: FlowDefinition, nodeName: string): boolean {
  for (const moment of flow.moments) {
    if (momentContainsNode(moment, nodeName)) return true;
  }
  return false;
}

function renderSagaScenarios(
  lines: string[],
  ctxId: string,
  ir: IntermediateRepresentation,
  ownedSagaIds: Set<string>,
): void {
  const ctx = ir.contexts.find((c) => c.id === ctxId);
  if (!ctx) return;
  for (const saga of ctx.sagas) {
    if (!ownedSagaIds.has(saga.id)) continue;
    renderSagaTransitionScenario(lines, saga);
    renderSagaCompensationScenario(lines, saga);
  }
}

function renderOrphanOwnedSagas(
  lines: string[],
  ir: IntermediateRepresentation,
  contextGroups: Map<string, MomentDefinition[]>,
  ownedSagaIds: Set<string>,
): void {
  for (const ctx of ir.contexts) {
    if (contextGroups.has(ctx.id)) continue;
    const owned = ctx.sagas.filter((s) => ownedSagaIds.has(s.id));
    if (owned.length === 0) continue;

    const classification = ctx.classification ? ` [${ctx.classification}]` : '';
    lines.push(`  Rule: ${ctx.name}${classification}`);
    lines.push('');
    for (const saga of owned) {
      renderSagaTransitionScenario(lines, saga);
      renderSagaCompensationScenario(lines, saga);
    }
  }
}

function renderSagaTransitionScenario(lines: string[], saga: SagaDefinition): void {
  lines.push(`    @saga:${saga.name}`);
  lines.push(`    Scenario: ${saga.name} state transitions`);
  lines.push(`      Given the saga is triggered by ${saga.trigger}`);
  const stateChain = saga.states.join(' \u2192 ');
  lines.push(`      Then states progress: ${stateChain}`);
  lines.push('');
}

function renderSagaCompensationScenario(lines: string[], saga: SagaDefinition): void {
  lines.push(`    @saga:${saga.name} @compensation`);
  lines.push(`    Scenario: ${saga.name} compensation`);
  lines.push(`      When ${saga.timeout} is exceeded`);
  lines.push(`      Then ${saga.compensation} is executed`);
  lines.push('');
}

/**
 * For a terminal branch, a failed precondition is only attributable when the
 * moment itself evaluates a command that declares one. Sibling branches are
 * never consulted — their preconditions belong to other outcomes and citing
 * them would fabricate a cause the spec does not state.
 */
function findFailedPrecondition(
  moment: MomentDefinition,
  ctxMap: Map<string, ContextDefinition>,
): PreconditionDefinition | undefined {
  for (const entry of moment.contextEntries) {
    if (entry.nodeKind !== 'command') continue;
    const ctx = ctxMap.get(entry.contextId);
    const cmd = findCommand(ctx, entry.nodeName);
    if (cmd && cmd.preconditions.length > 0) {
      return cmd.preconditions[0];
    }
  }

  return undefined;
}

function findCompensationForMoment(
  moment: MomentDefinition,
  ir: IntermediateRepresentation,
): { sagaName: string; compensation: string } | undefined {
  const primaryCtxId = moment.contextEntries[0]?.contextId;
  if (!primaryCtxId) return undefined;

  const ctx = ir.contexts.find((c) => c.id === primaryCtxId);
  if (!ctx || ctx.sagas.length === 0) return undefined;

  for (const saga of ctx.sagas) {
    const hasTrigger =
      moment.contextEntries.some((e) => e.nodeName === saga.trigger) ||
      moment.branches?.some((b) => b.entries.some((e) => e.nodeName === saga.trigger));
    if (hasTrigger) {
      return { sagaName: saga.name, compensation: saga.compensation };
    }
  }

  return undefined;
}

// ============================================================================
// Helpers
// ============================================================================

type OrderedMomentChild =
  | { kind: 'entry'; entry: MomentEntry }
  | { kind: 'branch'; branch: BranchDefinition };

/**
 * Sequence-aware iteration over a moment's children (M-S12): honors the IR's
 * textual child order (`MomentDefinition.sequence`) when present and usable,
 * falling back to the legacy entries-then-branches order. Today's grammar
 * cannot interleave entries and `when` blocks, so on parsed specs the two
 * orders coincide — asserted by the sequence-identity test.
 */
function orderedMomentChildren(moment: MomentDefinition): OrderedMomentChild[] {
  const entries = moment.contextEntries;
  const branches = moment.branches ?? [];
  const seq = moment.sequence;

  if (seq && isUsableSequence(seq, entries.length, branches.length)) {
    return seq.map((item) =>
      item.kind === 'entry'
        ? { kind: 'entry' as const, entry: entries[item.index] }
        : { kind: 'branch' as const, branch: branches[item.index] },
    );
  }

  return [
    ...entries.map((entry) => ({ kind: 'entry' as const, entry })),
    ...branches.map((branch) => ({ kind: 'branch' as const, branch })),
  ];
}

function isUsableSequence(
  seq: readonly { kind: 'entry' | 'branch'; index: number }[],
  entryCount: number,
  branchCount: number,
): boolean {
  if (seq.length !== entryCount + branchCount) return false;
  const seenEntries = new Set<number>();
  const seenBranches = new Set<number>();
  for (const item of seq) {
    const max = item.kind === 'entry' ? entryCount : branchCount;
    const seen = item.kind === 'entry' ? seenEntries : seenBranches;
    if (item.index < 0 || item.index >= max || seen.has(item.index)) return false;
    seen.add(item.index);
  }
  return true;
}

/** The moment's main (non-branch) entries in textual order. */
function orderedMainEntries(moment: MomentDefinition): MomentEntry[] {
  const out: MomentEntry[] = [];
  for (const child of orderedMomentChildren(moment)) {
    if (child.kind === 'entry') out.push(child.entry);
  }
  return out;
}

/**
 * A scenario's first step must open with Given or When — a leading `And` has
 * nothing to continue from and is invalid Gherkin. Promote it to Given.
 */
function promoteLeadingAnd(steps: string[]): void {
  if (steps.length === 0) return;
  const first = steps[0];
  if (first.trimStart().startsWith('And ')) {
    steps[0] = first.replace('And ', 'Given ');
  }
}

function findCommand(
  ctx: ContextDefinition | undefined,
  name: string,
): CommandDefinition | undefined {
  if (!ctx) return undefined;
  for (const agg of ctx.aggregates) {
    const cmd = agg.commands.find((c) => c.name === name);
    if (cmd) return cmd;
  }
  return undefined;
}

function findEvent(ctx: ContextDefinition | undefined, name: string): EventDefinition | undefined {
  if (!ctx) return undefined;
  for (const agg of ctx.aggregates) {
    const evt = agg.events.find((e) => e.name === name);
    if (evt) return evt;
  }
  return undefined;
}

function findAggregateName(ctx: ContextDefinition, nodeName: string): string {
  for (const agg of ctx.aggregates) {
    if (agg.commands.some((c) => c.name === nodeName)) return agg.name;
    if (agg.events.some((e) => e.name === nodeName)) return agg.name;
  }
  return '';
}

function momentContainsNode(moment: MomentDefinition, nodeName: string): boolean {
  if (moment.contextEntries.some((e) => e.nodeName === nodeName)) return true;
  for (const branch of moment.branches ?? []) {
    if (branch.entries.some((e) => e.nodeName === nodeName)) return true;
  }
  return false;
}

function findTriggeredBy(
  entry: MomentEntry,
  moment: MomentDefinition,
  flow: FlowDefinition,
): string | undefined {
  for (const conn of flow.connections) {
    if (conn.connectionType !== 'triggered-by') continue;
    const triggerEventName = conn.eventId.replace(/^evt-/, '');
    if (conn.targetNodeName) {
      // Attribute the trigger to the node that actually carries the
      // `triggered-by` annotation, not to every node in the same moment.
      if (conn.sourceMomentId === moment.id && conn.targetNodeName === entry.nodeName) {
        return triggerEventName;
      }
    } else {
      // Legacy connections without endpoint names: fall back to membership.
      const owner = flow.moments.find((m) => m.id === conn.sourceMomentId);
      if (owner && momentContainsNode(owner, entry.nodeName)) return triggerEventName;
    }
  }
  return undefined;
}

/**
 * Finds the crossing declared by this entry in this moment (and branch).
 * Matching is scoped to (sourceMomentId, node) so an event that crosses to
 * several targets from different moments renders each crossing with its own
 * contract instead of repeating the first flow-wide match. `usedConnections`
 * lets duplicate placements of the same node consume distinct connections.
 */
function findCrossing(
  entry: MomentEntry,
  moment: MomentDefinition,
  branchCondition: string | undefined,
  flow: FlowDefinition,
  usedConnections: Set<string> = new Set(),
): ConnectionDefinition | undefined {
  return flow.connections.find(
    (c) =>
      c.connectionType === 'crosses-to' &&
      c.sourceMomentId === moment.id &&
      (c.sourceNodeName
        ? c.sourceNodeName === entry.nodeName
        : c.eventId === `evt-${entry.nodeName}`) &&
      (c.branchCondition === undefined || c.branchCondition === branchCondition) &&
      !usedConnections.has(c.id),
  );
}

function findReturnsTo(
  moment: MomentDefinition,
  branchCondition: string,
  flow: FlowDefinition,
): ConnectionDefinition | undefined {
  return flow.connections.find(
    (c) =>
      c.connectionType === 'returns-to' &&
      c.sourceMomentId === moment.id &&
      (c.branchCondition === undefined || c.branchCondition === branchCondition),
  );
}

function resolveReturnsToLabel(
  conn: ConnectionDefinition,
  flow: FlowDefinition,
): string | undefined {
  if (conn.targetMomentId) {
    const target = flow.moments.find((m) => m.id === conn.targetMomentId);
    if (target) return target.name;
  }
  return 'targetMomentLabel' in conn ? conn.targetMomentLabel : undefined;
}

function collectFlowContextIds(flow: FlowDefinition): string[] {
  const ids = new Set<string>();
  for (const m of flow.moments) {
    for (const e of m.contextEntries) ids.add(e.contextId);
    for (const b of m.branches ?? []) {
      for (const e of b.entries) ids.add(e.contextId);
    }
  }
  return [...ids];
}

function groupMomentsByContext(flow: FlowDefinition): Map<string, MomentDefinition[]> {
  const groups = new Map<string, MomentDefinition[]>();

  for (const moment of flow.moments) {
    const primaryCtx =
      moment.contextEntries[0]?.contextId ??
      moment.branches?.[0]?.entries?.[0]?.contextId ??
      'unknown';

    const existing = groups.get(primaryCtx) ?? [];
    existing.push(moment);
    groups.set(primaryCtx, existing);
  }

  return groups;
}
