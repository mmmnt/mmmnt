import { createHash } from 'node:crypto';
import type {
  IntermediateRepresentation,
  FlowDefinition,
  MomentDefinition,
  ConnectionDefinition,
  ContextDefinition,
} from '@mmmnt/core';
import type {
  TestSuiteTopology,
  TestSuiteDefinition,
  TestCaseDefinition,
  AssertionPoint,
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
    deriveTestCases(moment, flow),
  );

  // Saga test cases
  const sagaCases = deriveSagaTestCases(ctxMap);
  testCases.push(...sagaCases);

  // Policy chain assertions
  const policyCases = derivePolicyChainTestCases(ctxMap);
  testCases.push(...policyCases);

  return {
    flowId: flow.id,
    flowName: flow.name,
    testCases,
    contextsCovered: collectContextIds(flow),
  };
}

function deriveSagaTestCases(
  ctxMap: Map<string, ContextDefinition>,
): TestCaseDefinition[] {
  const cases: TestCaseDefinition[] = [];

  for (const [, ctx] of ctxMap) {
    for (const saga of ctx.sagas) {
      cases.push(buildSagaInitCase(ctx, saga));
      cases.push(...buildSagaTransitionCases(ctx, saga));
      cases.push(buildSagaCompensationCase(ctx, saga));
    }
  }

  return cases;
}

function buildSagaInitCase(
  ctx: ContextDefinition,
  saga: ContextDefinition['sagas'][number],
): TestCaseDefinition {
  return {
    momentId: `saga-${saga.name}-initiated`,
    momentName: `Saga: ${saga.name} initiated`,
    assertions: [{
      crossingId: `saga-init-${saga.name}`,
      sourceContext: ctx.id,
      targetContext: ctx.id,
      schemaContract: { eventType: saga.trigger, expectedFields: [] },
      assertionType: 'saga',
    }],
    setupSteps: [{ contextName: ctx.name, aggregateName: saga.name, precondition: `${saga.trigger} occurs` }],
  };
}

function buildSagaTransitionCases(
  ctx: ContextDefinition,
  saga: ContextDefinition['sagas'][number],
): TestCaseDefinition[] {
  const cases: TestCaseDefinition[] = [];
  for (let i = 0; i < saga.states.length - 1; i++) {
    cases.push({
      momentId: `saga-${saga.name}-${saga.states[i]}-to-${saga.states[i + 1]}`,
      momentName: `Saga: ${saga.name} ${saga.states[i]} → ${saga.states[i + 1]}`,
      assertions: [{
        crossingId: `saga-transition-${saga.name}-${i}`,
        sourceContext: ctx.id,
        targetContext: ctx.id,
        schemaContract: { eventType: `${saga.name}.${saga.states[i + 1]}`, expectedFields: [] },
        assertionType: 'saga',
      }],
      setupSteps: [{ contextName: ctx.name, aggregateName: saga.name, precondition: `Saga is in ${saga.states[i]} state` }],
    });
  }
  return cases;
}

function buildSagaCompensationCase(
  ctx: ContextDefinition,
  saga: ContextDefinition['sagas'][number],
): TestCaseDefinition {
  return {
    momentId: `saga-${saga.name}-compensation`,
    momentName: `Saga: ${saga.name} compensation`,
    assertions: [{
      crossingId: `saga-comp-${saga.name}`,
      sourceContext: ctx.id,
      targetContext: ctx.id,
      schemaContract: { eventType: `${saga.name}.Compensated`, expectedFields: [] },
      assertionType: 'saga',
    }],
    setupSteps: [{ contextName: ctx.name, aggregateName: saga.name, precondition: saga.compensation }],
  };
}

function derivePolicyChainTestCases(
  ctxMap: Map<string, ContextDefinition>,
): TestCaseDefinition[] {
  const cases: TestCaseDefinition[] = [];

  for (const [, ctx] of ctxMap) {
    for (const pol of ctx.policies) {
      if (!pol.chainsTo) continue;
      cases.push({
        momentId: `policy-${pol.name}`,
        momentName: `Policy: ${pol.name}`,
        assertions: [{
          crossingId: `policy-chain-${pol.name}`,
          sourceContext: ctx.id,
          targetContext: ctx.id,
          schemaContract: { eventType: pol.chainsTo, expectedFields: [] },
          assertionType: 'policy-chain',
        }],
        setupSteps: [{
          contextName: ctx.name,
          aggregateName: pol.name,
          precondition: `${pol.trigger} occurs → ${pol.chainsTo} must follow`,
        }],
      });
    }
  }

  return cases;
}

function deriveTestCases(
  moment: MomentDefinition,
  flow: FlowDefinition,
): TestCaseDefinition[] {
  const crossings = flow.connections.filter(
    (c): c is ConnectionDefinition & { connectionType: 'crosses-to' } =>
      c.sourceMomentId === moment.id && c.connectionType === 'crosses-to',
  );

  const assertions = crossings.map((conn) => mapCrossingToAssertion(conn, moment));

  const baseCase: TestCaseDefinition = {
    momentId: moment.id,
    momentName: moment.name,
    assertions,
    setupSteps: [],
  };

  if (moment.branches && moment.branches.length > 0) {
    return moment.branches.map((branch) => ({
      ...baseCase,
      variant: branch.condition,
    }));
  }

  return [baseCase];
}

function mapCrossingToAssertion(
  conn: ConnectionDefinition & { connectionType: 'crosses-to' },
  moment: MomentDefinition,
): AssertionPoint {
  const sourceContextId = resolveSourceContextId(conn, moment);

  const expectedFields: FieldConstraint[] = conn.schemaContract.fields.map((f) => ({
    fieldName: f.name,
    expectedType: f.type,
    required: f.required,
  }));

  return {
    crossingId: conn.id,
    sourceContext: sourceContextId,
    targetContext: conn.targetContextId,
    schemaContract: {
      eventType: conn.schemaContract.eventType,
      expectedFields,
    },
    assertionType: 'payload',
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
