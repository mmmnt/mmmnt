import type {
  IntermediateRepresentation,
  FlowDefinition,
  MomentDefinition,
  MomentEntry,
  ConnectionDefinition,
  ContextDefinition,
  CommandDefinition,
  EventDefinition,
} from '@mmmnt/core';

/**
 * Renders a flow into a complete Gherkin .feature file.
 *
 * Uses the IR directly (not just the topology) to generate steps
 * for every command, event, precondition, crossing, and branch.
 *
 * GN-02: Given=precondition, When=command, Then=event
 * GN-03: Exact specification vocabulary preserved
 */
export function renderFeatureFromIr(flow: FlowDefinition, ir: IntermediateRepresentation): string {
  const lines: string[] = [];
  const ctxMap = new Map(ir.contexts.map((c) => [c.id, c]));

  lines.push(`Feature: ${flow.name}`);
  if (flow.description) {
    lines.push(`  ${flow.description}`);
  }
  lines.push('');

  for (const moment of flow.moments) {
    if (moment.branches && moment.branches.length > 0) {
      renderBranchedMoment(lines, moment, flow, ctxMap);
    } else {
      renderMomentScenario(lines, moment, flow, ctxMap, undefined);
    }
  }

  return lines.join('\n').trimEnd() + '\n';
}

function renderMomentScenario(
  lines: string[],
  moment: MomentDefinition,
  flow: FlowDefinition,
  ctxMap: Map<string, ContextDefinition>,
  variant: string | undefined,
): void {
  const label = variant ? `${moment.name} [${variant}]` : moment.name;
  lines.push(`  Scenario: ${label}`);

  const entries = variant
    ? (moment.branches?.find((b) => b.condition === variant)?.entries ?? [])
    : moment.contextEntries;

  // Check if this is a terminal branch (flow ends)
  const isTerminalBranch = variant && entries.some((e) => e.terminal);
  if (isTerminalBranch) {
    lines.push(`    Given the ${moment.name.toLowerCase()} is evaluated`);
    lines.push(`    When the outcome is ${variant}`);
    for (const entry of entries) {
      lines.push(`    Then the flow terminates`);
    }
    return;
  }

  // Include parent moment entries for branch scenarios
  const allEntries = variant ? [...moment.contextEntries, ...entries] : entries;

  for (const entry of allEntries) {
    renderEntrySteps(lines, entry, flow, ctxMap);
  }

  lines.push('');
}

function renderBranchedMoment(
  lines: string[],
  moment: MomentDefinition,
  flow: FlowDefinition,
  ctxMap: Map<string, ContextDefinition>,
): void {
  for (const branch of moment.branches ?? []) {
    renderMomentScenario(lines, moment, flow, ctxMap, branch.condition);
  }
}

function renderEntrySteps(
  lines: string[],
  entry: MomentEntry,
  flow: FlowDefinition,
  ctxMap: Map<string, ContextDefinition>,
): void {
  const ctx = ctxMap.get(entry.contextId);
  const ctxName = entry.contextId.replace(/^ctx-/, '');

  if (entry.nodeKind === 'command' || isCommand(entry.nodeName, ctx)) {
    renderCommandStep(lines, entry, ctx, ctxName, flow);
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
): void {
  const cmd = findCommand(ctx, entry.nodeName);

  // Given: preconditions
  if (cmd) {
    for (const pre of cmd.preconditions) {
      lines.push(`    Given ${pre.description}`);
    }
  }

  // Given: triggered-by (what caused this command)
  const trigger = findTriggeredBy(entry.nodeName, flow);
  if (trigger) {
    lines.push(`    Given ${trigger} has occurred`);
  }

  // When: the command itself
  const inputs = cmd?.inputs.map((i) => i.name).join(', ') ?? '';
  const withClause = inputs ? ` with ${inputs}` : '';
  lines.push(`    When ${ctxName} performs ${entry.nodeName}${withClause}`);
}

function renderCrossingStep(
  lines: string[],
  entry: MomentEntry,
  crossing: ConnectionDefinition,
): void {
  const targetName = crossing.targetContextId.replace(/^ctx-/, '');
  const contract = 'schemaContract' in crossing ? crossing.schemaContract : null;
  const relType = contract?.relationshipType ?? '';

  lines.push(`    Then ${entry.nodeName} crosses to ${targetName} via ${relType}`);

  if (contract && contract.fields.length > 0) {
    const required = contract.fields.filter((f) => f.required);
    if (required.length > 0) {
      lines.push(`      | ${required.map((f) => f.name).join(' | ')} |`);
      lines.push(`      | ${required.map((f) => f.type).join(' | ')} |`);
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
  lines.push(`    Then ${ctxName} emits ${entry.nodeName}${modifier}`);

  if (evt && evt.fields.length > 0) {
    lines.push(`      carrying ${evt.fields.map((f) => f.name).join(', ')}`);
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

function isCommand(nodeName: string, ctx: ContextDefinition | undefined): boolean {
  if (!ctx) return false;
  return ctx.commands.some((c) => c.name === nodeName);
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

function momentContainsNode(moment: MomentDefinition, nodeName: string): boolean {
  if (moment.contextEntries.some((e) => e.nodeName === nodeName)) return true;
  for (const branch of moment.branches ?? []) {
    if (branch.entries.some((e) => e.nodeName === nodeName)) return true;
  }
  return false;
}

function findTriggeredBy(nodeName: string, flow: FlowDefinition): string | undefined {
  for (const conn of flow.connections) {
    if (conn.connectionType !== 'triggered-by') continue;
    const triggerEventName = conn.eventId.replace(/^evt-/, '');
    const moment = flow.moments.find((m) => m.id === conn.sourceMomentId);
    if (moment && momentContainsNode(moment, nodeName)) return triggerEventName;
  }
  return undefined;
}

function findCrossing(entry: MomentEntry, flow: FlowDefinition): ConnectionDefinition | undefined {
  return flow.connections.find(
    (c) => c.connectionType === 'crosses-to' && c.eventId === `evt-${entry.nodeName}`,
  );
}
