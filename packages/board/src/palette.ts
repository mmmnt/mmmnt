/**
 * The platform NDD palette (platform workspace d6dd5b65: 324322a8 swatches, 378cdad7 legend colours).
 * The palette rules live in the platform workspace; this table carries the swatches as data.
 */
export const SWATCH = {
  moment: '#9ea9ff',
  interface: '#f5f6f8',
  action: '#f5d128',
  refusal: '#fff9b1',
  policy: '#c6a2d2',
  external: '#ffcee0',
  command: '#a6ccf5',
  event: '#ff9d48',
  projection: '#f0939d',
  query: '#93d275',
} as const;

export type SwatchName = keyof typeof SWATCH;

/** Board node kinds; every one draws in a swatch (or the aggregate's white outlined container). */
export type NodeKind =
  | 'context'
  | 'aggregate'
  | 'command'
  | 'event'
  | 'policy'
  | 'saga'
  | 'projection'
  | 'query'
  | 'rule'
  | 'refusal'
  | 'invariant'
  | 'service'
  | 'valueObject'
  | 'external'
  | 'flow'
  | 'moment'
  | 'note'
  | 'branch';

/** The swatch each kind draws in; `null` is the white container with a black border. */
export const KIND_SWATCH: Record<NodeKind, SwatchName | null> = {
  context: 'interface',
  aggregate: null,
  command: 'command',
  event: 'event',
  policy: 'policy',
  saga: 'policy',
  projection: 'projection',
  query: 'query',
  rule: 'refusal',
  refusal: 'refusal',
  invariant: 'refusal',
  service: 'action',
  valueObject: 'interface',
  external: 'external',
  flow: 'moment',
  moment: 'moment',
  note: 'interface',
  branch: 'refusal',
};

export function fillOf(kind: NodeKind): string {
  const swatch = KIND_SWATCH[kind];
  return swatch === null ? '#ffffff' : SWATCH[swatch];
}
