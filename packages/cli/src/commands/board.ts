/**
 * moment board: project a model onto the NDD board (ADR-047)
 *
 * Reads the model as the other commands do (a file, or a project directory), and writes one Canvas
 * Composer SVG per frame plus `manifest.json` to `--out`. Nothing is written for a model that does
 * not parse. The command never talks to Miro.
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { boardFiles, projectBoard } from '@mmmnt/board';
import type { Diagnostic } from '@mmmnt/core';
import { loadSpecification } from '../lib/load-specification.js';

export interface BoardCommandResult {
  readonly success: boolean;
  readonly message: string;
  readonly diagnostics: readonly Diagnostic[];
  readonly filePath?: string;
  readonly files?: readonly string[];
}

const USAGE = 'Usage: moment board <path> --out <dir> [--frame <id>]';

function fail(
  message: string,
  diagnostics: readonly Diagnostic[] = [],
  filePath?: string,
): BoardCommandResult {
  return { success: false, message, diagnostics, ...(filePath !== undefined && { filePath }) };
}

function option(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export async function runBoard(argv: string[]): Promise<BoardCommandResult> {
  const { positionals, values } = parseArgs({
    args: argv,
    options: { out: { type: 'string' }, frame: { type: 'string' } },
    allowPositionals: true,
    strict: false,
  });
  const path = positionals[0];
  const out = option(values.out);
  if (!path || !out) return fail(USAGE);

  const resolved = resolve(path);
  if (!existsSync(resolved)) return fail(`Error: File not found: ${resolved}`);
  const loaded = await loadSpecification(resolved);
  if (!loaded.success || !loaded.ir) {
    return fail(
      `Parse failed with ${loaded.diagnostics.length} diagnostic(s)`,
      loaded.diagnostics,
      resolved,
    );
  }
  const frame = option(values.frame);
  const projection = projectBoard(loaded.ir);
  if (frame !== undefined && !projection.frames.some((f) => f.id === frame)) {
    return fail(
      `Error: no frame ${frame}; frames are ${projection.frames.map((f) => f.id).join(', ')}`,
    );
  }

  const files = boardFiles(projection, frame);
  mkdirSync(resolve(out), { recursive: true });
  for (const [name, text] of files) writeFileSync(join(resolve(out), name), text);
  return {
    success: true,
    message: `Board written to ${resolve(out)}: ${files.size - 1} frame(s) and manifest.json (${projection.manifest.nodes.length} node(s))`,
    diagnostics: [],
    filePath: resolved,
    files: [...files.keys()],
  };
}
