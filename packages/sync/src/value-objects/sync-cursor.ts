export interface SyncCursor {
  readonly specificationHash: string;
  readonly timestamp: string;
  readonly lastProcessedFile?: string;
}
