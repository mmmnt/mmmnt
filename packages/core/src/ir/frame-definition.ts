export interface MomentDefinition {
  id: string;
  name: string;
  contextEntries: MomentEntry[];
  branches?: BranchDefinition[];
  terminal?: boolean;
  /** Declared with the `[branch]` marker in the spec. */
  isBranch?: boolean;
  /**
   * Textual order of the moment's children (M-P13). The grammar splits a
   * moment's children into main nodes and `when` blocks, losing interleaving;
   * this records the true source order, derived from CST offsets at transform
   * time. `index` points into `contextEntries` (kind 'entry') or `branches`
   * (kind 'branch'). When the AST carries no CST (hand-constructed nodes),
   * the order falls back to entries-then-branches.
   */
  sequence?: MomentSequenceItem[];
}

/** One child of a moment in textual source order (see MomentDefinition.sequence). */
export type MomentSequenceItem =
  | { kind: 'entry'; index: number }
  | { kind: 'branch'; index: number };

export interface MomentEntry {
  contextId: string;
  nodeName: string;
  nodeKind: 'command' | 'event' | 'policy' | 'saga' | 'projection';
  multiplicity?: number | string;
  optional?: boolean;
  terminal?: boolean;
}

export interface BranchDefinition {
  condition: string;
  /** Branch-lane routing target (when <condition> [<lane>]). */
  lane?: string;
  entries: MomentEntry[];
}
