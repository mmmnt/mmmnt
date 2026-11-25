export interface GeneratedFeatureFile {
  readonly flowId: string;
  readonly filePath: string;
  readonly content: string;
  /** The number of `Scenario:` blocks in `content`. */
  readonly scenarioCount: number;
}
