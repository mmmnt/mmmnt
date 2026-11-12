import type { IntermediateRepresentation } from '@mmmnt/core';
import { numberContexts, numberFlows } from './numbering.js';
import type { ContextNumber, NumberedFlow } from './numbering.js';
import type { BoardOptions } from './types.js';

/** What every frame builder shares: the IR, the numbers, and the id of each frame. */
export interface BoardContext {
  ir: IntermediateRepresentation;
  flows: NumberedFlow[];
  contexts: ContextNumber[];
  notices: string[];
}

export function makeContext(ir: IntermediateRepresentation, options: BoardOptions): BoardContext {
  const flows = numberFlows(ir.flows);
  const contexts = numberContexts(
    ir.contexts.map((c) => c.name),
    options.contextOrder,
  );
  const notices: string[] = [];
  const loadOrder = contexts.filter((c) => c.source === 'load-order');
  if (loadOrder.length > 0) {
    notices.push(
      `context numbers follow the load order for ${loadOrder.map((c) => c.name).join(', ')}; list the contexts in manifest.yaml to fix them`,
    );
  }
  return { ir, flows, contexts, notices };
}

export function contextNumber(ctx: BoardContext, name: string): ContextNumber {
  return ctx.contexts.find((c) => c.name === name) ?? { name, number: 'C?', source: 'load-order' };
}

export const frameIds = {
  legend: 'legend',
  grammar: 'grammar',
  map: 'context-map',
  projections: 'projection-query',
  policies: 'policies',
  coverage: 'invariant-coverage',
  caption: (num: string): string => `context-${num}`,
  aggregate: (name: string): string => `aggregate-${name}`,
  services: (num: string): string => `services-${num}`,
  thread: (flowId: string): string => `thread-${flowId}`,
};
