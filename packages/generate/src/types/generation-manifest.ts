import type { GeneratedFeatureFile } from './generated-feature-file.js';
import type { GeneratedDocument } from './generated-document.js';

export interface GenerationManifest {
  readonly featuresGenerated: GeneratedFeatureFile[];
  readonly docsGenerated: GeneratedDocument[];
}
