export interface MomentDefinition {
  id: string;
  name: string;
  contextEntries: MomentEntry[];
  branches?: BranchDefinition[];
  terminal?: boolean;
}

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
  entries: MomentEntry[];
}
