import { createHash } from 'node:crypto';
import type {
  IntermediateRepresentation,
  FlowDefinition,
  MomentDefinition,
  ConnectionDefinition,
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
 * Pure function when derivedAt is provided. If omitted, current time is used.
 */
export function deriveTopology(
  ir: IntermediateRepresentation,
  derivedAt?: string,
): TestSuiteTopology {
  const suites = ir.flows.map((flow) => deriveTestSuite(flow));
  const sourceIrHash = computeHash(ir);

  return {
    suites,
    metadata: { sourceIrHash, derivedAt: derivedAt ?? new Date().toISOString() },
  };
}

function deriveTestSuite(flow: FlowDefinition): TestSuiteDefinition {
  const testCases = flow.moments.flatMap((moment) => deriveTestCases(moment, flow.connections));

  const contextsCovered = collectContextIds(flow);

  return {
    flowId: flow.id,
    flowName: flow.name,
    testCases,
    contextsCovered,
  };
}

function deriveTestCases(
  moment: MomentDefinition,
  connections: ConnectionDefinition[],
): TestCaseDefinition[] {
  const crossings = connections.filter(
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

function resolveSourceContextId(
  conn: ConnectionDefinition & { connectionType: 'crosses-to' },
  moment: MomentDefinition,
): string {
  const branchEntries = (moment.branches ?? []).flatMap((b) => b.entries);
  const allEntries = [...moment.contextEntries, ...branchEntries];

  // Single context — unambiguous
  if (allEntries.length === 1) {
    return allEntries[0].contextId;
  }

  // Multi-context: filter out the target to find source candidates
  const nonTargetEntries = allEntries.filter((e) => e.contextId !== conn.targetContextId);

  if (nonTargetEntries.length === 1) {
    return nonTargetEntries[0].contextId;
  }

  // All entries are the target context — return it
  if (nonTargetEntries.length === 0) {
    return allEntries[0].contextId;
  }

  // Ambiguous: multiple distinct non-target contexts — use first
  return nonTargetEntries[0].contextId;
}

function mapCrossingToAssertion(
  conn: ConnectionDefinition & { connectionType: 'crosses-to' },
  moment: MomentDefinition,
): AssertionPoint {
  const sourceContextId = resolveSourceContextId(conn, moment);
  const targetContextId = conn.targetContextId;
  const { schemaContract } = conn;

  const expectedFields: FieldConstraint[] = schemaContract.fields.map((f) => ({
    fieldName: f.name,
    expectedType: f.type,
    required: f.required,
  }));

  return {
    crossingId: conn.id,
    sourceContext: sourceContextId,
    targetContext: targetContextId,
    schemaContract: {
      eventType: schemaContract.eventType,
      expectedFields,
    },
    assertionType: 'payload',
  };
}

function collectContextIds(flow: FlowDefinition): string[] {
  const ids = new Set<string>();
  for (const moment of flow.moments) {
    for (const entry of moment.contextEntries) {
      ids.add(entry.contextId);
    }
    for (const branch of moment.branches ?? []) {
      for (const entry of branch.entries) {
        ids.add(entry.contextId);
      }
    }
  }
  for (const conn of flow.connections) {
    ids.add(conn.targetContextId);
  }
  return [...ids];
}

function computeHash(ir: IntermediateRepresentation): string {
  const json = JSON.stringify(ir);
  return createHash('sha256').update(json).digest('hex');
}
