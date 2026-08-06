/**
 * MMNT-27 — Custom Validators for the Moment Langium Grammar
 *
 * Pure validation checks operating on Langium AST nodes.
 * Intra-file validators can run on a single parsed document.
 * Cross-file validators require a CrossFileContext parameter.
 */
import type { ValidationAcceptor, ValidationChecks } from 'langium';
import type { LangiumCoreServices } from 'langium';
import type {
  MomentAstType,
  AggregateDeclaration,
  AnnotationDeclaration,
  ContextCrossing,
  ContextDeclaration,
  FieldDeclaration,
  FlowDeclaration,
  InputField,
  MomentDeclaration,
  MomentFile,
  LaneDeclaration,
  NodePlacement,
  SagaDeclaration,
  TriggeredBy,
  Triggers,
} from '../generated/ast.js';
import {
  isAggregateDeclaration,
  isAnnotationDeclaration,
  isCommandDeclaration,
  isDomainEventDeclaration,
  isPolicyDeclaration,
  isReturnsTo,
  isMomentDeclaration,
  isFlowDeclaration,
  isSagaDeclaration,
  isTriggeredBy,
  isTriggers,
  isValueObjectDeclaration,
  isMomentFile,
} from '../generated/ast.js';
import { buildMomentSequence } from '../parser/moment-sequence.js';

// ---------------------------------------------------------------------------
// Cross-file context interface
// ---------------------------------------------------------------------------

export interface CrossFileContext {
  declaredContextNames: string[];
  declaredEvents: Map<string, string[]>; // contextName -> eventNames[]
  declaredBuildingBlocks: Map<
    string,
    {
      name: string;
      kind: 'command' | 'event' | 'policy' | 'saga' | 'projection' | 'value-object';
    }[]
  >;
  declaredSagas: string[];
}

/** Strip surrounding double-quotes from a Langium STRING token value. */
function unquote(s: string): string {
  return s.startsWith('"') && s.endsWith('"') ? s.slice(1, -1) : s;
}

/**
 * Build a CrossFileContext from a single file's OWN context declarations.
 *
 * This makes the cross-file validators (V1/V9/V11, SP-01/SP-02) live for the
 * shipping single-file mode: a spec that declares both contexts and flows can
 * be checked against itself without the unshipped project-mode multi-file
 * parse (M-P3). Flow-only files produce an empty context and must NOT have
 * these checks applied — callers only set the context when the file actually
 * declares contexts.
 */
export function buildCrossFileContext(file: MomentFile): CrossFileContext {
  const declaredContextNames: string[] = [];
  const declaredEvents = new Map<string, string[]>();
  const declaredBuildingBlocks: CrossFileContext['declaredBuildingBlocks'] = new Map();
  const declaredSagas: string[] = [];

  for (const ctx of file.contexts) {
    const contextName = unquote(ctx.name);
    declaredContextNames.push(contextName);
    const events: string[] = [];
    const blocks: {
      name: string;
      kind: 'command' | 'event' | 'policy' | 'saga' | 'projection' | 'value-object';
    }[] = [];

    for (const member of ctx.members) {
      if (isAggregateDeclaration(member)) {
        for (const aggMember of member.members) {
          if (isCommandDeclaration(aggMember)) {
            blocks.push({ name: aggMember.name, kind: 'command' });
          } else if (isDomainEventDeclaration(aggMember)) {
            events.push(aggMember.name);
            blocks.push({ name: aggMember.name, kind: 'event' });
          } else if (isValueObjectDeclaration(aggMember)) {
            blocks.push({ name: aggMember.name, kind: 'value-object' });
          }
        }
      } else if (isPolicyDeclaration(member)) {
        blocks.push({ name: member.name, kind: 'policy' });
      } else if (isSagaDeclaration(member)) {
        blocks.push({ name: member.name, kind: 'saga' });
        declaredSagas.push(member.name);
      }
    }

    declaredEvents.set(contextName, events);
    declaredBuildingBlocks.set(contextName, blocks);
  }

  return { declaredContextNames, declaredEvents, declaredBuildingBlocks, declaredSagas };
}

