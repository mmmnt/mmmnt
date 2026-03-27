import type { IntermediateRepresentation } from '@mmmnt/core';
import type { TestSuiteTopology } from '@mmmnt/derive';
import { TypeScriptEmitter } from '../services/typescript-emitter.js';
import type { TypeScriptEmitterOutput } from '../services/typescript-emitter.js';
import { TestScaffoldEmitter } from '../services/test-scaffold-emitter.js';
import type { TestScaffoldEmitterOutput } from '../services/test-scaffold-emitter.js';

export interface EmitTypeScriptResult {
  readonly typeScriptOutput: TypeScriptEmitterOutput;
  readonly scaffoldOutput: TestScaffoldEmitterOutput;
}

export class EmitTypeScriptOnTopologyDerived {
  private readonly tsEmitter = new TypeScriptEmitter();
  private readonly scaffoldEmitter = new TestScaffoldEmitter();

  execute(ir: IntermediateRepresentation, topology: TestSuiteTopology): EmitTypeScriptResult {
    const typeScriptOutput = this.tsEmitter.emit(ir, { scope: { level: 'system' } });
    const scaffoldOutput = this.scaffoldEmitter.emit(ir, topology);

    return { typeScriptOutput, scaffoldOutput };
  }
}
