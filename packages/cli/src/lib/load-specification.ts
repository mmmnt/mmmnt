import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
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

export const isDirectory = (path: string): boolean =>
  existsSync(path) && statSync(path).isDirectory();

/** The `.moment` files a path names: the file itself, or every one beneath a directory, sorted. */
export function specificationFiles(path: string): string[] {
  return isDirectory(path) ? momentFilesBeneath(path) : [path];
}

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

/** The text a command reads before parsing: nothing for a directory, which is loaded as a project instead. */
export function specificationText<R>(path: string, read: (p: string) => R): R | '' {
  return isDirectory(path) ? '' : read(path);
}

/** Parse a file's text, or load every `.moment` file beneath a directory as one project. */
export async function parseSpecification(path: string, content: string): Promise<ParseResult> {
  return isDirectory(path)
    ? loadSpecification(path)
    : new MomentParser().parseContent(content, path);
}
