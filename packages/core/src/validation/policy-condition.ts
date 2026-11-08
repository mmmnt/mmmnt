/**
 * ADR-045 D2 — the condition a policy declares on its trigger: V49–V51 over an IR.
 *
 * - V49  a `when <field> = <value>` names a field the trigger event carries.
 * - V50  an `after <Event>` names a declared event.
 * - V51  an `after <Event>` that no flow can satisfy: no flow places the event before the trigger
 *        (an advisory, and only when some flow places the trigger at all).
 *
 * Like V22–V43 they compare names across declarations. A trigger that is no declared event is V30's.
 * A guard on a field named `outcome` is allowed: ADR-046 moved the derived branch stamp off that name.
 */
import type {
  Diagnostic,
  FlowDefinition,
  IntermediateRepresentation,
  PolicyDefinition,
} from '../ir/index.js';

export type Finding = Pick<Diagnostic, 'message' | 'ruleId'> & {
  readonly severity?: 'error' | 'warning';
};

/** Node names of a flow in the order the flow places them (a moment's own entries, then its arms). */
function placedOrder(flow: FlowDefinition): string[] {
  return flow.moments.flatMap((m) => [
    ...m.contextEntries.map((e) => e.nodeName),
    ...(m.branches ?? []).flatMap((b) => b.entries.map((e) => e.nodeName)),
  ]);
}

/** True when some flow places `cause` before some placement of `trigger`. */
function someFlowPlacesBefore(
  flows: FlowDefinition[],
  cause: string,
  trigger: string,
): { reached: boolean; triggerPlaced: boolean } {
  let triggerPlaced = false;
  for (const flow of flows) {
    const order = placedOrder(flow);
    const firstCause = order.indexOf(cause);
    const lastTrigger = order.lastIndexOf(trigger);
    if (lastTrigger >= 0) triggerPlaced = true;
    if (firstCause >= 0 && lastTrigger > firstCause) return { reached: true, triggerPlaced };
  }
  return { reached: false, triggerPlaced };
}

function fieldsByEvent(ir: IntermediateRepresentation): Map<string, Set<string>> {
  const events = new Map<string, Set<string>>();
  for (const ctx of ir.contexts)
    for (const e of ctx.events) {
      const fields = events.get(e.name) ?? new Set<string>();
      for (const f of e.fields ?? []) fields.add(f.name);
      events.set(e.name, fields);
    }
  return events;
}

function v49(p: PolicyDefinition, events: Map<string, Set<string>>): Finding[] {
  const c = p.condition;
  const fields = events.get(p.trigger);
  if (c?.field === undefined || fields === undefined || fields.has(c.field)) return [];
  return [
    {
      ruleId: 'V49',
      message: `Policy '${p.name}' reacts when '${c.field}' of '${p.trigger}' is '${c.equals ?? ''}', but '${p.trigger}' has no field '${c.field}'.`,
    },
  ];
}

function v50v51(
  p: PolicyDefinition,
  events: Map<string, Set<string>>,
  flows: FlowDefinition[],
): Finding[] {
  const after = p.condition?.after;
  if (after === undefined) return [];
  if (!events.has(after))
    return [
      {
        ruleId: 'V50',
        message: `Policy '${p.name}' reacts after '${after}', which is no declared event.`,
      },
    ];
  const { reached, triggerPlaced } = someFlowPlacesBefore(flows, after, p.trigger);
  if (!triggerPlaced || reached) return [];
  return [
    {
      ruleId: 'V51',
      severity: 'warning',
      message: `Policy '${p.name}' reacts to '${p.trigger}' after '${after}', but no flow places '${after}' before '${p.trigger}'; the condition is never met.`,
    },
  ];
}

export function validatePolicyConditions(ir: IntermediateRepresentation): Finding[] {
  const events = fieldsByEvent(ir);
  return ir.contexts.flatMap((ctx) =>
    ctx.policies
      .filter((p) => p.condition !== undefined)
      .flatMap((p) => [...v49(p, events), ...v50v51(p, events, ir.flows ?? [])]),
  );
}
