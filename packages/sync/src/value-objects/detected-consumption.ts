export interface DetectedConsumption {
  readonly filePath: string;
  readonly eventType: string;
  readonly fields: readonly string[];
  readonly confidence: 'high' | 'medium' | 'low';
}
