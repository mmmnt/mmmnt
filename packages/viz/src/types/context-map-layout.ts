export interface ContextMapNode {
  readonly contextId: string;
  readonly contextName: string;
  readonly classification: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly isExternal: boolean;
}

export interface ContextMapEdge {
  readonly sourceContextId: string;
  readonly targetContextId: string;
  readonly relationshipType: string;
  readonly label: string;
  readonly points: readonly { readonly x: number; readonly y: number }[];
}

export interface ContextMapLayout {
  readonly nodes: readonly ContextMapNode[];
  readonly edges: readonly ContextMapEdge[];
  readonly dimensions: { readonly width: number; readonly height: number };
}
