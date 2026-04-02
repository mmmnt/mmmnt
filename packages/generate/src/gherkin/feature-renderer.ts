import type {
  IntermediateRepresentation,
  FlowDefinition,
  MomentDefinition,
  MomentEntry,
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
          renderBranchScenario(lines, moment, branch.condition, branch.entries, flow, ctxMap, ir, sharedPreconditions);
        }
      } else {
        renderScenario(lines, moment, moment.contextEntries, flow, ctxMap, ir, undefined, sharedPreconditions);
      }
    }

    renderSagaScenarios(lines, ctxId, ir);
  }
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
  const tags = buildScenarioTags(entries, flow, ctxMap, ir, variant);

  if (tags.length > 0) lines.push(`    ${tags.join(' ')}`);
  lines.push(`    Scenario: ${label}`);

  for (const entry of entries) {
    renderEntrySteps(lines, entry, flow, ctxMap, sharedPreconditions);
  }

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
    renderTerminalBranchScenario(lines, moment, condition, flow, ctxMap, ir);
    return;
  }

  const allEntries = [...moment.contextEntries, ...branchEntries];
  const tags = buildScenarioTags(allEntries, flow, ctxMap, ir, condition);
  if (!tags.includes('@failure-path')) tags.push('@happy-path');

  if (tags.length > 0) lines.push(`    ${tags.join(' ')}`);
  lines.push(`    Scenario: ${moment.name} [${condition}]`);

  for (const entry of allEntries) {
    renderEntrySteps(lines, entry, flow, ctxMap, sharedPreconditions);
  }

  lines.push('');
}

function renderTerminalBranchScenario(
  lines: string[],
  moment: MomentDefinition,
  condition: string,
  flow: FlowDefinition,
  ctxMap: Map<string, ContextDefinition>,
  ir: IntermediateRepresentation,
): void {
  const tags = ['@terminal', '@failure-path'];
  lines.push(`    ${tags.join(' ')}`);
  lines.push(`    Scenario: ${moment.name} [${condition}]`);

  const failedPrecondition = findFailedPrecondition(moment, condition, ctxMap);
  if (failedPrecondition) {
    lines.push(`      Given the ${moment.name.toLowerCase()} is evaluated`);
    lines.push(`      When ${failedPrecondition.name} is not satisfied`);
    lines.push(`      Then the flow terminates because ${failedPrecondition.description}`);
  } else {
    lines.push(`      Given the ${moment.name.toLowerCase()} is evaluated`);
    lines.push(`      When the outcome is ${condition}`);
    lines.push(`      Then the flow terminates`);
  }

  const compensation = findCompensationForMoment(moment, ir);
  if (compensation) {
    lines.push(`      And saga ${compensation.sagaName} compensation is triggered: ${compensation.compensation}`);
  }

  lines.push('');
}

function buildScenarioTags(
  entries: readonly MomentEntry[],
  flow: FlowDefinition,
  ctxMap: Map<string, ContextDefinition>,
  ir: IntermediateRepresentation,
  variant: string | undefined,
): string[] {
  const tags: string[] = [];

  // Aggregate tags
  for (const entry of entries) {
    const ctx = ctxMap.get(entry.contextId);
    if (!ctx) continue;
    const aggName = findAggregateName(ctx, entry.nodeName);
    if (aggName && !tags.includes(`@aggregate:${aggName}`)) {
      tags.push(`@aggregate:${aggName}`);
    }
  }

  // Crossing tag
  const hasCrossing = entries.some((e) => findCrossing(e, flow));
  if (hasCrossing) tags.push('@crossing');

  // Policy tags
  for (const entry of entries) {
    const ctx = ctxMap.get(entry.contextId);
    if (!ctx) continue;
    for (const pol of ctx.policies) {
      if (pol.chainsTo === entry.nodeName) {
        tags.push(`@policy:${pol.name}`);
      }
    }
  }

  // Saga tags
  for (const ctx of ir.contexts) {
    for (const saga of ctx.sagas) {
      const triggerEntry = entries.find((e) => e.nodeName === saga.trigger);
      if (triggerEntry) tags.push(`@saga:${saga.name}`);
    }
  }

  // Invariant tags
  for (const entry of entries) {
    const ctx = ctxMap.get(entry.contextId);
    if (!ctx) continue;
    for (const inv of ctx.invariants) {
      const agg = findAggregateName(ctx, entry.nodeName);
      if (inv.scope === agg) tags.push(`@invariant:${inv.id}`);
    }
  }

  return [...new Set(tags)];
}