// ---------------------------------------------------------------------------
// Registration helper
// ---------------------------------------------------------------------------

export type MomentAddedServices = {
  validation: {
    MomentValidator: MomentValidator;
  };
};

export function registerMomentValidationChecks(
  services: LangiumCoreServices & MomentAddedServices,
): void {
  const registry = services.validation.ValidationRegistry;
  const validator = services.validation.MomentValidator;
  const checks: ValidationChecks<MomentAstType> = {
    MomentDeclaration: validator.checkMoment,
    FieldDeclaration: validator.checkDeprecatedReplacement,
    InputField: validator.checkDeprecatedReplacement,
    AnnotationDeclaration: validator.checkAnnotationName,
    ContextDeclaration: validator.checkTrailingAnnotation,
    AggregateDeclaration: validator.checkTrailingAnnotation,
    SagaDeclaration: validator.checkSagaTransitionEvents,
    NodePlacement: [
      validator.checkNodePlacement,
      validator.checkOptionalWithCrossing,
      validator.checkTerminalIsLast,
      validator.checkLaneIdExists,
      validator.checkTriggerDirection,
    ],
    ContextCrossing: [
      validator.checkCrossingEmptyContract,
      validator.checkCrossingTargetBranchLane,
      validator.checkCrossingCrossFileRules,
    ],
    FlowDeclaration: [
      validator.checkReturnsToDepth,
      validator.checkBranchLaneReferenced,
      validator.checkV14,
      validator.checkFlowCrossFileRules,
    ],
  };
  registry.register(checks, validator);
}

// ---------------------------------------------------------------------------
// Helpers: walk the $container chain to find the enclosing Flow/Moment
// ---------------------------------------------------------------------------

function getFlowFromNode(node: { $container?: unknown }): FlowDeclaration | undefined {
  let current: unknown = node;
  while (current) {
    if (isFlowDeclaration(current as Record<string, unknown>)) {
      return current as FlowDeclaration;
    }
    current = (current as { $container?: unknown }).$container;
  }
  return undefined;
}

function collectSiblingNames(field: FieldDeclaration | InputField): Set<string> | undefined {
  // Deprecatable fields live on events/value-objects (.fields), commands
  // (.inputs), or aggregates (identity field — no sibling list to check).
  const container = field.$container as {
    fields?: { name: string }[];
    inputs?: { name: string }[];
  };
  const siblings = container.fields ?? container.inputs;
  return siblings ? new Set(siblings.map((f) => f.name)) : undefined;
}

function laneDeclaresEvent(
  lane: LaneDeclaration | undefined,
  eventName: string,
  ctx: CrossFileContext,
): boolean {
  if (!lane) return false;
  const events = ctx.declaredEvents.get(unquote(lane.label)) ?? [];
  return events.includes(eventName);
}

function getMomentFileFromNode(node: { $container?: unknown }): MomentFile | undefined {
  let current: unknown = node;
  while (current) {
    if (isMomentFile(current as Record<string, unknown>)) {
      return current as MomentFile;
    }
    current = (current as { $container?: unknown }).$container;
  }
  return undefined;
}

