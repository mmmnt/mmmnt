import type { ConnectionDefinition } from './connection-definition.js';
import type { MomentDefinition } from './frame-definition.js';

export interface LaneDefinition {
  id: string;
  label: string;
  contextId: string;
  classification?: string;
  isBranch: boolean;
}

export interface FlowDefinition {
  id: string;
  name: string;
  description?: string;
  lanes: LaneDefinition[];
  moments: MomentDefinition[];
  connections: ConnectionDefinition[];
}
