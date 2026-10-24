import type { ContextDefinition } from '../ir/index.js';

/**
 * ADR-038 §2: an orchestration step `on <Command>` is invoked by a relay policy, so the step fires
 * on that policy's trigger. Binding it as `onEvent`, and the invoking command's relay trigger as
 * `startEvent`, lets readers of the event path follow the run. A step whose command no policy chains
 * to keeps no `onEvent` (V34 reports it).
 */
export function bindRelayEvents(contexts: ContextDefinition[]): ContextDefinition[] {
  const relayTrigger = new Map<string, string>();
  for (const pol of contexts.flatMap((c) => c.policies)) {
    if (pol.chainsTo && !relayTrigger.has(pol.chainsTo))
      relayTrigger.set(pol.chainsTo, pol.trigger);
  }
  return contexts.map((ctx) => ({
    ...ctx,
    sagas: ctx.sagas.map((saga) => ({
      ...saga,
      ...(relayTrigger.has(saga.trigger) && saga.commands
        ? { startEvent: relayTrigger.get(saga.trigger) }
        : {}),
      ...(saga.transitions
        ? {
            transitions: saga.transitions.map((t) => {
              const onEvent = t.onCommand ? relayTrigger.get(t.onCommand) : undefined;
              return onEvent ? { ...t, onEvent } : t;
            }),
          }
        : {}),
    })),
  }));
}
