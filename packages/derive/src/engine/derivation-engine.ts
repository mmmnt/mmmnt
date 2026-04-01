import { createHash } from 'node:crypto';
import type {
  IntermediateRepresentation,
  FlowDefinition,
  MomentDefinition,
  MomentEntry,
  ConnectionDefinition,
  ContextDefinition,
} from '@mmmnt/core';
import type {
  TestSuiteTopology,
  TestSuiteDefinition,
  TestCaseDefinition,
  AssertionPoint,
  SetupStep,
  FieldConstraint,
} from '../types/index.js';

/**
 * Derives a TestSuiteTopology from an IntermediateRepresentation.
 * Pure function when derivedAt is provided.
 */
export function deriveTopology(
  ir: IntermediateRepresentation,
  derivedAt?: string,
): TestSuiteTopology {
  const ctxMap = new Map(ir.contexts.map((c) => [c.id, c]));
  const suites = ir.flows.map((flow) => deriveTestSuite(flow, ctxMap));
  const sourceIrHash = computeHash(ir);

  return {
    suites,
    metadata: { sourceIrHash, derivedAt: derivedAt ?? new Date().toISOString() },
  };
}

function deriveTestSuite(
  flow: FlowDefinition,
  ctxMap: Map<string, ContextDefinition>,
): TestSuiteDefinition {
  const testCases = flow.moments.flatMap((moment) =>
    deriveTestCases(moment, flow, ctxMap),
  );

  return {
    flowId: flow.id,
    flowName: flow.name,
    testCases,
    contextsCovered: collectContextIds(flow),
  };
}

function deriveTestCases(
  moment: MomentDefinition,
  flow: FlowDefinition,
  ctxMap: Map<string, ContextDefinition>,
): TestCaseDefinition[] {
  if (moment.branches && moment.branches.length > 0) {
    return moment.branches.map((branch) => {
      const entries = [...moment.contextEntries, ...branch.entries];
      return buildTestCase(moment, entries, flow, ctxMap, branch.condition);
    });
  }

  return [buildTestCase(moment, moment.contextEntries, flow, ctxMap)];
}

function buildTestCase(
  moment: MomentDefinition,
  entries: readonly MomentEntry[],
  flow: FlowDefinition,
  ctxMap: Map<string, ContextDefinition>,
  variant?: string,
): TestCaseDefinition {
  const assertions: AssertionPoint[] = [];
  const setupSteps: SetupStep[] = [];

  for (const entry of entries) {
    deriveEntryAssertions(entry, moment, flow, ctxMap, assertions, setupSteps);
  }

  return {
    momentId: moment.id,
    momentName: moment.name,
    assertions,
    setupSteps,
    variant,
  };
}

function deriveEntryAssertions(
  entry: MomentEntry,
  moment: MomentDefinition,
  flow: FlowDefinition,
  ctxMap: Map<string, ContextDefinition>,
  assertions: AssertionPoint[],
  setupSteps: SetupStep[],
): void {
  const ctx = ctxMap.get(entry.contextId);
  const ctxName = entry.contextId.replace(/^ctx-/, '');

  if (isCommand(entry.nodeName, ctx)) {
    deriveCommandAssertions(entry, ctx, ctxName, flow, assertions, setupSteps);
  } else {
    deriveEventAssertions(entry, moment, ctx, ctxName, flow, assertions);
  }
}

function deriveCommandAssertions(
  entry: MomentEntry,
  ctx: ContextDefinition | undefined,
  ctxName: string,
  flow: FlowDefinition,
  assertions: AssertionPoint[],
  setupSteps: SetupStep[],
): void {
  const cmd = findCommand(ctx, entry.nodeName);

  // Preconditions → setupSteps
  if (cmd) {
    for (const pre of cmd.preconditions) {
      setupSteps.push({
        contextName: ctxName,
        aggregateName: findAggregateName(ctx, entry.nodeName),
        precondition: pre.description,
      });
    }
  }

  // triggered-by → setupStep
  const trigger = findTriggeredBy(entry, flow);
  if (trigger) {
    setupSteps.push({
      contextName: ctxName,
      aggregateName: findAggregateName(ctx, entry.nodeName),
      precondition: `${trigger} has occurred`,
    });
  }

  // Command itself → assertion
  const fields: FieldConstraint[] = (cmd?.inputs ?? []).map((i) => ({
    fieldName: i.name,
    expectedType: i.type + (i.isArray ? '[]' : ''),
    required: i.required,
  }));

  assertions.push({
    crossingId: `cmd-${entry.nodeName}`,
    sourceContext: entry.contextId,
    targetContext: entry.contextId,
    schemaContract: { eventType: entry.nodeName, expectedFields: fields },
    assertionType: 'command',
  });
}

