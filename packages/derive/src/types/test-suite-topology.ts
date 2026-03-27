import type { TestSuiteDefinition } from './test-suite-definition.js';
import type { TopologyMetadata } from './topology-metadata.js';

export interface TestSuiteTopology {
  readonly suites: TestSuiteDefinition[];
  readonly metadata: TopologyMetadata;
}
