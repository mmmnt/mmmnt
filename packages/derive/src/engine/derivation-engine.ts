import { createHash } from 'node:crypto';
import type {
  IntermediateRepresentation,
  FlowDefinition,
  FrameDefinition,
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
  const testCases = flow.frames.flatMap((frame) => deriveTestCases(frame, flow.connections));

  const contextsCovered = collectContextIds(flow);

  return {
    flowId: flow.id,
    flowName: flow.name,
    testCases,
    contextsCovered,
  };
}

function deriveTestCases(
  frame: FrameDefinition,
  connections: ConnectionDefinition[],
): TestCaseDefinition[] {
  const crossings = connections.filter(
    (c): c is ConnectionDefinition & { connectionType: 'crosses-to' } =>
      c.sourceFrameId === frame.id && c.connectionType === 'crosses-to',
  );

  const assertions = crossings.map((conn) => mapCrossingToAssertion(conn, frame));

  const baseCase: TestCaseDefinition = {
    frameId: frame.id,
    frameName: frame.name,
    assertions,
    setupSteps: [],
  };

  if (frame.branches && frame.branches.length > 0) {
    return frame.branches.map((branch) => ({
      ...baseCase,
      variant: branch.condition,
    }));
  }

  return [baseCase];
}

function resolveSourceContextId(
  conn: ConnectionDefinition & { connectionType: 'crosses-to' },
  frame: FrameDefinition,
): string {
  const branchEntries = (frame.branches ?? []).flatMap((b) => b.entries);
  const allEntries = [...frame.contextEntries, ...branchEntries];

  // For multi-context frames, prefer the entry that is NOT the crossing target
  const nonTarget = allEntries.find((e) => e.contextId !== conn.targetContextId);
  return nonTarget ? nonTarget.contextId : allEntries[0].contextId;
}

function mapCrossingToAssertion(
  conn: ConnectionDefinition & { connectionType: 'crosses-to' },
  frame: FrameDefinition,
): AssertionPoint {
  const sourceContextId = resolveSourceContextId(conn, frame);
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
  for (const frame of flow.frames) {
    for (const entry of frame.contextEntries) {
      ids.add(entry.contextId);
    }
    for (const branch of frame.branches ?? []) {
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
