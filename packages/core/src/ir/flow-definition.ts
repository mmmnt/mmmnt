import type { ConnectionDefinition } from './connection-definition.js';
import type { MomentDefinition } from './frame-definition.js';

export interface FlowDefinition {
  id: string;
  name: string;
  description?: string;
  moments: MomentDefinition[];
  connections: ConnectionDefinition[];
}
