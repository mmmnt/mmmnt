import type { SchemaContract } from './schema-contract.js';

export type ConnectionType = 'crosses-to' | 'triggered-by' | 'triggers' | 'returns-to';

/** Fields shared by all connection variants that identify the real endpoints. */
interface ConnectionEndpoints {
  id: string;
  sourceMomentId: string;
  targetContextId: string;
  eventId: string;
  /** Name of the node that declares this connection. */
  sourceNodeName?: string;
  /** For triggers/triggered-by: the node on the other end of the edge. */
  targetNodeName?: string;
  /** For returns-to: the resolved id of the moment the flow returns to. */
  targetMomentId?: string;
  /** Set when the declaring node lives inside a `when` block. */
  branchCondition?: string;
}

interface BaseConnectionDefinition extends ConnectionEndpoints {
  connectionType: Exclude<ConnectionType, 'crosses-to'>;
  targetMomentLabel?: string;
}

interface CrossingConnectionDefinition extends ConnectionEndpoints {
  connectionType: 'crosses-to';
  schemaContract: SchemaContract;
}

export type ConnectionDefinition = BaseConnectionDefinition | CrossingConnectionDefinition;
