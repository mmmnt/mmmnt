import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type {
  ManifestConfiguration,
  FileRef,
  GeneratorConfig,
  WatchConfiguration,
} from '../ir/index.js';

const ALLOWED_FORMATS = new Set(['typescript', 'gherkin', 'markdown'] as const);

export class ManifestReader {
  readManifest(manifestPath: string): ManifestConfiguration {
    if (!existsSync(manifestPath)) {
      throw new Error(`Manifest not found: ${manifestPath}`);
    }
    const content = readFileSync(manifestPath, 'utf-8');
    const raw = parseYaml(content);
    const manifestDir = dirname(manifestPath);

    if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error('Manifest validation failed: expected a YAML object at the root level.');
    }

    const obj = raw as Record<string, unknown>;
    const contexts = this.parseFileRefs(obj.contexts);
    const flows = this.parseFileRefs(obj.flows);
    const generators = this.parseGenerators(obj.generators);
    const watch = this.parseWatch(obj.watch);

    this.validateFileRefs(manifestDir, contexts, flows);

    return {
      name: (obj.name as string) ?? '',
      version: (obj.version as string) ?? '0.0.0',
      description: obj.description as string | undefined,
      contexts,
      flows,
      generators,
      watch,
    };
  }

  private parseFileRefs(entries: unknown): FileRef[] {
    if (entries == null) {
      return [];
    }
    if (!Array.isArray(entries)) {
      throw new Error('Manifest validation failed: file references must be an array.');
    }
    return entries.map((e, index) => {
      if (e == null || typeof e !== 'object') {
        throw new Error(
          `Manifest validation failed: file reference at index ${index} is not an object.`,
        );
      }
      const candidate = e as { name?: unknown; path?: unknown };
      if (typeof candidate.name !== 'string' || typeof candidate.path !== 'string') {
        throw new Error(
          `Manifest validation failed: file reference at index ${index} must have string 'name' and 'path'.`,
        );
      }
      return { name: candidate.name, path: candidate.path };
    });
  }

  private parseGenerators(entries: unknown): GeneratorConfig[] {
    if (entries == null) {
      return [];
    }
    if (!Array.isArray(entries)) {
      throw new Error('Manifest validation failed: generators must be an array.');
    }
    return entries.map((g, index) => {
      const candidate = g as { format?: string; outputDir?: string };
      if (!candidate.format || !ALLOWED_FORMATS.has(candidate.format as 'typescript')) {
        throw new Error(
          `Manifest validation failed: invalid generator format '${candidate.format}' at index ${index}. Supported: ${[...ALLOWED_FORMATS].join(', ')}.`,
        );
      }
      return {
        format: candidate.format as 'typescript' | 'gherkin' | 'markdown',
        outputDir: candidate.outputDir ?? '',
      };
    });
  }

  private parseWatch(raw: unknown): WatchConfiguration {
    if (raw == null || typeof raw !== 'object') {
      return { enabled: false, debounceMs: 300, paths: [] };
    }
    const obj = raw as { enabled?: boolean; debounceMs?: number; paths?: string[] };
    return {
      enabled: obj.enabled ?? false,
      debounceMs: obj.debounceMs ?? 300,
      paths: obj.paths ?? [],
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
