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

/** Optional swatches (ADR-048 D3): in the Sift legend, drawn only when a construct supplies them. */
export const OPTIONAL_SWATCH = {
  dataStore: '#67c6c0',
  component: '#000000',
} as const;

export type StickyColor =
  | 'gray'
  | 'light_yellow'
  | 'yellow'
  | 'orange'
  | 'light_green'
  | 'green'
  | 'dark_green'
  | 'cyan'
  | 'light_pink'
  | 'pink'
  | 'violet'
  | 'red'
  | 'light_blue'
  | 'blue'
  | 'dark_blue'
  | 'black';

/** Approximate hexes of Miro's named sticky colours: the lookup table of the nearest name. The Legend prints the exact hexes. */
const STICKY_APPROX: Record<StickyColor, string> = {
  gray: '#c9c9c9',
  light_yellow: '#fff9b1',
  yellow: '#f5d128',
  orange: '#ff9d48',
  light_green: '#d5f692',
  green: '#93d275',
  dark_green: '#67c6c0',
  cyan: '#6cd8fa',
  light_pink: '#ffcee0',
  pink: '#f0939d',
  violet: '#c6a2d2',
  red: '#f16c7f',
  light_blue: '#a6ccf5',
  blue: '#9ea9ff',
  dark_blue: '#6881ff',
  black: '#1a1a1a',
};

const channels = (hex: string): number[] =>
  [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));

/** The named sticky colour nearest to a hex, by distance in RGB. */
export function nearestStickyColor(hex: string): StickyColor {
  const want = channels(hex);
  let best: StickyColor = 'gray';
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const [name, approx] of Object.entries(STICKY_APPROX) as [StickyColor, string][]) {
    const d = channels(approx).reduce((sum, c, i) => sum + (c - want[i]!) ** 2, 0);
    if (d < bestDistance) {
      best = name;
      bestDistance = d;
    }
  }
  return best;
}

/** The sticky colour each swatch is drawn in: fixed here, so a change of mapping is a visible diff. */
export const STICKY_COLOR: Record<SwatchName, StickyColor> = {
  moment: 'blue',
  interface: 'gray',
  action: 'yellow',
  refusal: 'light_yellow',
  policy: 'violet',
  external: 'light_pink',
  command: 'light_blue',
  event: 'orange',
  projection: 'pink',
  query: 'light_green',
};
