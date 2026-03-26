import type { FileRef } from './manifest-configuration.js';
import type { Diagnostic } from './parse-result.js';

export interface ImportResult {
  contextFiles: FileRef[];
  flowFiles: FileRef[];
  manifestEntries: FileRef[];
  fingerprint: UpstreamFingerprint;
  diagnostics: Diagnostic[];
}

export interface UpstreamFingerprint {
  source: string;
  version: string;
  hash: string;
  importedAt: string;
}
