/**
 * File names of the Facet payloads, shared by `moment simulate --out-dir` (which writes them) and
 * `moment serve` (which keys its payloads by them), so the two cannot name a scenario differently.
 *
 * A flow's name is a free string (`N5 - Seat request`), so names are slugged: lower case, every run
 * of other characters one `-`. A topology is `topology-<flow>.json`. A scenario is
 * `scenario-<flow><rest>.json`, where `<rest>` is what the scenario id adds after
 * `scenario-<flow id>` (`-0`, `-neg-RequestHold-ticketsAvailable`, `-timeout-SeatHoldLifecycle`),
 * slugged too. The scenario id itself is unchanged: Facet keys on it, and reads the file names from
 * `manifest.json`.
 */

import type { FlowDefinition } from '@mmmnt/core';

/** Lower case, each run of characters other than `a-z0-9` one `-`, no `-` at either end. */
export function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function topologyFileName(flow: Pick<FlowDefinition, 'name'>): string {
  return `topology-${slug(flow.name)}.json`;
}

export function scenarioFileName(
  flow: Pick<FlowDefinition, 'id' | 'name'>,
  scenarioId: string,
): string {
  const prefix = `scenario-${flow.id}`;
  const rest = slug(scenarioId.startsWith(prefix) ? scenarioId.slice(prefix.length) : scenarioId);
  return `scenario-${slug(flow.name)}${rest ? `-${rest}` : ''}.json`;
}

/**
 * Names scenario files across one output and refuses two scenarios whose ids slug to one file
 * name, which would otherwise overwrite one with the other.
 */
export class ScenarioFileNames {
  private readonly owners = new Map<string, string>();

  name(flow: Pick<FlowDefinition, 'id' | 'name'>, scenarioId: string): string {
    const file = scenarioFileName(flow, scenarioId);
    const owner = this.owners.get(file);
    if (owner !== undefined && owner !== scenarioId) {
      throw new Error(
        `Scenarios '${owner}' and '${scenarioId}' would both be written to ${file}; rename a flow, a command or a precondition so their names differ in more than case or punctuation`,
      );
    }
    this.owners.set(file, scenarioId);
    return file;
  }
}
