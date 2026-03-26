export interface FrameDefinition {
  id: string;
  name: string;
  contextEntries: FrameEntry[];
  branches?: BranchDefinition[];
  terminal?: boolean;
}

export interface FrameEntry {
  contextId: string;
  nodeName: string;
  nodeKind: 'command' | 'event' | 'policy' | 'saga' | 'projection';
  multiplicity?: number;
  optional?: boolean;
  terminal?: boolean;
}

export interface BranchDefinition {
  condition: string;
  entries: FrameEntry[];
}
