import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type {
  ManifestConfiguration,
  FileRef,
  GeneratorConfig,
  WatchConfiguration,
} from '../ir/index.js';

export class ManifestReader {
  readManifest(manifestPath: string): ManifestConfiguration {
    if (!existsSync(manifestPath)) {
      throw new Error(`Manifest not found: ${manifestPath}`);
    }
    const content = readFileSync(manifestPath, 'utf-8');
    const raw = parseYaml(content);
    const manifestDir = dirname(manifestPath);

    const contexts = this.parseFileRefs(raw.contexts);
    const flows = this.parseFileRefs(raw.flows);
    const generators = this.parseGenerators(raw.generators);
    const watch = this.parseWatch(raw.watch);

    this.validateFileRefs(manifestDir, contexts, flows);

    return {
      name: raw.name ?? '',
      version: raw.version ?? '0.0.0',
      description: raw.description,
      contexts,
      flows,
      generators,
      watch,
    };
  }

  private parseFileRefs(entries: { name: string; path: string }[] | undefined): FileRef[] {
    return (entries ?? []).map((e) => ({ name: e.name, path: e.path }));
  }

  private parseGenerators(
    entries: { format: string; outputDir: string }[] | undefined,
  ): GeneratorConfig[] {
    return (entries ?? []).map((g) => ({
      format: g.format as 'typescript' | 'gherkin' | 'markdown',
      outputDir: g.outputDir,
    }));
  }

  private parseWatch(
    raw: { enabled?: boolean; debounceMs?: number; paths?: string[] } | undefined,
  ): WatchConfiguration {
    if (!raw) {
      return { enabled: false, debounceMs: 300, paths: [] };
    }
    return {
      enabled: raw.enabled ?? false,
      debounceMs: raw.debounceMs ?? 300,
      paths: raw.paths ?? [],
    };
  }

  private validateFileRefs(manifestDir: string, contexts: FileRef[], flows: FileRef[]): void {
    const diagnostics: string[] = [];
    for (const ctx of contexts) {
      const fullPath = resolve(manifestDir, ctx.path);
      if (!existsSync(fullPath)) {
        diagnostics.push(`SP-05: Context file '${ctx.path}' does not exist at ${fullPath}`);
      }
    }
    for (const flow of flows) {
      const fullPath = resolve(manifestDir, flow.path);
      if (!existsSync(fullPath)) {
        diagnostics.push(`SP-05: Flow file '${flow.path}' does not exist at ${fullPath}`);
      }
    }
    if (diagnostics.length > 0) {
      throw new Error(`Manifest validation failed:\n${diagnostics.join('\n')}`);
    }
  }
}
