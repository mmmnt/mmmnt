/**
 * moment init — Initialize a new Moment project
 *
 * Delegates to ManifestScaffolder from @mmmnt/core.
 * No manifest schema logic in the CLI layer (EXIT-C1).
 */

import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { ManifestScaffolder } from '@mmmnt/core';

export interface InitResult {
  readonly success: boolean;
  readonly message: string;
  readonly manifestPath?: string;
}

export function runInit(argv: string[]): InitResult {
  const { values } = parseArgs({
    args: argv,
    options: {
      name: { type: 'string', short: 'n' },
      dir: { type: 'string', short: 'd' },
    },
    strict: false,
  });

  const targetDir = resolve(typeof values.dir === 'string' ? values.dir : '.');
  const projectName = typeof values.name === 'string' ? values.name : 'my-moment-project';

  const scaffolder = new ManifestScaffolder();

  try {
    const result = scaffolder.scaffold(targetDir, { name: projectName });
    return {
      success: true,
      message: `Initialized Moment project '${projectName}' at ${targetDir}`,
      manifestPath: result.manifestPath,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      message: `Error: ${message}`,
    };
  }
}
