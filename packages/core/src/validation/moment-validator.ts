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
  ContextCrossing,
  FlowDeclaration,
  Moment,
  LaneDeclaration,
  NodePlacement,
} from '../generated/ast.js';
import { isReturnsTo, isMoment, isFlowDeclaration, isTriggeredBy } from '../generated/ast.js';

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
    Moment: validator.checkMoment,
    NodePlacement: [
      validator.checkNodePlacement,
      validator.checkOptionalWithCrossing,
      validator.checkTerminalIsLast,
      validator.checkLaneIdExists,
    ],
    ContextCrossing: [
      validator.checkCrossingEmptyContract,
      validator.checkCrossingTargetBranchLane,
    ],
    FlowDeclaration: [validator.checkReturnsToDepth, validator.checkBranchLaneReferenced],
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

function getMomentFromNode(node: { $container?: unknown }): Moment | undefined {
  let current: unknown = node;
  while (current) {
    if (isMoment(current as Record<string, unknown>)) {
      return current as Moment;
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
  checkMoment(moment: Moment, accept: ValidationAcceptor): void {
    if (moment.nodes.length === 0 && moment.whenBlocks.length === 0) {
      accept('error', 'V10: Frame must contain at least one node or when block.', {
        node: moment,
        property: 'label',
      });
    }
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
  // Cross-file validators (SP-01, SP-02, V1, V9, V11, V14)
  // =========================================================================

  // SP-01: Flow lane references must match declared context names
  checkSP01(flow: FlowDeclaration, accept: ValidationAcceptor, ctx: CrossFileContext): void {
    for (const lane of flow.lanes) {
      if (!ctx.declaredContextNames.includes(lane.label.replace(/^"|"$/g, ''))) {
        accept('error', 'SP-01: Lane label does not match any declared context name.', {
          node: lane,
          property: 'label',
        });
      }
    }
  }

  // SP-02: Crossing event names must be declared events in the target context
  checkSP02(crossing: ContextCrossing, accept: ValidationAcceptor, ctx: CrossFileContext): void {
    const flow = getFlowFromNode(crossing);
    if (!flow) return;
    const targetLane = flow.lanes.find((l: LaneDeclaration) => l.id === crossing.targetLaneId);
    if (!targetLane) return;
    const contextName = targetLane.label.replace(/^"|"$/g, '');
    const events = ctx.declaredEvents.get(contextName) ?? [];
    const parentNode = crossing.$container;
    if (!events.includes(parentNode.nodeName)) {
      accept('error', 'SP-02: Crossing event is not declared in the target context.', {
        node: crossing,
        property: 'targetLaneId',
      });
    }
  }

  // V1: Node names must resolve to declared building blocks via lane context
  checkV1(node: NodePlacement, accept: ValidationAcceptor, ctx: CrossFileContext): void {
    const flow = getFlowFromNode(node);
    if (!flow) return;
    const lane = flow.lanes.find((l: LaneDeclaration) => l.id === node.laneId);
    if (!lane) return;
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
    if (!lane) return;
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
    if (!lane) return;
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

  private collectPriorMomentLabels(flow: FlowDeclaration, currentMoment: Moment): Set<string> {
    const labels = new Set<string>();
    for (const moment of flow.moments) {
      if (moment === currentMoment) break;
      labels.add(moment.label);
    }
    return labels;
  }

  private collectPriorNodeNames(flow: FlowDeclaration, currentMoment: Moment): Set<string> {
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

  private countReturnsToInMoment(moment: Moment): number {
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
