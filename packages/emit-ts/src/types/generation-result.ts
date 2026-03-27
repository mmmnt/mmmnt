export interface GenerationResult {
  readonly filesWritten: string[];
  readonly filesUnchanged: string[];
  readonly filesRemoved: string[];
  readonly dryRun: boolean;
}
