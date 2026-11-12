/**
 * moment board: project a model onto the NDD board (ADR-047)
 *
 * Reads the model as the other commands do (a file, or a project directory), and writes one Canvas
 * Composer SVG per frame plus `manifest.json` to `--out`. Nothing is written for a model that does
 * not parse. The command never talks to Miro.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { BoardNumberingError, BoardPointerError, boardFiles, projectBoard } from '@mmmnt/board';
import type { BoardProjection, Pointer } from '@mmmnt/board';
import { ManifestReader } from '@mmmnt/core';
import type { Diagnostic, IntermediateRepresentation } from '@mmmnt/core';
import { loadSpecification } from '../lib/load-specification.js';

export interface BoardCommandResult {
  readonly success: boolean;
  readonly message: string;
  readonly diagnostics: readonly Diagnostic[];
  readonly filePath?: string;
  readonly files?: readonly string[];
  readonly notices?: readonly string[];
  readonly projection?: BoardProjection;
}

const USAGE = 'Usage: moment board <path> --out <dir> [--frame <id>] [--pointers <file>]';

function fail(
  message: string,
  diagnostics: readonly Diagnostic[] = [],
  filePath?: string,
): BoardCommandResult {
  return { success: false, message, diagnostics, ...(filePath !== undefined && { filePath }) };
}

/** The contexts in the order `manifest.yaml` lists them, for a project directory that has one. */
function contextOrder(path: string): string[] | undefined {
  const manifest = join(path, 'manifest.yaml');
  if (!existsSync(manifest)) return undefined;
  try {
    return new ManifestReader().readManifest(manifest).contexts.map((c) => c.name);
  } catch {
    return undefined;
  }
}

function readPointers(file: string | undefined): { pointers?: Pointer[] } {
  if (file === undefined) return {};
  const parsed = JSON.parse(readFileSync(resolve(file), 'utf-8')) as { pointers?: Pointer[] };
  return { pointers: parsed.pointers ?? [] };
}

function option(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

type Projected = { projection: BoardProjection } | { failure: BoardCommandResult };

function project(
  resolved: string,
  ir: IntermediateRepresentation,
  pointersFile: string | undefined,
): Projected {
  try {
    const order = contextOrder(resolved);
    return {
      projection: projectBoard(ir, {
        ...(order && { contextOrder: order }),
        ...readPointers(pointersFile),
      }),
    };
  } catch (error) {
    if (error instanceof BoardNumberingError || error instanceof BoardPointerError) {
      return { failure: fail(`Error: ${error.message}`, [], resolved) };
    }
    throw error;
  }
}

export async function runBoard(argv: string[]): Promise<BoardCommandResult> {
  const { positionals, values } = parseArgs({
    args: argv,
    options: { out: { type: 'string' }, frame: { type: 'string' }, pointers: { type: 'string' } },
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
  const projected = project(resolved, loaded.ir, option(values.pointers));
  if ('failure' in projected) return projected.failure;
  const { projection } = projected;
  const frame = option(values.frame);
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
    message: `Board written to ${resolve(out)}: ${files.size - 1} file(s) and manifest.json (${projection.manifest.frames.length} frame(s), ${projection.manifest.nodes.length} node(s))`,
    diagnostics: [],
    filePath: resolved,
    files: [...files.keys()],
    notices: projection.notices,
    projection,
  };
}
