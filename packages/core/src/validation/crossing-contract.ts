/**
 * V58: a crossing's `contract` names only fields its event declares.
 *
 * A contract is the shape of the event that crosses, so a contract field the event does not carry
 * is a field no emitter fills. The event is the one its source context declares, else the one its
 * target context declares (SP-02 and PM-04 read the crossing the same way). A crossing whose event
 * neither context declares is theirs to report, not this rule's.
 *
 * Like V22 and up it compares names across declarations: a warning per file, an error over a
 * merged project.
 */
import type {
  ConnectionDefinition,
  Diagnostic,
  EventDefinition,
  FlowDefinition,
  IntermediateRepresentation,
} from '../ir/index.js';
import { crossingSourceContextId } from '../services/schema-validator.js';

type Finding = Pick<Diagnostic, 'message' | 'ruleId'>;

/** Every event a context declares, at context level or on one of its aggregates, by name. */
function eventsByContext(
  ir: IntermediateRepresentation,
): Map<string, Map<string, EventDefinition>> {
  const out = new Map<string, Map<string, EventDefinition>>();
  for (const ctx of ir.contexts) {
    const events = new Map<string, EventDefinition>();
    // Hand-built IR may leave out what it does not use.
    const aggregates = ctx.aggregates ?? [];
    for (const e of [...(ctx.events ?? []), ...aggregates.flatMap((a) => a.events ?? [])]) {
      if (!events.has(e.name)) events.set(e.name, e);
    }
    out.set(ctx.id, events);
  }
  return out;
}

function crossingEvent(
  flow: FlowDefinition,
  conn: ConnectionDefinition,
  events: Map<string, Map<string, EventDefinition>>,
): EventDefinition | undefined {
  const name = conn.sourceNodeName ?? conn.eventId.replace(/^evt-/, '');
  const sourceContextId = crossingSourceContextId(flow, conn);
  const fromSource = sourceContextId === undefined ? undefined : events.get(sourceContextId);
  return fromSource?.get(name) ?? events.get(conn.targetContextId)?.get(name);
}

/** Every V58 finding of an IR, in declaration order. Severity is the caller's. */
export function validateCrossingContracts(ir: IntermediateRepresentation): Finding[] {
  const events = eventsByContext(ir);
  const contextName = (id: string): string => ir.contexts.find((c) => c.id === id)?.name ?? id;
  return (ir.flows ?? []).flatMap((flow) =>
    (flow.connections ?? []).flatMap((conn) => {
      if (conn.connectionType !== 'crosses-to') return [];
      const event = crossingEvent(flow, conn, events);
      if (event === undefined) return [];
      const declared = new Set((event.fields ?? []).map((f) => f.name));
      return conn.schemaContract.fields
        .filter((f) => !declared.has(f.name))
        .map((f) => ({
          ruleId: 'V58',
          message: `Flow '${flow.name}': the contract of '${event.name}' crossing to '${contextName(conn.targetContextId)}' names field '${f.name}', which '${event.name}' does not declare.`,
        }));
    }),
  );
}
