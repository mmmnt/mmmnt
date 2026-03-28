export interface TestRunResult {
  readonly suitesRun: number;
  readonly testsPassed: number;
  readonly testsFailed: number;
  readonly testsSkipped: number;
  readonly traceabilityMap: Readonly<Record<string, string>>;
}
