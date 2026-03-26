import type { SchemaContract } from './schema-contract.js';

export interface ConnectionDefinition {
  id: string;
  sourceFrameId: string;
  targetContextId: string;
  eventId: string;
  isCrossing: boolean;
  schemaContract?: SchemaContract;
  connectionType: 'crosses-to' | 'triggered-by' | 'triggers' | 'returns-to';
}
