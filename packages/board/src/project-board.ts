import type { IntermediateRepresentation } from '@mmmnt/core';
import { makeContext, contextNumber } from './context.js';
import { sweepIr } from './coverage.js';
import { aggregateFrame } from './frames-aggregate.js';
import {
  captionFrame,
  contextMapFrame,
  coverageFrame,
  grammarFrame,
  legendFrame,
  policiesFrame,
  projectionFrame,
  servicesFrame,
} from './frames-surface.js';
import { threadFrame } from './frames-thread.js';
import { buildEdges, buildNodes } from './nodes.js';
import { PointerIndex } from './pointers.js';
import { extent, placeFrames } from './placement.js';
import type { BoardFrame, BoardOptions, BoardProjection } from './types.js';

function framesOf(
  ir: IntermediateRepresentation,
  bc: ReturnType<typeof makeContext>,
  ptr: PointerIndex,
): BoardFrame[] {
  const captions = ir.contexts.flatMap((ctx) => [
    captionFrame(bc, ctx),
    ...ctx.aggregates.map((a) => aggregateFrame(bc, ctx, a, ptr)),
  ]);
  const services = ir.contexts.map((ctx) => servicesFrame(bc, ctx, ptr));
  const rest = [projectionFrame(bc, ptr), policiesFrame(bc, ptr), coverageFrame(bc)];
  const threads = ir.flows.map((flow, i) => threadFrame(bc, flow, bc.flows[i]!, ptr));
  return [
    legendFrame(),
    grammarFrame(bc),
    contextMapFrame(bc),
    ...captions,
    ...services,
    ...rest,
    ...threads,
  ].filter((f): f is BoardFrame => f !== undefined);
}

/**
 * Projects an IR onto the board: frames, manifest and notices. Throws `BoardNumberingError` for a
 * flow with no id or a repeated one, and `BoardPointerError` for a pointer that names no node.
 */
export function projectBoard(
  ir: IntermediateRepresentation,
  options: BoardOptions = {},
): BoardProjection {
  const bc = makeContext(ir, options);
  const ptr = new PointerIndex(options.pointers);
  const nodes = buildNodes(bc).map((n) => {
    const pointer = ptr.find(n.kind, n.name, n.context, n.momentId);
    return pointer === undefined ? n : { ...n, pointer };
  });
  const frames = framesOf(ir, bc, ptr);
  ptr.assertAllUsed();
  const places = placeFrames(frames);
  const momentIdSource = ir.flows.flatMap((flow, fi) =>
    bc.flows[fi]!.moments.flatMap((m, mi) =>
      m.source === 'position'
        ? [{ flow: flow.name, moment: flow.moments[mi]!.name, id: m.id }]
        : [],
    ),
  );
  return {
    frames,
    notices: bc.notices,
    manifest: {
      manifestVersion: 1,
      specification: ir.metadata.name,
      frames: frames.map((f) => ({
        id: f.id,
        title: f.title,
        kind: f.kind,
        ...(f.number !== undefined && { number: f.number }),
        ...(f.numberSource !== undefined && { numberSource: f.numberSource }),
        placement: places.get(f.id)!,
      })),
      nodes,
      edges: buildEdges(ir),
      unrendered: sweepIr(ir).unrendered,
      momentIdSource,
    },
  };
}

/** The overall size of the placement grid. */
export function boardExtent(projection: BoardProjection): { width: number; height: number } {
  return extent(projection.manifest.frames.map((f) => f.placement));
}

void contextNumber;
