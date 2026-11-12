import type { NodeKind } from './palette.js';
import type { StickyColor } from './palette.js';

/** One node of the manifest: the diff's input, comparable by (kind, name, context). */
export interface ManifestNode {
  kind: NodeKind;
  name: string;
  /** The bounded context (or external system) the node belongs to; empty for a flow or a moment. */
  context: string;
  /** `definition` is the declaration; `placement` is a node placed in a flow moment. */
  role: 'definition' | 'placement';
  flow?: string;
  moment?: string;
  /** The moment's id token, for example `N7.M3` (ADR-048 D7). */
  momentId?: string;
  frame: string;
  /** Stable address of the node on a board: frame, kind, name, context, moment id and arm (ADR-048 D6). */
  key: string;
  /** The cause a command is placed for (ADR-040). */
  cause?: string;
  /** `outcome` when a terminal placement ends the flow at an outcome (ADR-043). */
  exit?: 'outcome';
  terminal?: boolean;
  optional?: boolean;
  /** The arm id a placement sits in, for example `N7.M4-B1`. */
  arm?: string;
  /** The condition of the arm, as written. */
  armCondition?: string;
  /** The condition a policy reacts under (ADR-045), as written. */
  condition?: string;
  /** For a refusal: the command it rejects. */
  of?: string;
  /** For a moment: the `[terminal]` or `[branch]` marker the moment declares. */
  marker?: 'terminal' | 'branch';
  /** Where in the IR the node comes from, as a path. */
  path: string;
  /** The spec pointer from the sidecar, when one names this node (ADR-048 D8). */
  pointer?: string;
}

export interface ManifestEdge {
  kind:
    'relationship' | 'triggered-by' | 'crosses-to' | 'triggers' | 'chains-to' | 'feeds' | 'reads';
  from: string;
  to: string;
  context?: string;
  flow?: string;
  label?: string;
}

export interface UnrenderedEntry {
  path: string;
  reason: string;
}

export type FrameKind =
  | 'legend'
  | 'grammar'
  | 'context-map'
  | 'context'
  | 'aggregate'
  | 'services'
  | 'projection-query'
  | 'policies'
  | 'invariant-coverage'
  | 'thread';

export interface Placement {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ManifestFrame {
  id: string;
  title: string;
  kind: FrameKind;
  /** The frame's number (`N1`, `C3`) where it has one; singleton frames have none. */
  number?: string;
  numberSource?: 'name' | 'manifest' | 'load-order';
  placement: Placement;
}

export interface BoardManifest {
  manifestVersion: 1;
  specification: string;
  frames: ManifestFrame[];
  nodes: ManifestNode[];
  edges: ManifestEdge[];
  unrendered: UnrenderedEntry[];
  /** Moment ids that came from the position, not the moment name (ADR-048 D7). */
  momentIdSource: { flow: string; moment: string; id: string }[];
}

export interface BoardItem {
  id: string;
  /** `sticky` is a native sticky with a named colour; `shape` a rect with an exact hex; `text` a text area. */
  widget: 'sticky' | 'shape' | 'text';
  kind: NodeKind | 'label' | 'banner' | 'container' | 'swatch';
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** The exact swatch hex of the item (a shape's fill, a sticky's canonical hex). */
  fill: string;
  color?: StickyColor;
  textColor?: string;
  fontSize?: number;
  bold?: boolean;
  outlined?: boolean;
}

export interface BoardConnector {
  from: string;
  to: string;
  label?: string;
  dashed?: boolean;
  shape?: 'straight' | 'elbowed';
}

export interface BoardFrame {
  id: string;
  title: string;
  kind: FrameKind;
  number?: string;
  numberSource?: 'name' | 'manifest' | 'load-order';
  width: number;
  height: number;
  items: BoardItem[];
  connectors: BoardConnector[];
}

export interface BoardProjection {
  frames: BoardFrame[];
  manifest: BoardManifest;
  /** Plain notices (for example context numbers taken from the load order); the CLI prints them. */
  notices: string[];
}

/** A spec pointer from the sidecar (ADR-048 D8). */
export interface Pointer {
  momentId?: string;
  kind: NodeKind;
  name: string;
  context?: string;
  pointer: string;
}

export interface BoardOptions {
  /** The contexts in the order the manifest lists them (ADR-048 D7). */
  contextOrder?: string[];
  pointers?: Pointer[];
}
