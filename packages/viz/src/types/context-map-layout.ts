export interface ContextMapNode {
  readonly contextName: string;
  readonly classification: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly isExternal: boolean;
}

export interface ContextMapEdge {
  readonly sourceContext: string;
  readonly targetContext: string;
  readonly relationshipType: string;
  readonly label: string;
  readonly points: readonly { readonly x: number; readonly y: number }[];
}

export interface ContextMapLayout {
  readonly nodes: readonly ContextMapNode[];
  readonly edges: readonly ContextMapEdge[];
  readonly dimensions: { readonly width: number; readonly height: number };
}
