export interface GenerationScope {
  readonly level: 'system' | 'context' | 'aggregate';
  readonly targets?: string[];
}