function renderEntrySteps(
  lines: string[],
  entry: MomentEntry,
  flow: FlowDefinition,
  ctxMap: Map<string, ContextDefinition>,
  sharedPreconditions: Set<string> = new Set(),
): void {
  const ctx = ctxMap.get(entry.contextId);
  const ctxName = entry.contextId.replace(/^ctx-/, '');

  if (isCommand(entry.nodeName, ctx)) {
    renderCommandStep(lines, entry, ctx, ctxName, flow, sharedPreconditions);
  } else {
    renderEventStep(lines, entry, ctx, ctxName, flow);
  }
}

function renderCommandStep(
  lines: string[],
  entry: MomentEntry,
  ctx: ContextDefinition | undefined,
  ctxName: string,
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

  const trigger = findTriggeredBy(entry, flow);
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
  flow: FlowDefinition,
): void {
  const crossing = findCrossing(entry, flow);
  if (crossing) {
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
  const shared = [...first].filter((desc) =>
    scenarioPreconditions.every((s) => s.has(desc)),
  );
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

function renderSagaScenarios(
  lines: string[],
  ctxId: string,
  ir: IntermediateRepresentation,
): void {
  const ctx = ir.contexts.find((c) => c.id === ctxId);
  if (!ctx) return;
  for (const saga of ctx.sagas) {
    renderSagaTransitionScenario(lines, saga);
    renderSagaCompensationScenario(lines, saga);
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
 * For a terminal branch, find which precondition failed by looking at the
 * non-terminal sibling branches' command preconditions.
 */
function findFailedPrecondition(
  moment: MomentDefinition,
  _condition: string,
  ctxMap: Map<string, ContextDefinition>,
): PreconditionDefinition | undefined {
  if (!moment.branches) return undefined;

  const nonTerminalBranches = moment.branches.filter(
    (b) => !b.entries.some((e) => e.terminal),
  );

  for (const branch of nonTerminalBranches) {
    for (const entry of branch.entries) {
      const ctx = ctxMap.get(entry.contextId);
      const cmd = findCommand(ctx, entry.nodeName);
      if (cmd && cmd.preconditions.length > 0) {
        return cmd.preconditions[0];
      }
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
    const hasTrigger = moment.contextEntries.some((e) => e.nodeName === saga.trigger)
      || moment.branches?.some((b) => b.entries.some((e) => e.nodeName === saga.trigger));
    if (hasTrigger) {
      return { sagaName: saga.name, compensation: saga.compensation };
    }
  }

  return undefined;
}

// ============================================================================
// Helpers
// ============================================================================

function isCommand(name: string, ctx: ContextDefinition | undefined): boolean {
  if (!ctx) return false;
  return ctx.commands.some((c) => c.name === name);
}

function findCommand(ctx: ContextDefinition | undefined, name: string): CommandDefinition | undefined {
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

function findTriggeredBy(entry: MomentEntry, flow: FlowDefinition): string | undefined {
  for (const conn of flow.connections) {
    if (conn.connectionType !== 'triggered-by') continue;
    const triggerEventName = conn.eventId.replace(/^evt-/, '');
    const moment = flow.moments.find((m) => m.id === conn.sourceMomentId);
    if (moment && momentContainsNode(moment, entry.nodeName)) return triggerEventName;
  }
  return undefined;
}

function findCrossing(entry: MomentEntry, flow: FlowDefinition): ConnectionDefinition | undefined {
  return flow.connections.find(
    (c) => c.connectionType === 'crosses-to' && c.eventId === `evt-${entry.nodeName}`,
  );
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
    const primaryCtx = moment.contextEntries[0]?.contextId
      ?? moment.branches?.[0]?.entries?.[0]?.contextId
      ?? 'unknown';

    const existing = groups.get(primaryCtx) ?? [];
    existing.push(moment);
    groups.set(primaryCtx, existing);
  }

  return groups;
}
