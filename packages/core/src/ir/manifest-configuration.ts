export interface ManifestConfiguration {
  name: string;
  version: string;
  description?: string;
  contexts: FileRef[];
  flows: FileRef[];
  generators: GeneratorConfig[];
  watch: WatchConfiguration;
}

export interface WatchConfiguration {
  enabled: boolean;
  debounceMs: number;
  paths: string[];
}

export interface FileRef {
  name: string;
  path: string;
}

export interface GeneratorConfig {
  format: 'typescript' | 'gherkin' | 'markdown';
  outputDir: string;
}
