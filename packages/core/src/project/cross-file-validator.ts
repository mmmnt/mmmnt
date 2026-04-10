/**
 * CrossFileValidator — post-merge validation of cross-file references.
 *
 * Runs on the merged IR after all files have been parsed independently
 * and their IRs concatenated. Checks that every cross-file reference
 * (flow lanes → contexts, crossings → target contexts, relationships)
 * resolves to an entity that actually exists in the merged IR.
 *
 * Per ADR-034 G8: this is a dedicated post-merge pass, NOT a re-run of
 * the Langium validators. The Langium validators run per-file during
 * parsing and accept unresolved cross-file refs as warnings. This
 * validator promotes those warnings to errors when the merged IR proves
 * the reference is genuinely unresolvable.
 */

import type { IntermediateRepresentation, FlowDefinition, Diagnostic } from '../ir/index.js';

export interface CrossFileValidationResult {
  readonly valid: boolean;
  readonly diagnostics: readonly Diagnostic[];
}

/** Build the set of known context IDs from the merged contexts. */
function buildKnownContextIds(ir: IntermediateRepresentation): Set<string> {
  return new Set(ir.contexts.map((c) => c.id));
}

/** Build event names per context for crossing validation. Uses the
 *  flattened ctx.events rather than walking aggregates — simpler and
 *  resilient if event modeling changes. */
function buildEventsByContext(ir: IntermediateRepresentation): Map<string, Set<string>> {
  const result = new Map<string, Set<string>>();
  for (const ctx of ir.contexts) {
    result.set(ctx.id, new Set(ctx.events.map((evt) => evt.name)));
  }
  return result;
}

/** Collect context IDs from branch-lanes and terminal lanes (not real contexts). */
function buildBranchLaneContextIds(ir: IntermediateRepresentation): Set<string> {
  const ids = new Set<string>();
  for (const flow of ir.flows) {
    for (const lane of flow.lanes) {
      if (lane.isBranch || lane.classification === 'Terminal') {
        ids.add(lane.contextId);
      }
    }
  }
  return ids;
}

/** Validate that each non-branch lane's contextId exists. */
function validateLanes(
  flow: FlowDefinition,
  knownContextIds: Set<string>,
  diagnostics: Diagnostic[],
): void {
  for (const lane of flow.lanes) {
    if (lane.isBranch || lane.classification === 'Terminal') continue;
    if (!knownContextIds.has(lane.contextId)) {
      diagnostics.push({
        severity: 'error',
        message: `Flow '${flow.name}', lane '${lane.id}': references context '${lane.label}' (${lane.contextId}) which is not defined in any loaded file.`,
        ruleId: 'PM-02',
      });
    }
  }
}

/** Validate crossing connections only — non-crossing connections reference
 *  their own lane's context which is already covered by PM-02. */
function validateConnections(
  flow: FlowDefinition,
  knownContextIds: Set<string>,
  eventsByContext: Map<string, Set<string>>,
  diagnostics: Diagnostic[],
): void {
  for (const conn of flow.connections) {
    if (conn.connectionType !== 'crosses-to') continue;
    if (!knownContextIds.has(conn.targetContextId)) {
      diagnostics.push({
        severity: 'error',
        message: `Flow '${flow.name}', connection '${conn.id}': target context '${conn.targetContextId}' is not defined in any loaded file.`,
        ruleId: 'PM-03',
      });
      continue;
    }
    const targetEvents = eventsByContext.get(conn.targetContextId);
    const eventName = conn.eventId.replace(/^evt-/, '');
    if (targetEvents && !targetEvents.has(eventName)) {
      diagnostics.push({
        severity: 'warning',
        message: `Flow '${flow.name}': crossing event '${eventName}' is not declared in target context '${conn.targetContextId}'.`,
        ruleId: 'PM-04',
      });
    }
  }
}

/** Check a single context entry against known IDs, skipping synthetic lane contexts. */
function checkEntry(
  flowName: string,
  momentName: string,
  entry: { contextId: string; nodeName: string },
  knownContextIds: Set<string>,
  branchLaneContextIds: Set<string>,
  diagnostics: Diagnostic[],
): void {
  if (branchLaneContextIds.has(entry.contextId)) return;
  if (!knownContextIds.has(entry.contextId)) {
    diagnostics.push({
      severity: 'error',
      message: `Flow '${flowName}', moment '${momentName}': node '${entry.nodeName}' references context '${entry.contextId}' which is not defined in any loaded file.`,
      ruleId: 'PM-05',
    });
  }
}

/** Validate that moment entries (including branch when-block entries)
 *  reference existing contexts. */
function validateMomentEntries(
  flow: FlowDefinition,
  knownContextIds: Set<string>,
  branchLaneContextIds: Set<string>,
  diagnostics: Diagnostic[],
): void {
  for (const moment of flow.moments) {
    for (const entry of moment.contextEntries) {
      checkEntry(flow.name, moment.name, entry, knownContextIds, branchLaneContextIds, diagnostics);
    }
    // Also validate entries inside branch when-blocks.
    if (moment.branches) {
      for (const branch of moment.branches) {
        for (const entry of branch.entries) {
          checkEntry(
            flow.name,
            moment.name,
            entry,
            knownContextIds,
            branchLaneContextIds,
            diagnostics,
          );
        }
      }
    }
  }
}

/** Validate that relationship endpoints reference existing contexts. */
function validateRelationships(
  ir: IntermediateRepresentation,
  knownContextIds: Set<string>,
  diagnostics: Diagnostic[],
): void {
  for (const rel of ir.relationships) {
    if (!knownContextIds.has(rel.sourceContextId)) {
      diagnostics.push({
        severity: 'error',
        message: `Relationship: source context '${rel.sourceContextId}' is not defined in any loaded file.`,
        ruleId: 'PM-06',
      });
    }
    if (!knownContextIds.has(rel.targetContextId)) {
      diagnostics.push({
        severity: 'error',
        message: `Relationship: target context '${rel.targetContextId}' is not defined in any loaded file.`,
        ruleId: 'PM-06',
      });
    }
  }
}

/**
 * Validate that all cross-file references in a merged IR resolve to
 * entities that exist in the merged contexts/flows/relationships.
 */
export function validateCrossFileReferences(
  ir: IntermediateRepresentation,
): CrossFileValidationResult {
  const diagnostics: Diagnostic[] = [];
  const knownContextIds = buildKnownContextIds(ir);
  const eventsByContext = buildEventsByContext(ir);
  const branchLaneContextIds = buildBranchLaneContextIds(ir);

  for (const flow of ir.flows) {
    validateLanes(flow, knownContextIds, diagnostics);
    validateConnections(flow, knownContextIds, eventsByContext, diagnostics);
    validateMomentEntries(flow, knownContextIds, branchLaneContextIds, diagnostics);
  }
  validateRelationships(ir, knownContextIds, diagnostics);

  return {
    valid: diagnostics.filter((d) => d.severity === 'error').length === 0,
    diagnostics,
  };
}
