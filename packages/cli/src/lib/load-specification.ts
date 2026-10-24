import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { MomentParser, ProjectLoader } from '@mmmnt/core';
import type { ParseResult } from '@mmmnt/core';

/** A loaded specification: one file, or every `.moment` file beneath a directory (ADR-037 §8). */
export interface LoadedSpecification extends ParseResult {
  readonly isProject: boolean;
  readonly files: readonly string[];
}

function momentFilesBeneath(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return momentFilesBeneath(path);
      return entry.isFile() && entry.name.endsWith('.moment') ? [path] : [];
    })
    .sort();
}

export const isDirectory = (path: string): boolean => statSync(path).isDirectory();

/** Load a path that exists: a directory as a project through ProjectLoader, a file through MomentParser. */
export async function loadSpecification(path: string): Promise<LoadedSpecification> {
  if (isDirectory(path)) {
    const files = momentFilesBeneath(path);
    const project = await new ProjectLoader().loadProject(files);
    return {
      success: project.success,
      ir: project.ir,
      diagnostics: [...project.diagnostics],
      isProject: true,
      files,
    };
  }
  const result = await new MomentParser().parseContent(readFileSync(path, 'utf-8'), path);
  return { ...result, isProject: false, files: [path] };
}
