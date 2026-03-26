import type { ConnectionDefinition } from './connection-definition.js';
import type { FrameDefinition } from './frame-definition.js';

export interface FlowDefinition {
  id: string;
  name: string;
  description?: string;
  frames: FrameDefinition[];
  connections: ConnectionDefinition[];
}
