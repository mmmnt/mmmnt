import type { IntermediateRepresentation } from '@mmmnt/core';
import type { TestSuiteTopology } from '@mmmnt/derive';
import type { GenerationManifest } from '../types/index.js';
import { GherkinGenerator } from '../gherkin/gherkin-generator.js';
import { SpecificationDocumentGenerator } from '../services/specification-document-generator.js';

/**
 * GenerateGherkinOnTopologyDerived is a policy that reacts to a derived
 * TestSuiteTopology by generating Gherkin .feature files and specification
 * documents.
 *
 * It invokes both:
 *  - GherkinGenerator  (topology -> .feature files)
 *  - SpecificationDocumentGenerator (IR -> spec markdown docs)
 *
 * and returns a combined GenerationManifest.
 *
 * Designed to be used as a TopologyDerivedHook callback from
 * DeriveOnSpecificationParsed.
 */
export class GenerateGherkinOnTopologyDerived {
  private readonly gherkinGenerator = new GherkinGenerator();
  private readonly specDocGenerator = new SpecificationDocumentGenerator();

  execute(ir: IntermediateRepresentation, topology: TestSuiteTopology): GenerationManifest {
    const gherkinManifest = this.gherkinGenerator.generate(ir, topology);
    const docs = this.specDocGenerator.generate(ir);

    return {
      featuresGenerated: gherkinManifest.featuresGenerated,
      docsGenerated: [...gherkinManifest.docsGenerated, ...docs],
    };
  }
}
