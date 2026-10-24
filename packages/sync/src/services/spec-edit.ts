/**
 * The specification edit an accepted proposal implies (ADR-039 §5).
 *
 * Sync never writes it: the architect makes it. Declarations are found by an
 * exact-text search of each .moment file for `value-object Y`, `event Y`,
 * `command Y` or `aggregate "Y"` — MomentParser exposes the IR, not the
 * Langium AST and its CST ranges.
 */

import type { FeedbackEventType, ImplementationChangeProposal } from '../value-objects/index.js';

export interface DeclarationLocation {
  readonly file: string;
  /** 1-based. */
  readonly line: number;
  readonly kind: string;
}

export interface ImpliedSpecEdit {
  /** The construct the edit concerns. */
  readonly symbol: string;
  readonly edit: string;
  /** Every file and line declaring the construct; empty when none does. */
  readonly locations: readonly DeclarationLocation[];
}

const DECLARATION = /^\s*(value-object|event|command|aggregate)\s+"?([A-Za-z_]\w*)"?(?=\s|$)/;

/** Where `symbol` is declared across `files` (path → text), in path order. */
export function locateDeclarations(
  symbol: string,
  files: ReadonlyMap<string, string>,
): DeclarationLocation[] {
  const found: DeclarationLocation[] = [];
  for (const file of [...files.keys()].sort()) {
    files
      .get(file)!
      .split('\n')
      .forEach((text, index) => {
        const match = DECLARATION.exec(text);
        if (match && match[2] === symbol) found.push({ file, line: index + 1, kind: match[1] });
      });
  }
  return found;
}

type Payload = Readonly<Record<string, unknown>>;

function text(payload: Payload, key: string): string {
  const value = payload[key];
  return typeof value === 'string' ? value : '';
}

function revise(construct: string, payload: Payload): string {
  return `revise ${construct}: ${text(payload, 'description')}`;
}

const DESCRIBE: Record<FeedbackEventType, (construct: string, payload: Payload) => string> = {
  ValueObjectFieldAdded: (construct, payload) =>
    `add ${payload.optional === true ? 'optional ' : ''}field ` +
    `\`${text(payload, 'fieldName')}: ${text(payload, 'fieldType')}\` to ${construct}`,
  ValueObjectFieldRemoved: (construct, payload) =>
    `remove field \`${text(payload, 'fieldName')}\` from ${construct}`,
  ValueObjectFieldRevised: (construct, payload) =>
    text(payload, 'fieldName')
      ? `change field \`${text(payload, 'fieldName')}\` of ${construct} ` +
        `from \`${text(payload, 'previousFieldType')}\` to \`${text(payload, 'fieldType')}\``
      : revise(construct, payload),
  ValueObjectDefined: (construct) => `declare ${construct}`,
  ValueObjectRemoved: (construct) => `remove ${construct}`,
  ValueObjectRenamed: (construct, payload) =>
    `rename ${construct}: ${text(payload, 'description')}`,
  CommandInputRevised: revise,
  DomainEventPayloadRevised: revise,
};

/** The edit the architect should make for an accepted proposal, and where. */
export function impliedSpecEdit(
  proposal: ImplementationChangeProposal,
  files: ReadonlyMap<string, string>,
): ImpliedSpecEdit {
  const symbol = text(proposal.proposedPayload, 'symbolName');
  const locations = locateDeclarations(symbol, files);
  const kind = locations[0]?.kind ?? 'value-object';
  return {
    symbol,
    edit: DESCRIBE[proposal.proposedEventType](`${kind} \`${symbol}\``, proposal.proposedPayload),
    locations,
  };
}
