export * from './ir/index.js';
export * from './services/index.js';
export { ManifestReader, ManifestScaffolder, ManifestUpdater } from './manifest/index.js';
export type { ScaffoldOptions, ScaffoldResult, ManifestUpdateResult } from './manifest/index.js';
export { MomentParser } from './parser/index.js';
export { astToIr } from './parser/ast-to-ir.js';
export { FileWatcher, type FileWatcherOptions } from './infrastructure/index.js';
export { RegenerateOnMomentFileChanged, type RegenerateResult } from './policies/index.js';
export {
  SiftSpecificationImporter,
  type SiftBuildingBlock,
  type SiftTimelineEvent,
  type SiftImportInput,
} from './import/index.js';
export { ProjectLoader, mergeIrs, validateCrossFileReferences } from './project/index.js';
export type { ProjectLoadResult, MergeResult, CrossFileValidationResult } from './project/index.js';
export { GeneratorRegistry } from './generators/index.js';
export type {
  GeneratorDescriptor,
  GeneratorRunContext,
  GeneratorRunResult,
  GeneratorScope,
} from './generators/index.js';
