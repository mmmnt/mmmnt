export interface SchemaContract {
  eventType: string;
  version?: string;
  fields: SchemaFieldDefinition[];
  relationshipType: string;
}

export interface SchemaFieldDefinition {
  name: string;
  type: string;
  required: boolean;
}
