import type { SchemaContract } from './schema-contract.js';

export type ConnectionType = 'crosses-to' | 'triggered-by' | 'triggers' | 'returns-to';

interface BaseConnectionDefinition {
  id: string;
  sourceFrameId: string;
  targetContextId: string;
  eventId: string;
  connectionType: Exclude<ConnectionType, 'crosses-to'>;
  targetFrameLabel?: string;
}

interface CrossingConnectionDefinition {
  id: string;
  sourceFrameId: string;
  targetContextId: string;
  eventId: string;
  connectionType: 'crosses-to';
  schemaContract: SchemaContract;
}

export type ConnectionDefinition = BaseConnectionDefinition | CrossingConnectionDefinition;
