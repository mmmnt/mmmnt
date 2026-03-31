/**
 * ManifestScaffolder — Domain Service
 *
 * Creates the initial Moment project structure:
 * - .manifest.yaml with valid schema per ManifestConfiguration
 * - .moment/contexts/ directory
 * - .moment/flows/ directory
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { stringify as stringifyYaml } from 'yaml';
import type { ManifestConfiguration } from '../ir/manifest-configuration.js';

export interface ScaffoldOptions {
  readonly name: string;
  readonly version?: string;
  readonly description?: string;
}

export interface ScaffoldResult {
  readonly manifestPath: string;
  readonly directoriesCreated: readonly string[];
}

export class ManifestScaffolder {
  scaffold(targetDir: string, options: ScaffoldOptions): ScaffoldResult {
    const manifestPath = join(targetDir, '.manifest.yaml');

    const manifest: ManifestConfiguration = {
      name: options.name,
      version: options.version ?? '0.0.0',
      ...(options.description ? { description: options.description } : {}),
      contexts: [],
      flows: [],
      generators: [
        { format: 'typescript', outputDir: 'src/generated' },
        { format: 'gherkin', outputDir: 'tests/features' },
        { format: 'markdown', outputDir: 'docs' },
      ],
      watch: {
        enabled: true,
        debounceMs: 300,
        paths: ['.moment/contexts', '.moment/flows'],
      },
    };

    const contextsDir = join(targetDir, '.moment', 'contexts');
    const flowsDir = join(targetDir, '.moment', 'flows');

    mkdirSync(contextsDir, { recursive: true });
    mkdirSync(flowsDir, { recursive: true });

    const yamlContent = stringifyYaml(manifest);
    try {
      writeFileSync(manifestPath, yamlContent, { encoding: 'utf-8', flag: 'wx' });
    } catch (err: unknown) {
      if (err instanceof Error && 'code' in err && err.code === 'EEXIST') {
        throw new Error(
          `Manifest already exists at ${manifestPath}. Use a different directory or remove the existing manifest.`,
        );
      }
      throw err;
    }

    return {
      manifestPath,
      directoriesCreated: [contextsDir, flowsDir],
    };
  }
}