function deriveEventAssertions(
  entry: MomentEntry,
  moment: MomentDefinition,
  ctx: ContextDefinition | undefined,
  ctxName: string,
  flow: FlowDefinition,
  assertions: AssertionPoint[],
): void {
  const crossing = findCrossing(entry, flow);

  if (crossing && 'schemaContract' in crossing) {
    assertions.push(mapCrossingToAssertion(crossing, moment));
    return;
  }

  // Internal event → assertion with event fields
  const evt = findEvent(ctx, entry.nodeName);
  const fields: FieldConstraint[] = (evt?.fields ?? []).map((f) => ({
    fieldName: f.name,
    expectedType: f.type + (f.isArray ? '[]' : ''),
    required: f.required,
  }));

  assertions.push({
    crossingId: `evt-${entry.nodeName}`,
    sourceContext: entry.contextId,
    targetContext: entry.contextId,
    schemaContract: { eventType: entry.nodeName, expectedFields: fields },
    assertionType: 'event',
  });
}

function mapCrossingToAssertion(
  conn: ConnectionDefinition & { connectionType: 'crosses-to' },
  moment: MomentDefinition,
): AssertionPoint {
  const sourceContextId = resolveSourceContextId(conn, moment);

  return {
    crossingId: conn.id,
    sourceContext: sourceContextId,
    targetContext: conn.targetContextId,
    schemaContract: {
      eventType: conn.schemaContract.eventType,
      expectedFields: conn.schemaContract.fields.map((f) => ({
        fieldName: f.name,
        expectedType: f.type,
        required: f.required,
      })),
    },
    assertionType: 'crossing',
  };
}

function resolveSourceContextId(
  conn: ConnectionDefinition & { connectionType: 'crosses-to' },
  moment: MomentDefinition,
): string {
  const branchEntries = (moment.branches ?? []).flatMap((b) => b.entries);
  const allEntries = [...moment.contextEntries, ...branchEntries];

  if (allEntries.length === 1) return allEntries[0].contextId;

  const nonTarget = allEntries.filter((e) => e.contextId !== conn.targetContextId);
  if (nonTarget.length === 1) return nonTarget[0].contextId;
  if (nonTarget.length === 0) return allEntries[0].contextId;

  return nonTarget[0].contextId;
}

// ============================================================================
// Helpers
// ============================================================================

function isCommand(name: string, ctx: ContextDefinition | undefined): boolean {
  if (!ctx) return false;
  return ctx.commands.some((c) => c.name === name);
}

function findCommand(ctx: ContextDefinition | undefined, name: string) {
  if (!ctx) return undefined;
  for (const agg of ctx.aggregates) {
    const cmd = agg.commands.find((c) => c.name === name);
    if (cmd) return cmd;
  }
  return undefined;
}

function findEvent(ctx: ContextDefinition | undefined, name: string) {
  if (!ctx) return undefined;
  for (const agg of ctx.aggregates) {
    const evt = agg.events.find((e) => e.name === name);
    if (evt) return evt;
  }
  return undefined;
}

function findAggregateName(ctx: ContextDefinition | undefined, cmdName: string): string {
  if (!ctx) return '';
  for (const agg of ctx.aggregates) {
    if (agg.commands.some((c) => c.name === cmdName)) return agg.name;
  }
  return '';
}

function findTriggeredBy(entry: MomentEntry, flow: FlowDefinition): string | undefined {
  for (const conn of flow.connections) {
    if (conn.connectionType !== 'triggered-by') continue;
    if (conn.sourceMomentId) {
      const moment = flow.moments.find((m) => m.id === conn.sourceMomentId);
      if (!moment) continue;
      const allEntries = [
        ...moment.contextEntries,
        ...(moment.branches ?? []).flatMap((b) => b.entries),
      ];
      if (allEntries.some((e) => e.nodeName === entry.nodeName)) {
        return conn.eventId.replace(/^evt-/, '');
      }
    }
  }
  return undefined;
}

function findCrossing(entry: MomentEntry, flow: FlowDefinition): ConnectionDefinition | undefined {
  return flow.connections.find(
    (c) => c.connectionType === 'crosses-to' && c.eventId === `evt-${entry.nodeName}`,
  );
}

function collectContextIds(flow: FlowDefinition): string[] {
  const ids = new Set<string>();
  for (const moment of flow.moments) {
    for (const entry of moment.contextEntries) ids.add(entry.contextId);
    for (const branch of moment.branches ?? []) {
      for (const entry of branch.entries) ids.add(entry.contextId);
    }
  }
  for (const conn of flow.connections) ids.add(conn.targetContextId);
  return [...ids];
}

function computeHash(ir: IntermediateRepresentation): string {
  return createHash('sha256').update(JSON.stringify(ir)).digest('hex');
}
