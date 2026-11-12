import type { NodeKind } from './palette.js';

/** One node of the manifest: the diff's input, comparable by (kind, name, context). */
export interface ManifestNode {
  kind: NodeKind;
  name: string;
  /** The bounded context (or external system) the node belongs to; empty for a flow or a moment. */
  context: string;
  /** `definition` is the declaration in a context frame; `placement` is a node placed in a flow moment. */
  role: 'definition' | 'placement';
  flow?: string;
  moment?: string;
  frame: string;
  /** Where in the IR the node comes from, as a path. */
  path: string;
}

export interface ManifestEdge {
  kind: 'relationship' | 'triggered-by' | 'crosses-to' | 'chains-to';
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

export interface BoardManifest {
  manifestVersion: 1;
  specification: string;
  frames: {
    id: string;
    title: string;
    kind: 'context' | 'thread' | 'context-map' | 'invariant-coverage';
  }[];
  nodes: ManifestNode[];
  edges: ManifestEdge[];
  unrendered: UnrenderedEntry[];
}

export interface BoardItem {
  id: string;
  kind: NodeKind | 'chip' | 'header' | 'container';
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  fill: string;
  dashed?: boolean;
}

export interface BoardConnector {
  from: string;
  to: string;
  label?: string;
  dashed?: boolean;
}

export interface BoardFrame {
  id: string;
  title: string;
  kind: 'context' | 'thread' | 'context-map' | 'invariant-coverage';
  width: number;
  height: number;
  items: BoardItem[];
  connectors: BoardConnector[];
}

export interface BoardProjection {
  frames: BoardFrame[];
  manifest: BoardManifest;
}
