import type { ContextDefinition } from './context-definition.js';
import type { FlowDefinition } from './flow-definition.js';

export interface IntermediateRepresentation {
  contexts: ContextDefinition[];
  flows: FlowDefinition[];
  glossary: GlossaryEntry[];
  relationships: ContextRelationship[];
  metadata: SpecificationMetadata;
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
