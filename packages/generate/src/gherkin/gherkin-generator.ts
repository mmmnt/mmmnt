import type { IntermediateRepresentation } from '@mmmnt/core';
import type { TestSuiteTopology, TestSuiteDefinition } from '@mmmnt/derive';
import type {
  GenerationManifest,
  GeneratedFeatureFile,
  GeneratedDocument,
} from '../types/index.js';
import { renderFeature } from './feature-renderer.js';

/**
 * GherkinGenerator consumes an IntermediateRepresentation and a TestSuiteTopology
 * and produces a GenerationManifest containing .feature files and documents.
 *
 * Domain rules:
 *  - GN-01: Every flow produces a .feature file
 *  - GN-02: Step keywords match node types (Given=precondition, When=command, Then=event/assertion)
 *  - GN-03: Exact specification vocabulary preserved
 *  - Deterministic: same IR+topology yields the same output
 */
export class GherkinGenerator {
  generate(ir: IntermediateRepresentation, topology: TestSuiteTopology): GenerationManifest {
    // IR is accepted for API stability — future use for glossary/vocabulary lookups.
    // Currently topology carries all data needed for generation.
    void ir;
    const featuresGenerated: GeneratedFeatureFile[] = topology.suites.map((suite) =>
      this.generateFeatureFile(suite),
    );

    const docsGenerated: GeneratedDocument[] = [];

    return { featuresGenerated, docsGenerated };
  }

  private generateFeatureFile(suite: TestSuiteDefinition): GeneratedFeatureFile {
    const content = renderFeature(suite);
    const scenarioCount = this.countScenarios(suite);

    return {
      flowId: suite.flowId,
      filePath: `features/${safeFileName(suite.flowName)}.feature`,
      content,
      scenarioCount,
    };
  }

  private countScenarios(suite: TestSuiteDefinition): number {
    return suite.testCases.length;
  }
}

function safeFileName(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[^a-z0-9-]/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}
