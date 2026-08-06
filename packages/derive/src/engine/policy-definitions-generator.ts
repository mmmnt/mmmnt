/**
 * PolicyDefinitions artifact — the coordinated Moment↔Facet contract for
 * policy chains (`policy_chain` assertion tier).
 *
 * Shape per entry: { name, contextId, trigger, actionDescription?, chainsTo }
 * - `contextId` is the declaring context's IR id (e.g. `ctx-Checkout`).
 * - `chainsTo` is ALWAYS an array (normalized from the IR's optional single
 *   `chainsTo` string; a policy with no chain emits `[]`).
 * - `actionDescription` is included only when the policy declares action text.
 *
 * A spec with zero policies yields `[]` — a truthful "zero policies declared",
 * never a missing artifact.
 */

import type { IntermediateRepresentation, PolicyDefinition } from '@mmmnt/core';

export interface PolicyDefinitionArtifact {
  readonly name: string;
  readonly contextId: string;
  readonly trigger: string;
  readonly actionDescription?: string;
  readonly chainsTo: readonly string[];
}

export function generatePolicyDefinitions(
  ir: IntermediateRepresentation,
): PolicyDefinitionArtifact[] {
  const definitions: PolicyDefinitionArtifact[] = [];

  for (const context of ir.contexts) {
    for (const policy of context.policies) {
      definitions.push({
        name: policy.name,
        contextId: context.id,
        trigger: policy.trigger,
        ...(policy.action ? { actionDescription: policy.action } : {}),
        chainsTo: normalizeChainsTo(policy.chainsTo),
      });
    }
  }

  return definitions;
}

function normalizeChainsTo(chainsTo: PolicyDefinition['chainsTo']): string[] {
  if (chainsTo === undefined || chainsTo === null) return [];
  if (Array.isArray(chainsTo)) return chainsTo.filter((c): c is string => typeof c === 'string');
  return [chainsTo];
}
