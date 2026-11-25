import type { IntermediateRepresentation } from '@mmmnt/core';
import type { TestSuiteTopology } from '@mmmnt/derive';
import type {
  GenerationManifest,
  GeneratedFeatureFile,
  GeneratedDocument,
} from '../types/index.js';
import { renderFeature } from './feature-renderer.js';

/**
 * GherkinGenerator produces .feature files from the IR's flows.
 *
 * Domain rules:
 *  - GN-01: Every flow produces a .feature file
 *  - GN-02: Given=precondition, When=command, Then=event
 *  - GN-03: Exact specification vocabulary preserved
 *  - Deterministic: same IR yields the same output
 *  - scenarioCount is the number of `Scenario:` blocks in content
 */
export class GherkinGenerator {
  generate(ir: IntermediateRepresentation, topology: TestSuiteTopology): GenerationManifest {
    // topology accepted for API compatibility
    void topology;

    const featuresGenerated: GeneratedFeatureFile[] = ir.flows.map((flow) => {
      const { content, scenarioCount } = renderFeature(flow, ir);
      return {
        flowId: flow.id,
        filePath: `features/${safeFileName(flow.name)}.feature`,
        content,
        scenarioCount,
      };
    });

    const docsGenerated: GeneratedDocument[] = [];
    return { featuresGenerated, docsGenerated };
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
