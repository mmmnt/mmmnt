import type {
  ContextDefinition,
  IntermediateRepresentation,
  MomentEntry,
  PreconditionDefinition,
} from '@mmmnt/core';

type CommandLike = { name: string; preconditions: PreconditionDefinition[] };

/** Every command a context holds: its aggregates', its own, and its orchestrations'. */
export function commandsOf(ctx: ContextDefinition): CommandLike[] {
  return [
    ...ctx.aggregates.flatMap((a) => a.commands),
    ...ctx.commands,
    ...ctx.sagas.flatMap((s) => s.commands ?? []),
  ];
}

/**
 * The preconditions that can refuse a placed command: those that apply to every cause, and those
 * naming the cause the command is placed for (ADR-040 D2). A placement with no cause meets them all.
 */
export function refusalsOf(
  ir: IntermediateRepresentation,
  entry: MomentEntry,
): PreconditionDefinition[] {
  if (entry.nodeKind !== 'command') return [];
  const ctx = ir.contexts.find((c) => c.id === entry.contextId);
  const cmd = ctx ? commandsOf(ctx).find((c) => c.name === entry.nodeName) : undefined;
  if (!cmd) return [];
  return cmd.preconditions.filter((p) => {
    const scoped = p.causes ?? [];
    return scoped.length === 0 || entry.cause === undefined || scoped.includes(entry.cause);
  });
}
