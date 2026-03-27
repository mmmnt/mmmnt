import type { IntermediateRepresentation } from '@mmmnt/core';
import type { TestSuiteTopology } from '../types/index.js';
import { deriveTopology } from '../engine/derivation-engine.js';

export interface TopologyDerivedHook {
  (topology: TestSuiteTopology, ir: IntermediateRepresentation): void | Promise<void>;
}

export interface DeriveOnSpecificationParsedOptions {
  onTopologyDerived?: TopologyDerivedHook[];
}

export class DeriveOnSpecificationParsed {
  constructor(private readonly options?: DeriveOnSpecificationParsedOptions) {}

  async execute(ir: IntermediateRepresentation): Promise<TestSuiteTopology> {
    const topology = deriveTopology(ir);

    // Fire all hooks in parallel
    if (this.options?.onTopologyDerived) {
      await Promise.all(this.options.onTopologyDerived.map((hook) => hook(topology, ir)));
    }

    return topology;
  }
}
