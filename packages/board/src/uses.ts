/**
 * The USES table (ADR-048 D3): what a sticky says for each construct. Text is folded into the
 * sticky; no chip widget is drawn.
 */

import type {
  EmitOutcomeDefinition,
  EventOwner,
  PolicyConditionDefinition,
  PreconditionDefinition,
} from '@mmmnt/core';

export const USES: readonly { construct: string; text: string }[] = [
  {
    construct: 'command',
    text: 'Name [Cause], then emits A, B (siblings); alternatives emits A when S | A, B when T',
  },
  { construct: 'process-owned event', text: 'Name [Process: Owner]' },
  {
    construct: 'policy',
    text: 'Name, then trigger E [f = v] -> Command; [after E] for an after condition',
  },
  {
    construct: 'refusal',
    text: 'Precondition - Command, then [Cause] when scoped, then the rule text',
  },
  {
    construct: 'note',
    text: '[Lane label] text; a note with no lane, or for an External lane, is a person note',
  },
  { construct: 'terminal', text: 'the last sticky of the terminal moment ends / TERMINAL' },
  { construct: 'optional, multiplicity', text: '[optional], [x3] after the name' },
];

export function emitsClause(outcomes: readonly EmitOutcomeDefinition[]): string {
  const parts = outcomes.map((o) => {
    const events = o.events.join(', ');
    return o.whenState === undefined ? events : `${events} when ${o.whenState}`;
  });
  return parts.length === 0 ? '' : `emits ${parts.join(' | ')}`;
}

export function commandText(cmd: {
  name: string;
  causes?: readonly string[];
  outcomes?: readonly EmitOutcomeDefinition[];
}): string {
  const head =
    cmd.causes && cmd.causes.length > 0 ? `${cmd.name} [${cmd.causes.join(', ')}]` : cmd.name;
  const emits = emitsClause(cmd.outcomes ?? []);
  return emits === '' ? head : `${head}\n${emits}`;
}

export function eventText(name: string, owner?: EventOwner): string {
  return owner?.kind === 'orchestration' ? `${name} [Process: ${owner.name}]` : name;
}

export function conditionBracket(cond: PolicyConditionDefinition | undefined): string {
  if (!cond) return '';
  const parts: string[] = [];
  if (cond.field !== undefined) parts.push(`${cond.field} = ${cond.equals ?? ''}`);
  if (cond.after !== undefined) parts.push(`after ${cond.after}`);
  return parts.length === 0 ? '' : ` [${parts.join(', ')}]`;
}

export function policyText(p: {
  name: string;
  trigger: string;
  chainsTo?: string;
  condition?: PolicyConditionDefinition;
}): string {
  return `${p.name}\ntrigger ${p.trigger}${conditionBracket(p.condition)} -> ${p.chainsTo ?? ''}`.trimEnd();
}

export function refusalText(
  pre: Pick<PreconditionDefinition, 'name' | 'description' | 'causes'>,
  command: string,
): string {
  const cause = pre.causes && pre.causes.length > 0 ? `\n[${pre.causes.join(', ')}]` : '';
  return `${pre.name} - ${command}${cause}\n${pre.description}`;
}

export function noteText(text: string, lane?: string): string {
  return lane === undefined || lane === '' ? text : `[${lane}] ${text}`;
}

export function terminalText(text: string): string {
  return `${text}\n/ TERMINAL`;
}

/** The `[optional]` and `[x3]` suffixes. */
export function placementSuffix(e: { optional?: boolean; multiplicity?: number | string }): string {
  const parts: string[] = [];
  if (e.optional) parts.push('[optional]');
  if (e.multiplicity !== undefined) parts.push(`[x${String(e.multiplicity)}]`);
  return parts.length === 0 ? '' : ` ${parts.join(' ')}`;
}
