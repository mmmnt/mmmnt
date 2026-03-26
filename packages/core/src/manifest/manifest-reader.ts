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
    const name = typeof obj.name === 'string' ? obj.name : '';
    const version = typeof obj.version === 'string' ? obj.version : '0.0.0';
    const description = typeof obj.description === 'string' ? obj.description : undefined;

    const contexts = this.parseFileRefs(obj.contexts);
    const flows = this.parseFileRefs(obj.flows);
    const generators = this.parseGenerators(obj.generators);
    const watch = this.parseWatch(obj.watch);

    this.validateFileRefs(manifestDir, contexts, flows);

    return { name, version, description, contexts, flows, generators, watch };
  }

  private parseFileRefs(entries: unknown): FileRef[] {
    if (entries == null) {
      return [];
    }
    if (!Array.isArray(entries)) {
      throw new Error('Manifest validation failed: file references must be an array.');
    }
    return entries.map((e, index) => {
      if (e == null || typeof e !== 'object' || Array.isArray(e)) {
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
      if (g == null || typeof g !== 'object' || Array.isArray(g)) {
        throw new Error(
          `Manifest validation failed: generator at index ${index} is not a valid object.`,
        );
      }
      const candidate = g as { format?: unknown; outputDir?: unknown };
      if (
        typeof candidate.format !== 'string' ||
        !ALLOWED_FORMATS.has(candidate.format as 'typescript')
      ) {
        throw new Error(
          `Manifest validation failed: invalid generator format '${candidate.format}' at index ${index}. Supported: ${[...ALLOWED_FORMATS].join(', ')}.`,
        );
      }
      if (candidate.outputDir !== undefined && typeof candidate.outputDir !== 'string') {
        throw new Error(
          `Manifest validation failed: 'outputDir' for generator at index ${index} must be a string.`,
        );
      }
      return {
        format: candidate.format as 'typescript' | 'gherkin' | 'markdown',
        outputDir: typeof candidate.outputDir === 'string' ? candidate.outputDir : '',
      };
    });
  }

  private parseWatch(raw: unknown): WatchConfiguration {
    if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
      return { enabled: false, debounceMs: 300, paths: [] };
    }
    const obj = raw as Record<string, unknown>;
    const enabled = typeof obj.enabled === 'boolean' ? obj.enabled : false;
    const debounceMs = typeof obj.debounceMs === 'number' ? obj.debounceMs : 300;
    const paths = Array.isArray(obj.paths)
      ? obj.paths.filter((p): p is string => typeof p === 'string')
      : [];
    return { enabled, debounceMs, paths };
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
