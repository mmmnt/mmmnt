export interface ConsumedEventDeclaration {
  readonly eventType: string;
  readonly fields: readonly string[];
}

export interface ProjectionConsumptionDeclared {
  readonly type: 'ProjectionConsumptionDeclared';
  readonly projectionId: string;
  readonly projectionName: string;
  readonly product: string;
  readonly consumedEvents: readonly ConsumedEventDeclaration[];
  readonly timestamp: string;
}

export type ConsumptionManifestEvent = ProjectionConsumptionDeclared;
