import type { ContextDefinition, GatewayDefinition } from './context-definition.js';
import type { FlowDefinition } from './flow-definition.js';

export interface IntermediateRepresentation {
  contexts: ContextDefinition[];
  flows: FlowDefinition[];
  glossary: GlossaryEntry[];
  relationships: ContextRelationship[];
  externals?: ExternalDefinition[];
  metadata: SpecificationMetadata;
}

export interface ExternalDefinition {
  id: string;
  name: string;
  description: string;
  gateways?: GatewayDefinition[];
}

export interface SpecificationMetadata {
  name: string;
  version: string;
  description?: string;
  generatedAt?: string;
}

export interface GlossaryEntry {
  term: string;
  definition: string;
  context?: string;
}

export interface ContextRelationship {
  sourceContextId: string;
  targetContextId: string;
  relationshipType: string;
  contract: string;
}
