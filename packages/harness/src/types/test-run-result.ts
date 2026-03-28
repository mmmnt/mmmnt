export interface TestRunResult {
  readonly suitesRun: number;
  readonly testsPassed: number;
  readonly testsFailed: number;
  readonly testsSkipped: number;
  readonly traceabilityMap: ReadonlyMap<string, string>;
}