function getMomentFromNode(node: { $container?: unknown }): MomentDeclaration | undefined {
  let current: unknown = node;
  while (current) {
    if (isMomentDeclaration(current as Record<string, unknown>)) {
      return current as MomentDeclaration;
    }
    current = (current as { $container?: unknown }).$container;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Validator class
// ---------------------------------------------------------------------------

export class MomentValidator {
  private crossFileContext?: CrossFileContext;

  setCrossFileContext(ctx: CrossFileContext): void {
    this.crossFileContext = ctx;
  }

  clearCrossFileContext(): void {
    this.crossFileContext = undefined;
  }

  // =========================================================================
  // V12: Deprecated field replacement must exist as sibling field
  // =========================================================================
  checkDeprecatedReplacement(
    field: FieldDeclaration | InputField,
    accept: ValidationAcceptor,
  ): void {
    if (!field.deprecation) return;
    const replacement = field.deprecation.replacement.replace(/^"|"$/g, '');
    const siblings = collectSiblingNames(field);
    if (siblings === undefined) return;
    if (!siblings.has(replacement)) {
      accept(
        'warning',
        `V12: Deprecated field '${field.name}' references replacement '${replacement}' which does not exist on this type.`,
        {
          node: field.deprecation,
          property: 'replacement',
        },
      );
    }
  }

  // =========================================================================
  // SP-03: Crossing with empty contract (zero fields) -> error
  // =========================================================================
  checkCrossingEmptyContract(crossing: ContextCrossing, accept: ValidationAcceptor): void {
    if (crossing.fields.length === 0) {
      accept('error', 'SP-03: Crossing contract must contain at least one field.', {
        node: crossing,
        property: 'fields',
      });
    }
  }

  // =========================================================================
  // V2: crosses-to targeting a branch-lane (isBranch=true) -> error
  // =========================================================================
  checkCrossingTargetBranchLane(crossing: ContextCrossing, accept: ValidationAcceptor): void {
    const flow = getFlowFromNode(crossing);
    if (!flow) return;
    const targetLane = flow.lanes.find((l: LaneDeclaration) => l.id === crossing.targetLaneId);
    if (targetLane?.isBranch) {
      accept('error', 'V2: crosses-to must not target a branch-lane.', {
        node: crossing,
        property: 'targetLaneId',
      });
    }
  }

  // =========================================================================
  // V6: returns-to referencing non-existent prior frame label -> error
  // V7: [optional] node with crosses-to -> error
  // V13: Lane ID not matching any declared lane -> error
  // V5 (cross-file): triggered-by must reference earlier node
  // =========================================================================
  checkNodePlacement(node: NodePlacement, accept: ValidationAcceptor): void {
    this.checkReturnsToLabel(node, accept);
    this.checkTriggeredByPrior(node, accept);
    this.checkCrossFileNodeRules(node, accept);
  }

  // =========================================================================
  // V7: [optional] node with crosses-to -> error
  // =========================================================================
  checkOptionalWithCrossing(node: NodePlacement, accept: ValidationAcceptor): void {
    if (node.modifier?.type === 'optional' && node.crossing) {
      accept('error', 'V7: Optional nodes must not have crosses-to.', {
        node: node,
        property: 'crossing',
      });
    }
  }

  // =========================================================================
  // V8: [terminal] must be last node in branch/when block -> error
  //
  // M-P13 blind spot: the sibling-array check cannot see `when` blocks that
  // textually follow a terminal node in the same moment (grammar splits nodes
  // and whenBlocks into separate arrays). CST offsets recover the textual
  // order; a main-list terminal followed by a when block gets a warning.
  // A terminal INSIDE a when block followed by later when blocks is legal —
  // those are alternative branch arms, not continuations.
  // =========================================================================
  checkTerminalIsLast(node: NodePlacement, accept: ValidationAcceptor): void {
    if (node.modifier?.type !== 'terminal') return;
    const container = node.$container;
    const siblings = 'nodes' in container ? container.nodes : [];
    const idx = siblings.indexOf(node);
    if (idx >= 0 && idx < siblings.length - 1) {
      accept('error', 'V8: Terminal node must be the last node in its block.', {
        node: node,
        property: 'modifier',
      });
    }

    if (isMomentDeclaration(container)) {
      // Shared with the IR's MomentDefinition.sequence (M-P13): textual order
      // of the moment's children from CST offsets. Hand-built ASTs without a
      // CST fall back to declaration order, which says nothing about textual
      // position — skip the check there.
      const { sequence, fromCst } = buildMomentSequence(container);
      if (!fromCst) return;
      const nodeIndex = container.nodes.indexOf(node);
      const position = sequence.findIndex((s) => s.kind === 'entry' && s.index === nodeIndex);
      const followedByWhenBlock =
        position >= 0 && sequence.slice(position + 1).some((s) => s.kind === 'branch');
      if (followedByWhenBlock) {
        accept(
          'warning',
          'V8: Terminal node is textually followed by a when block in the same moment; the flow would continue past the terminal.',
          { node: node, property: 'modifier' },
        );
      }
    }
  }

  // =========================================================================
  // V13: Lane ID in node placement not matching any declared lane -> error
  // =========================================================================
  checkLaneIdExists(node: NodePlacement, accept: ValidationAcceptor): void {
    const flow = getFlowFromNode(node);
    if (!flow) return;
    const laneIds = flow.lanes.map((l: LaneDeclaration) => l.id);
    if (!laneIds.includes(node.laneId)) {
      accept('error', 'V13: Lane ID does not match any declared lane.', {
        node: node,
        property: 'laneId',
      });
    }
  }

  // =========================================================================
  // V10: Moment with zero nodes AND zero whenBlocks -> error
  // =========================================================================
  checkMoment(moment: MomentDeclaration, accept: ValidationAcceptor): void {
    if (moment.nodes.length === 0 && moment.whenBlocks.length === 0) {
      accept('error', 'V10: Moment must contain at least one node or when block.', {
        node: moment,
        property: 'label',
      });
    }
  }

  // =========================================================================
  // V18: annotation name must be classification, retention, or encryption
  // =========================================================================
  checkAnnotationName(ann: AnnotationDeclaration, accept: ValidationAcceptor): void {
    const allowed = new Set(['classification', 'retention', 'encryption']);
    if (!allowed.has(ann.name)) {
      accept(
        'error',
        `V18: Unknown annotation '@${ann.name}'. Allowed: @classification, @retention, @encryption.`,
        { node: ann, property: 'name' },
      );
    }
  }

  // =========================================================================
  // V19: trailing annotation classifies nothing -> warning (M-P4)
  // An annotation applies to the NEXT declaration in the member list; when
  // nothing follows it, it silently classifies nothing.
  // =========================================================================
  checkTrailingAnnotation(
    container: ContextDeclaration | AggregateDeclaration,
    accept: ValidationAcceptor,
  ): void {
    const members = container.members;
    for (let i = members.length - 1; i >= 0; i--) {
      const member = members[i];
      if (!isAnnotationDeclaration(member)) break;
      accept(
        'warning',
        `V19: Annotation '@${member.name}' is not followed by a declaration and has no effect.`,
        { node: member, property: 'name' },
      );
    }
  }

  // =========================================================================
  // V20: declared trigger direction vs flow order -> warning (M-S10)
  // `N triggers X` declares N as the cause of X, so X must not be placed
  // before N's moment; `N triggered-by X` declares X as the cause, so X must
  // not be placed after N's moment. Dangling references (X not placed in the
  // flow at all) are V1's job and are skipped here.
  // =========================================================================
  checkTriggerDirection(node: NodePlacement, accept: ValidationAcceptor): void {
    const flow = getFlowFromNode(node);
    const moment = getMomentFromNode(node);
    if (!flow || !moment) return;
    const currentIndex = flow.moments.indexOf(moment);
    if (currentIndex < 0) return;
    const placementIndex = this.buildPlacementIndex(flow);

    for (const conn of node.connections) {
      if (isTriggers(conn)) {
        this.warnIfPlacedBefore(conn, node, placementIndex, currentIndex, accept);
      } else if (isTriggeredBy(conn)) {
        this.warnIfPlacedAfter(conn, node, placementIndex, currentIndex, accept);
      }
    }
  }

  private warnIfPlacedBefore(
    conn: Triggers,
    node: NodePlacement,
    placementIndex: Map<string, number>,
    currentIndex: number,
    accept: ValidationAcceptor,
  ): void {
    const targetIndex = placementIndex.get(conn.nodeName);
    if (targetIndex !== undefined && targetIndex < currentIndex) {
      accept(
        'warning',
        `V20: declared trigger direction contradicts flow order: '${conn.nodeName}' occurs before '${node.nodeName}'.`,
        { node: conn, property: 'nodeName' },
      );
    }
  }

  private warnIfPlacedAfter(
    conn: TriggeredBy,
    node: NodePlacement,
    placementIndex: Map<string, number>,
    currentIndex: number,
    accept: ValidationAcceptor,
  ): void {
    const sourceIndex = placementIndex.get(conn.nodeName);
    if (sourceIndex !== undefined && sourceIndex > currentIndex) {
      accept(
        'warning',
        `V20: declared trigger direction contradicts flow order: trigger '${conn.nodeName}' occurs after '${node.nodeName}'.`,
        { node: conn, property: 'nodeName' },
      );
    }
  }

  // =========================================================================
  // V21: saga transition event unknown -> warning (M-S6)
  // A `-> Target on Event` mapping whose event is neither declared by any
  // context in the file nor placed in any flow is probably a typo. Guarded
  // like the other cross-file checks: only meaningful when the file declares
  // contexts (sagas always live inside one); an `on` event that only appears
  // as a flow node placement is accepted, so mixed/flow-heavy specs that
  // never re-declare events in contexts do not warn.
  // =========================================================================
  checkSagaTransitionEvents(saga: SagaDeclaration, accept: ValidationAcceptor): void {
    const file = getMomentFileFromNode(saga);
    if (!file || file.contexts.length === 0) return;

    const knownEvents = this.collectDeclaredEventNames(file);
    const placedNodeNames = this.collectPlacedNodeNames(file);

    for (const transition of saga.transitions) {
      const event = transition.event;
      if (event === undefined) continue;
      if (!knownEvents.has(event) && !placedNodeNames.has(event)) {
        accept(
          'warning',
          `V21: Saga transition event '${event}' is not declared by any context in this file and is not placed in any flow — possible typo.`,
          { node: transition, property: 'event' },
        );
      }
    }
  }

  /** Event names declared by any aggregate in any context of the file. */
  private collectDeclaredEventNames(file: MomentFile): Set<string> {
    const names = new Set<string>();
    for (const ctx of file.contexts) {
      for (const member of ctx.members) {
        if (!isAggregateDeclaration(member)) continue;
        for (const aggMember of member.members) {
          if (isDomainEventDeclaration(aggMember)) names.add(aggMember.name);
        }
      }
    }
    return names;
  }

  /** Node names placed anywhere in the file's flows (main lists and when blocks). */
  private collectPlacedNodeNames(file: MomentFile): Set<string> {
    const names = new Set<string>();
    for (const flow of file.flows) {
      for (const moment of flow.moments) {
        for (const node of moment.nodes) names.add(node.nodeName);
        for (const wb of moment.whenBlocks) {
          for (const node of wb.nodes) names.add(node.nodeName);
        }
      }
    }
    return names;
  }

  // =========================================================================
  // V17: returns-to depth capped at 1 -> warning
  // =========================================================================
  checkReturnsToDepth(flow: FlowDeclaration, accept: ValidationAcceptor): void {
    let returnsToCount = 0;
    for (const moment of flow.moments) {
      returnsToCount += this.countReturnsToInMoment(moment);
    }
    if (returnsToCount > 1) {
      accept('warning', 'V17: Flow contains more than one returns-to connection.', {
        node: flow,
        property: 'name',
      });
    }
  }

  // =========================================================================
  // V16: branch-lane not referenced in any when block -> warning
  // =========================================================================
  checkBranchLaneReferenced(flow: FlowDeclaration, accept: ValidationAcceptor): void {
    const branchLanes = flow.lanes.filter((l: LaneDeclaration) => l.isBranch);
    const referencedLaneIds = this.collectReferencedLaneIds(flow);

    for (const lane of branchLanes) {
      if (!referencedLaneIds.has(lane.id)) {
        accept('warning', 'V16: Branch-lane is not referenced in any when block or frame.', {
          node: lane,
          property: 'id',
        });
      }
    }
  }

  // =========================================================================
  // Registered cross-file entry points: no-ops unless a CrossFileContext has
  // been set (single-file mode sets it only when the file declares contexts),
  // so flow-only specs are never spammed with cross-file diagnostics.
  // =========================================================================

  checkFlowCrossFileRules(flow: FlowDeclaration, accept: ValidationAcceptor): void {
    if (!this.crossFileContext) return;
    this.checkSP01(flow, accept, this.crossFileContext);
  }

  checkCrossingCrossFileRules(crossing: ContextCrossing, accept: ValidationAcceptor): void {
    if (!this.crossFileContext) return;
    this.checkSP02(crossing, accept, this.crossFileContext);
  }

  // =========================================================================
  // Cross-file validators (SP-01, SP-02, V1, V9, V11, V14)
  // =========================================================================

  // SP-01: Flow lane references must match declared context names.
  // Branch-lanes are outcome routes (e.g. "Refusals"), not contexts — skipped.
  checkSP01(flow: FlowDeclaration, accept: ValidationAcceptor, ctx: CrossFileContext): void {
    for (const lane of flow.lanes) {
      if (lane.isBranch) continue;
      if (!ctx.declaredContextNames.includes(lane.label.replace(/^"|"$/g, ''))) {
        accept('error', 'SP-01: Lane label does not match any declared context name.', {
          node: lane,
          property: 'label',
        });
      }
    }
  }

  // SP-02: Crossing event names must be declared events on the boundary —
  // in the source context (the emitter, the convention every shipped example
  // follows) or in the target context (a consumer-side re-declaration).
  // The original target-only rule flagged every crossing in the canonical
  // examples, because events are declared once, in the emitting context.
  checkSP02(crossing: ContextCrossing, accept: ValidationAcceptor, ctx: CrossFileContext): void {
    const flow = getFlowFromNode(crossing);
    if (!flow) return;
    const targetLane = flow.lanes.find((l: LaneDeclaration) => l.id === crossing.targetLaneId);
    if (!targetLane) return;
    const parentNode = crossing.$container;
    const sourceLane = flow.lanes.find((l: LaneDeclaration) => l.id === parentNode.laneId);
    if (targetLane.isBranch || sourceLane?.isBranch) return;
    const declaredOnBoundary = [sourceLane, targetLane].some((lane) =>
      laneDeclaresEvent(lane, parentNode.nodeName, ctx),
    );
    if (!declaredOnBoundary) {
      accept('error', 'SP-02: Crossing event is not declared in the source or target context.', {
        node: crossing,
        property: 'targetLaneId',
      });
    }
  }

  // V1: Node names must resolve to declared building blocks via lane context.
  // Branch-lane placements are skipped: those lanes route outcomes and do not
  // correspond to a declared context.
  checkV1(node: NodePlacement, accept: ValidationAcceptor, ctx: CrossFileContext): void {
    const flow = getFlowFromNode(node);
    if (!flow) return;
    const lane = flow.lanes.find((l: LaneDeclaration) => l.id === node.laneId);
    if (!lane || lane.isBranch) return;
    const contextName = lane.label.replace(/^"|"$/g, '');
    const blocks = ctx.declaredBuildingBlocks.get(contextName) ?? [];
    const blockNames = blocks.map((b) => b.name);
    if (!blockNames.includes(node.nodeName)) {
      accept('error', 'V1: Node name does not resolve to a declared building block.', {
        node: node,
        property: 'nodeName',
      });
    }
  }

  // V5: triggered-by must reference a node that appeared earlier in the flow
  checkV5(node: NodePlacement, accept: ValidationAcceptor): void {
    const flow = getFlowFromNode(node);
    const moment = getMomentFromNode(node);
    if (!flow || !moment) return;

    for (const conn of node.connections) {
      if (!isTriggeredBy(conn)) continue;
      const priorNames = this.collectPriorNodeNames(flow, moment);
      if (!priorNames.has(conn.nodeName)) {
        accept('error', 'V5: triggered-by must reference a node from a prior frame.', {
          node: conn,
          property: 'nodeName',
        });
      }
    }
  }

  // V9: crosses-to only valid on event kinds
  checkV9(node: NodePlacement, accept: ValidationAcceptor, ctx: CrossFileContext): void {
    if (!node.crossing) return;
    const flow = getFlowFromNode(node);
    if (!flow) return;
    const lane = flow.lanes.find((l: LaneDeclaration) => l.id === node.laneId);
    if (!lane || lane.isBranch) return;
    const contextName = lane.label.replace(/^"|"$/g, '');
    const blocks = ctx.declaredBuildingBlocks.get(contextName) ?? [];
    const block = blocks.find((b) => b.name === node.nodeName);
    if (block && block.kind !== 'event') {
      accept('error', 'V9: crosses-to is only valid on event nodes.', {
        node: node,
        property: 'crossing',
      });
    }
  }

  // V11: (xN) only valid on event kinds
  checkV11(node: NodePlacement, accept: ValidationAcceptor, ctx: CrossFileContext): void {
    if (!node.multiplicity) return;
    const flow = getFlowFromNode(node);
    if (!flow) return;
    const lane = flow.lanes.find((l: LaneDeclaration) => l.id === node.laneId);
    if (!lane || lane.isBranch) return;
    const contextName = lane.label.replace(/^"|"$/g, '');
    const blocks = ctx.declaredBuildingBlocks.get(contextName) ?? [];
    const block = blocks.find((b) => b.name === node.nodeName);
    if (block && block.kind !== 'event') {
      accept('error', 'V11: Multiplicity is only valid on event nodes.', {
        node: node,
        property: 'multiplicity',
      });
    }
  }

  // V14: Partnership crossings should have bidirectional obligations -> warning
  checkV14(flow: FlowDeclaration, accept: ValidationAcceptor): void {
    const partnershipCrossings = this.collectPartnershipCrossings(flow);
    for (const crossing of partnershipCrossings) {
      const hasReverse = this.hasReverseCrossing(flow, crossing);
      if (!hasReverse) {
        accept(
          'warning',
          'V14: Partnership crossing should have a corresponding reverse crossing.',
          {
            node: crossing,
            property: 'relationshipType',
          },
        );
      }
    }
  }

  // =========================================================================
  // TODO stubs for future validators
  // =========================================================================

  // TODO SP-04: Aggregate invariants must reference valid scope targets
  // TODO SP-05: Saga states must form a valid directed graph
  // TODO SP-06: Domain service consumes/produces must reference valid types
  // TODO V3: When-block conditions must be mutually exclusive (requires semantic analysis)
  // TODO V4: Triggers connection target must exist in a later frame
  // TODO V12: Node placement order within a frame must follow command->event->policy convention
  // TODO V15: SeparateWays crossings should have ACL on receiving side

  // =========================================================================
  // Private helpers
  // =========================================================================

  private checkReturnsToLabel(node: NodePlacement, accept: ValidationAcceptor): void {
    const flow = getFlowFromNode(node);
    const moment = getMomentFromNode(node);
    if (!flow || !moment) return;

    for (const conn of node.connections) {
      if (!isReturnsTo(conn)) continue;
      const priorLabels = this.collectPriorMomentLabels(flow, moment);
      if (!priorLabels.has(conn.frameLabel)) {
        accept('error', 'V6: returns-to references a non-existent prior frame label.', {
          node: conn,
          property: 'frameLabel',
        });
      }
    }
  }

  private checkTriggeredByPrior(node: NodePlacement, accept: ValidationAcceptor): void {
    const flow = getFlowFromNode(node);
    const moment = getMomentFromNode(node);
    if (!flow || !moment) return;

    for (const conn of node.connections) {
      if (!isTriggeredBy(conn)) continue;
      const priorNames = this.collectPriorNodeNames(flow, moment);
      if (!priorNames.has(conn.nodeName)) {
        accept('error', 'V5: triggered-by must reference a node from a prior frame.', {
          node: conn,
          property: 'nodeName',
        });
      }
    }
  }

  private checkCrossFileNodeRules(node: NodePlacement, accept: ValidationAcceptor): void {
    if (!this.crossFileContext) return;
    this.checkV1(node, accept, this.crossFileContext);
    this.checkV9(node, accept, this.crossFileContext);
    this.checkV11(node, accept, this.crossFileContext);
  }

  private collectPriorMomentLabels(
    flow: FlowDeclaration,
    currentMoment: MomentDeclaration,
  ): Set<string> {
    const labels = new Set<string>();
    for (const moment of flow.moments) {
      if (moment === currentMoment) break;
      labels.add(moment.label);
    }
    return labels;
  }

  /** Earliest moment index at which each node name is placed in the flow. */
  private buildPlacementIndex(flow: FlowDeclaration): Map<string, number> {
    const index = new Map<string, number>();
    flow.moments.forEach((moment, momentIndex) => {
      const record = (n: NodePlacement): void => {
        if (!index.has(n.nodeName)) index.set(n.nodeName, momentIndex);
      };
      moment.nodes.forEach(record);
      moment.whenBlocks.forEach((wb) => wb.nodes.forEach(record));
    });
    return index;
  }

  private collectPriorNodeNames(
    flow: FlowDeclaration,
    currentMoment: MomentDeclaration,
  ): Set<string> {
    const names = new Set<string>();
    for (const moment of flow.moments) {
      if (moment === currentMoment) break;
      for (const n of moment.nodes) {
        names.add(n.nodeName);
      }
      for (const wb of moment.whenBlocks) {
        for (const n of wb.nodes) {
          names.add(n.nodeName);
        }
      }
    }
    return names;
  }

  private countReturnsToInMoment(moment: MomentDeclaration): number {
    let count = 0;
    for (const node of moment.nodes) {
      for (const conn of node.connections) {
        if (isReturnsTo(conn)) count++;
      }
    }
    for (const wb of moment.whenBlocks) {
      for (const node of wb.nodes) {
        for (const conn of node.connections) {
          if (isReturnsTo(conn)) count++;
        }
      }
    }
    return count;
  }

  private collectReferencedLaneIds(flow: FlowDeclaration): Set<string> {
    const ids = new Set<string>();
    for (const moment of flow.moments) {
      for (const node of moment.nodes) {
        ids.add(node.laneId);
      }
      for (const wb of moment.whenBlocks) {
        // when <condition> [<lane>] routes the branch into a lane.
        if (wb.lane) ids.add(wb.lane);
        for (const node of wb.nodes) {
          ids.add(node.laneId);
        }
      }
    }
    return ids;
  }

  private collectPartnershipCrossings(flow: FlowDeclaration): ContextCrossing[] {
    const crossings: ContextCrossing[] = [];
    for (const moment of flow.moments) {
      for (const node of moment.nodes) {
        if (node.crossing?.relationshipType === 'Partnership') {
          crossings.push(node.crossing);
        }
      }
      for (const wb of moment.whenBlocks) {
        for (const node of wb.nodes) {
          if (node.crossing?.relationshipType === 'Partnership') {
            crossings.push(node.crossing);
          }
        }
      }
    }
    return crossings;
  }

  private hasReverseCrossing(flow: FlowDeclaration, crossing: ContextCrossing): boolean {
    const parentNode = crossing.$container;
    const sourceLaneId = parentNode.laneId;
    const targetLaneId = crossing.targetLaneId;

    const checkNode = (node: NodePlacement): boolean => {
      if (!node.crossing) return false;
      return (
        node.laneId === targetLaneId &&
        node.crossing.targetLaneId === sourceLaneId &&
        node.crossing.relationshipType === 'Partnership'
      );
    };

    for (const moment of flow.moments) {
      for (const node of moment.nodes) {
        if (checkNode(node)) return true;
      }
      for (const wb of moment.whenBlocks) {
        for (const node of wb.nodes) {
          if (checkNode(node)) return true;
        }
      }
    }
    return false;
  }
}
