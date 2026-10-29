import { MomentParser, isDirectory, loadSpecification } from '@mmmnt/core';
import type { ParseResult } from '@mmmnt/core';

// The loader lives in @mmmnt/core so the CLI and the MCP server read a model the same way.
export {
  isDirectory,
  loadSpecification,
  specificationFiles,
  type LoadedSpecification,
} from '@mmmnt/core';

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
