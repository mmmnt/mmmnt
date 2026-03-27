export type {
  GenerationScope,
  GenerationResult,
  TypeScriptConvention,
  TestScaffoldResult,
} from './types/index.js';

export { TypeScriptEmitter } from './services/typescript-emitter.js';
export type { EmitOptions, TypeScriptEmitterOutput } from './services/typescript-emitter.js';

export { TestScaffoldEmitter } from './services/test-scaffold-emitter.js';
export type { TestScaffoldEmitterOutput } from './services/test-scaffold-emitter.js';

export { EmitTypeScriptOnTopologyDerived } from './policies/emit-typescript-on-topology-derived.js';
export type { EmitTypeScriptResult } from './policies/emit-typescript-on-topology-derived.js';
