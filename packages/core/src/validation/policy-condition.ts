/**
 * ADR-045 D2 — the condition a policy declares on its trigger: V49–V51 over an IR.
 *
 * - V49  a `when <field> = <value>` names a field the trigger event carries.
 * - V50  an `after <Event>` names a declared event.
 * - V51  an `after <Event>` that no flow can satisfy: no flow places the event before the trigger
 *        (an advisory, and only when some flow places the trigger at all).
 *
 * ADR-050 D2 — a `when` field may be the path `<field>.kind` on a tagged union field (ADR-049 D3):
 *
 * - V49  reads the path's first segment, the trigger's own field.
 * - V56  a path is `<field>.kind` on a single (not array, not map) union field; a union field is guarded
 *        only through `.kind` (its value is an object, never the string written).
 * - V57  the variant a `<field>.kind` guard names is one the union declares.
 *
 * V56 and V57 say nothing when the field's type is a name no context declares as a value object (it may
 * be declared in another file); a merged project decides them.
 *
 * Like V22–V43 they compare names across declarations. A trigger that is no declared event is V30's.
 * A guard on a field named `outcome` is allowed: ADR-046 moved the derived branch stamp off that name.
 */
import type {
  ContextDefinition,
  Diagnostic,
  FieldDefinition,
  FlowDefinition,
  IntermediateRepresentation,
  PolicyDefinition,
  ValueObjectDefinition,
} from '../ir/index.js';
import { conditionPath, UNION_DISCRIMINATOR } from '../ir/condition-path.js';

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

/** A declared event's fields by name, with the context that declares it (where its types resolve first). */
interface EventFields {
  readonly context: ContextDefinition;
  readonly fields: Map<string, FieldDefinition>;
}

function fieldsByEvent(ir: IntermediateRepresentation): Map<string, EventFields> {
  const events = new Map<string, EventFields>();
  for (const ctx of ir.contexts)
    for (const e of ctx.events) {
      const entry = events.get(e.name) ?? { context: ctx, fields: new Map() };
      for (const f of e.fields ?? []) if (!entry.fields.has(f.name)) entry.fields.set(f.name, f);
      events.set(e.name, entry);
    }
  return events;
}

function v49(p: PolicyDefinition, events: Map<string, EventFields>): Finding[] {
  const c = p.condition;
  const event = events.get(p.trigger);
  if (c?.field === undefined || event === undefined) return [];
  const { field } = conditionPath(c.field);
  if (event.fields.has(field)) return [];
  return [
    {
      ruleId: 'V49',
      message: `Policy '${p.name}' reacts when '${c.field}' of '${p.trigger}' is '${c.equals ?? ''}', but '${p.trigger}' has no field '${field}'.`,
    },
  ];
}

/** A value object by name: the context's own (and its aggregates') first, then any context's. */
function findValueObject(
  ir: IntermediateRepresentation,
  own: ContextDefinition,
  name: string,
): ValueObjectDefinition | undefined {
  const inContext = (ctx: ContextDefinition): ValueObjectDefinition | undefined =>
    ctx.valueObjects.find((v) => v.name === name) ??
    ctx.aggregates.flatMap((a) => a.valueObjects ?? []).find((v) => v.name === name);
  return inContext(own) ?? ir.contexts.map(inContext).find((v) => v !== undefined);
}

const BUILT_IN = new Set(['string', 'number', 'boolean', 'UUID', 'DateTime', 'Date', 'Money']);

/** What a guarded field's type is, as far as the IR decides it. */
type FieldShape =
  | { readonly kind: 'union'; readonly name: string; readonly variants: string[] }
  | { readonly kind: 'other'; readonly what: string }
  | { readonly kind: 'unknown' };

function shapeOf(
  f: FieldDefinition,
  ir: IntermediateRepresentation,
  ctx: ContextDefinition,
): FieldShape {
  if (f.enum !== undefined) return { kind: 'other', what: 'a code set' };
  if (BUILT_IN.has(f.type)) return { kind: 'other', what: `a ${f.type}` };
  const vo = findValueObject(ir, ctx, f.type);
  if (vo === undefined) return { kind: 'unknown' };
  if (vo.variants === undefined || vo.variants.length === 0)
    return { kind: 'other', what: `the value object '${vo.name}', which is not a union` };
  return { kind: 'union', name: vo.name, variants: vo.variants.map((v) => v.name) };
}

/** The guarded field, resolved: its declaration and what its type is. Undefined when nothing is decidable. */
interface Guarded {
  readonly field: string;
  readonly path: string[];
  readonly f: FieldDefinition;
  readonly shape: Exclude<FieldShape, { kind: 'unknown' }>;
}

function resolveGuard(
  p: PolicyDefinition,
  events: Map<string, EventFields>,
  ir: IntermediateRepresentation,
): Guarded | undefined {
  const event = events.get(p.trigger);
  if (p.condition?.field === undefined || event === undefined) return undefined;
  const { field, path } = conditionPath(p.condition.field);
  const f = event.fields.get(field);
  if (f === undefined) return undefined; // V49's
  const shape = shapeOf(f, ir, event.context);
  return shape.kind === 'unknown' ? undefined : { field, path, f, shape };
}

/** Why a guard is not `<union field>.kind`, or a union field is guarded without it (V56); undefined when fine. */
function v56Reason({ field, path, f, shape }: Guarded): string | undefined {
  const tag = UNION_DISCRIMINATOR;
  const collection = f.isArray ? 'an array' : f.map !== undefined ? 'a map' : undefined;
  if (path.length === 0)
    return shape.kind === 'union' && collection === undefined
      ? `'${field}' is the union '${shape.name}', whose value is an object; write '${field}.${tag}' to react to a variant`
      : undefined;
  if (shape.kind !== 'union')
    return `'${field}' is ${shape.what}; a path reads only the '${tag}' of a union field`;
  if (collection !== undefined)
    return `'${field}' is ${collection} of '${shape.name}'; a path reads the '${tag}' of one union value`;
  if (path.length !== 1 || path[0] !== tag)
    return `a path into a union reads only '${field}.${tag}'`;
  return undefined;
}

/** ADR-050 D2: V56 (a path other than `<union field>.kind`, or a union guarded without it), V57 (a variant). */
function v56v57(
  p: PolicyDefinition,
  events: Map<string, EventFields>,
  ir: IntermediateRepresentation,
): Finding[] {
  const guard = resolveGuard(p, events, ir);
  if (guard === undefined) return [];
  const equals = p.condition?.equals ?? '';
  const head = `Policy '${p.name}' reacts when '${p.condition?.field ?? ''}' of '${p.trigger}' is '${equals}'`;
  const reason = v56Reason(guard);
  if (reason !== undefined) return [{ ruleId: 'V56', message: `${head}, but ${reason}.` }];
  const { shape } = guard;
  if (shape.kind !== 'union' || guard.path.length === 0 || shape.variants.includes(equals))
    return [];
  return [
    {
      ruleId: 'V57',
      message: `${head}, but the union '${shape.name}' has no variant '${equals}' (it has ${shape.variants.join(', ')}).`,
    },
  ];
}

function v50v51(
  p: PolicyDefinition,
  events: Map<string, EventFields>,
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
      .flatMap((p) => [
        ...v49(p, events),
        ...v56v57(p, events, ir),
        ...v50v51(p, events, ir.flows ?? []),
      ]),
  );
}
